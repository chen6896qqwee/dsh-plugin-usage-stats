/**
 * scan.js — enumerate / decompress / parse DSH session logs (BRIEF §3 data source).
 *
 * Disk layout (verified against real data):
 *   <DSH_HOME>/sessions/<workspace-key>/<session-id>/session.v4.jsonl.zstd
 *
 * Each file is a zstd stream whose payload is JSONL: one JSON event per line.
 * Events we care about (BRIEF §3):
 *   assistant/message  data.usage = {inputTokens, outputTokens, totalTokens, cacheReadTokens?}
 *                      data.message.source = {kind:'model', provider, model}
 *   step/start       data.{turn, step}   — paired with step/end to get active time
 *   step/end         data.{turn, step}
 *   turn/start       data.{turn}
 *   turn/end         data.{turn}
 *
 * Design notes:
 * - Zero dependencies: node:fs / node:path / node:zlib (zstdDecompressSync).
 * - Fast path: a line's event type is read from its raw prefix, so the ~thousands of
 *   large `tool/result` / `tool/call` / `job/*` lines are never JSON.parse'd.
 * - Tolerant by contract: an unreadable/unparsable session file never throws; it is
 *   recorded in `errors[]` and skipped (BRIEF §3「容错」).
 */

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { decompressZstd } from './zstd.js'

export const SESSION_FILE_NAME = 'session.v4.jsonl.zstd'
export const SESSIONS_DIR_NAME = 'sessions'

/** Event types the folder consumes. Everything else is skipped without a full parse. */
const KEPT_EVENT_TYPES = new Set([
  'assistant/message',
  'step/start',
  'step/end',
  'turn/start',
  'turn/end',
])

const TYPE_MARKER = '"type":"'
// Event envelopes put type/seq/time first on the line (verified on real logs); we only
// look at a bounded prefix so huge `stream` payloads never get scanned twice.
const PREFIX_SCAN = 240

/** Read the event type string from the raw line prefix, or null when unknown. */
function readRawType(line) {
  const at = line.indexOf(TYPE_MARKER)
  if (at < 0 || at > PREFIX_SCAN) return null
  const from = at + TYPE_MARKER.length
  const end = line.indexOf('"', from)
  if (end < 0) return null
  return line.slice(from, end)
}

/** Read the envelope `time` (epoch ms) from the raw line prefix, or null. */
function readRawTime(line) {
  const limit = Math.min(line.length, PREFIX_SCAN)
  const at = line.indexOf('"time":', 0)
  if (at < 0 || at > limit) return null
  const m = /^"time":(\d{10,16})/.exec(line.slice(at, at + 32))
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Normalize one parsed `assistant/message` event into a usage record, or null. */
export function extractUsage(ev) {
  const data = ev && ev.data
  if (!data || !data.usage) return null
  const usage = data.usage
  const inputTokens = num(usage.inputTokens) ?? 0
  const outputTokens = num(usage.outputTokens) ?? 0
  const cacheReadTokens = num(usage.cacheReadTokens) ?? 0
  const total = num(usage.totalTokens)
  const tokens = total !== null ? total : inputTokens + outputTokens
  const source = (data.message && data.message.source) || null
  const provider = (source && typeof source.provider === 'string' && source.provider) || '?'
  const model = (source && typeof source.model === 'string' && source.model) || '?'
  return {
    time: num(ev.time),
    provider,
    model,
    tokens,
    inputTokens,
    outputTokens,
    cacheReadTokens,
  }
}

/**
 * Parse a decompressed session log into the kept events plus counters.
 * @param {string} text JSONL text
 * @returns {{events: object[], totalEvents: number, badLines: number}}
 */
export function parseSessionText(text) {
  const events = []
  let totalEvents = 0
  let badLines = 0
  // split('\n') keeps this simple and fast enough for a few MB per file.
  const lines = String(text).split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    totalEvents++
    const rawType = readRawType(line)
    if (rawType !== null && !KEPT_EVENT_TYPES.has(rawType)) {
      // Skipped without parsing: still record envelope time so session spans stay accurate.
      const t = readRawTime(line)
      if (t !== null) events.push({ type: rawType, time: t, skipped: true })
      continue
    }
    let ev
    try {
      ev = JSON.parse(line)
    } catch {
      badLines++
      continue
    }
    if (!ev || typeof ev !== 'object') {
      badLines++
      continue
    }
    if (!KEPT_EVENT_TYPES.has(ev.type)) {
      // Unknown prefix: fall back to the parsed envelope time only.
      if (num(ev.time) !== null) events.push({ type: ev.type || '?', time: num(ev.time), skipped: true })
      continue
    }
    events.push(ev)
  }
  return { events, totalEvents, badLines }
}

function stepKey(data, fallbackIndex) {
  const turn = data && num(data.turn)
  const step = data && num(data.step)
  if (turn !== null && step !== null) return `t${turn}s${step}`
  return `#${fallbackIndex}`
}

/**
 * Turn raw kept events into the per-session record consumed by fold.js.
 * @param {{file: string, workspaceKey: string|null, sessionId: string|null, events: object[]}} input
 */
export function normalizeSession({ file, workspaceKey = null, sessionId = null, events = [] }) {
  const session = {
    file: file || null,
    workspaceKey,
    sessionId,
    firstTime: null,
    lastTime: null,
    activeMs: 0,
    turnStarts: 0,
    stepStarts: 0,
    stepCount: 0,
    usages: [],
    title: null,
  }

  const openSteps = new Map()
  const completedSteps = []
  let eventIndex = 0

  for (const ev of events) {
    if (!ev) continue
    const time = num(ev.time)
    if (time !== null) {
      if (session.firstTime === null || time < session.firstTime) session.firstTime = time
      if (session.lastTime === null || time > session.lastTime) session.lastTime = time
    }
    if (ev.skipped) continue
    const data = ev.data || {}
    switch (ev.type) {
      case 'assistant/message': {
        const usage = extractUsage(ev)
        if (usage) {
          if (usage.time === null) usage.time = time
          session.usages.push(usage)
        }
        break
      }
      case 'step/start': {
        session.stepStarts++
        const key = stepKey(data, eventIndex++)
        if (time !== null) {
          // Keep the latest start for a repeated key (defensive; keys are unique in practice).
          openSteps.set(key, time)
        }
        break
      }
      case 'step/end': {
        const key = stepKey(data, eventIndex++)
        const start = openSteps.get(key)
        if (start !== undefined) {
          openSteps.delete(key)
          if (time !== null && time >= start) {
            completedSteps.push(time - start)
            session.activeMs += time - start
          } else if (time !== null) {
            completedSteps.push(0)
          }
        }
        break
      }
      case 'turn/start': {
        session.turnStarts++
        break
      }
      case 'turn/end': {
        break
      }
      default:
        break
    }
  }

  session.stepCount = completedSteps.length
  session.unclosedSteps = openSteps.size
  return session
}

/** True when `dir` holds session files shaped like a DSH sessions root. */
function looksLikeSessionsRoot(dir) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return false
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    let childEntries
    try {
      childEntries = fs.readdirSync(path.join(dir, entry.name), { withFileTypes: true })
    } catch {
      continue
    }
    for (const child of childEntries) {
      if (!child.isDirectory()) continue
      try {
        if (fs.statSync(path.join(dir, entry.name, child.name, SESSION_FILE_NAME)).isFile()) return true
      } catch {
        /* keep looking */
      }
    }
  }
  return false
}

/**
 * Resolve the directory that directly contains `<workspace-key>/<session-id>/` folders.
 * Accepts either DSH_HOME (then uses `<homeDir>/sessions`) or the sessions root itself.
 */
export function resolveSessionsDir(homeDir) {
  const base = homeDir ? path.resolve(String(homeDir)) : null
  if (!base) return null
  if (path.basename(base) === SESSIONS_DIR_NAME) {
    try {
      if (fs.statSync(base).isDirectory()) return base
    } catch {
      /* fall through */
    }
  }
  const nested = path.join(base, SESSIONS_DIR_NAME)
  try {
    if (fs.statSync(nested).isDirectory()) return nested
  } catch {
    /* fall through */
  }
  if (looksLikeSessionsRoot(base)) return base
  return nested
}

/**
 * Enumerate every session log file under the sessions root.
 * @returns {{files: {file: string, workspaceKey: string|null, sessionId: string|null}[], errors: object[]}}
 */
export function discoverSessionFiles(homeDir, sessionsDir = undefined) {
  const dir = sessionsDir ? path.resolve(String(sessionsDir)) : resolveSessionsDir(homeDir)
  const errors = []
  if (!dir) return { dir: null, files: [], errors }
  let workspaceKeys
  try {
    workspaceKeys = fs.readdirSync(dir, { withFileTypes: true })
  } catch (err) {
    // A missing sessions directory is the legitimate "brand new home" case (0 sessions),
    // not an error worth surfacing. Anything else (EACCES...) is diagnostic.
    if (err && err.code !== 'ENOENT') {
      errors.push({ scope: 'sessions-root', file: dir, message: String((err && err.message) || err) })
    }
    return { dir, files: [], errors }
  }

  const files = []
  for (const wsEntry of workspaceKeys) {
    if (!wsEntry.isDirectory()) continue
    const wsDir = path.join(dir, wsEntry.name)
    let sessionIds
    try {
      sessionIds = fs.readdirSync(wsDir, { withFileTypes: true })
    } catch (err) {
      errors.push({ scope: 'workspace', file: wsDir, message: String((err && err.message) || err) })
      continue
    }
    for (const sidEntry of sessionIds) {
      if (!sidEntry.isDirectory()) continue
      const file = path.join(wsDir, sidEntry.name, SESSION_FILE_NAME)
      let stat
      try {
        stat = fs.statSync(file)
      } catch {
        continue // no session log yet — normal for freshly created sessions
      }
      if (!stat.isFile()) continue
      files.push({
        file,
        workspaceKey: wsEntry.name,
        sessionId: sidEntry.name,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      })
    }
  }
  files.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
  return { dir, files, errors }
}

/**
 * Decompress one session log. Throws on corrupt input; caller maps it into errors[].
 *
 * A session log is a *concatenation* of zstd frames (one per append). The Node
 * shipped with DSH (24.21) decodes only the first frame per call, so we walk
 * the frames ourselves — see ./zstd.js for why and how.
 */
export function decompressSession(file) {
  const bytes = fs.readFileSync(file)
  return decompressZstd(bytes)
}

/**
 * Scan a DSH home (or sessions root): enumerate, decompress, parse, normalize.
 * @param {{homeDir?: string, sessionsDir?: string}} options
 * @returns {{sessions: object[], errors: object[], meta: object}}
 */
export function scanSessions(options = {}) {
  const startedAt = Date.now()
  const { dir, files, errors } = discoverSessionFiles(options.homeDir, options.sessionsDir)
  const sessions = []
  let compressedBytes = 0
  let textChars = 0
  let totalEvents = 0
  let badLines = 0
  let unreadable = 0

  for (const entry of files) {
    let text
    try {
      text = decompressSession(entry.file)
    } catch (err) {
      unreadable++
      errors.push({
        scope: 'session',
        file: entry.file,
        workspaceKey: entry.workspaceKey,
        sessionId: entry.sessionId,
        message: `decompress/read failed: ${String((err && err.message) || err)}`,
      })
      continue
    }
    compressedBytes += entry.size || 0
    textChars += text.length
    const parsed = parseSessionText(text)
    totalEvents += parsed.totalEvents
    badLines += parsed.badLines
    if (parsed.badLines > 0) {
      errors.push({
        scope: 'session-lines',
        file: entry.file,
        workspaceKey: entry.workspaceKey,
        sessionId: entry.sessionId,
        message: `${parsed.badLines} unparsable JSONL line(s) skipped`,
      })
    }
    sessions.push(
      normalizeSession({
        file: entry.file,
        workspaceKey: entry.workspaceKey,
        sessionId: entry.sessionId,
        events: parsed.events,
      }),
    )
  }

  return {
    sessions,
    errors,
    meta: {
      sessionsDir: dir,
      files: files.length,
      scanned: sessions.length,
      unreadable,
      compressedBytes,
      textChars,
      totalEvents,
      badLines,
      ms: Date.now() - startedAt,
    },
  }
}


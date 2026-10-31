/**
 * stats.js — the single entry point the Host half of the plugin calls (BRIEF §3).
 *
 *   collectUsageStats({ homeDir, now, tz, ... }) -> UsageStats payload
 *
 * It glues scan.js (IO over <DSH_HOME>/sessions) to fold.js (pure folding) and adds:
 *   - default home resolution: options.homeDir > $DSH_HOME > <os.homedir()>/.dsh
 *   - optional in-process memo (ttlMs, default OFF) so a caller can decide who owns caching
 *     (lib/index.js is the documented owner of the 60s TTL cache, so by default every call
 *     recomputes and `refresh()` is always fresh);
 *   - diagnostics via `getLastScanMeta()` — never added to the payload (contract is fixed).
 *
 * No CLI, no side effects beyond reading files.
 */

import os from 'node:os'
import path from 'node:path'
import { scanSessions } from './scan.js'
import { foldSessions } from './fold.js'

export { SESSION_FILE_NAME, SESSIONS_DIR_NAME, resolveSessionsDir, discoverSessionFiles, scanSessions } from './scan.js'
export { foldSessions, labelForModel, detectTimeZone, localDateKey, DAYS_IN_HISTORY, RANGE_WINDOWS } from './fold.js'

/** @type {{key: string|null, at: number, value: object|null}} */
let memo = { key: null, at: 0, value: null }
/** @type {object|null} */
let lastScanMeta = null

/** Resolve DSH_HOME: explicit option > $DSH_HOME > <os.homedir()>/.dsh. */
export function resolveHomeDir(homeDir = undefined) {
  if (homeDir) return path.resolve(String(homeDir))
  const fromEnv = process.env.DSH_HOME
  if (fromEnv && String(fromEnv).trim()) return path.resolve(String(fromEnv).trim())
  return path.join(os.homedir(), '.dsh')
}

function toEpochMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime()
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

/** Drop the in-process memo (tests / forced refresh). */
export function clearUsageStatsCache() {
  memo = { key: null, at: 0, value: null }
}

/** Metadata of the most recent scan (`{sessionsDir, files, scanned, ...}`), for diagnostics. */
export function getLastScanMeta() {
  return lastScanMeta
}

/**
 * Collect the UsageStats payload.
 *
 * @param {{
 *   homeDir?: string,       // DSH_HOME (contains `sessions/`) or the sessions root itself
 *   sessionsDir?: string,   // explicit override for <DSH_HOME>/sessions
 *   now?: number|Date,      // "today" anchor; defaults to Date.now()
 *   tz?: string,            // label for payload.timeZone; default = host IANA zone
 *   ttlMs?: number,         // optional in-process memo TTL (default 0 = disabled)
 *   force?: boolean,        // ignore the memo and recompute
 *   generatedAt?: number,   // payload.generatedAt override (deterministic fixtures)
 *   version?: number,
 * }} [options]
 * @returns {object} BRIEF §3 payload — plain JSON, safe to serialize over the remote hop
 */
export function collectUsageStats(options = {}) {
  const homeDir = resolveHomeDir(options.homeDir)
  const sessionsDir = options.sessionsDir ? path.resolve(String(options.sessionsDir)) : null
  const cacheKey = `${homeDir}::${sessionsDir || ''}`
  const ttlMs = Number.isFinite(options.ttlMs) && options.ttlMs > 0 ? options.ttlMs : 0
  const nowWallClock = Date.now()

  if (ttlMs > 0 && !options.force && memo.key === cacheKey && memo.value && nowWallClock - memo.at < ttlMs) {
    return memo.value
  }

  const now = toEpochMs(options.now) ?? nowWallClock
  const scan = scanSessions({ homeDir, sessionsDir: sessionsDir || undefined })
  lastScanMeta = scan.meta

  const payload = foldSessions(scan.sessions, {
    now,
    tz: options.tz,
    generatedAt: toEpochMs(options.generatedAt) ?? nowWallClock,
    errors: scan.errors,
    version: options.version,
  })

  if (ttlMs > 0) memo = { key: cacheKey, at: nowWallClock, value: payload }
  return payload
}

export default collectUsageStats

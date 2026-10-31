#!/usr/bin/env node
/**
 * selftest.fixtures.mjs — synthetic-fixture suite for dsh-plugin-usage-stats (Host half).
 *
 * Driven by `fixtures/manifest.json`. Each manifest entry is materialized into a throwaway
 * DSH home as `<home>/sessions/<workspace>/<session>/session.v4.jsonl.zstd`:
 *
 *  - `at` in the source JSONL is a LOCAL date-time (no offset). It is rewritten into the
 *    epoch-ms envelope field `time`, which is what the scanner reads — that is what makes
 *    these fixtures host-time-zone independent (they assert LOCAL day bucketing wherever
 *    the suite runs).
 *  - `source` points at a readable JSONL fixture; `content` is used verbatim as raw bytes
 *    (that is how the corrupt-file case is built).
 *
 * No third-party dependencies. Exit code 0 = all checks passed.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.join(HERE, 'fixtures')
const SESSION_FILE_NAME = 'session.v4.jsonl.zstd'

/* ------------------------------------------------------------------ building */

/** Parse a manifest `at` (local date-time) into epoch ms. */
function localAtToMs(at, where) {
  const ms = Date.parse(at)
  if (!Number.isFinite(ms)) throw new Error(`bad 'at' in ${where}: ${String(at)}`)
  return ms
}

/**
 * Rewrite one source JSONL line: `at` (local date-time) -> `time` (epoch ms), first in the
 * envelope so the scanner's bounded prefix scan always sees it.
 */
function rewriteLine(line, where) {
  // Lines that are not JSON (or carry no `at`) are passed through untouched: that is how
  // the fixture reproduces a log with one unparsable line.
  let ev
  try {
    ev = JSON.parse(line)
  } catch {
    return line
  }
  if (!ev || typeof ev !== 'object' || typeof ev.at !== 'string') return line
  const { at, ...rest } = ev
  return JSON.stringify({ time: localAtToMs(at, where), ...rest })
}

function compress(text) {
  const bytes = Buffer.from(text, 'utf8')
  return zlib.zstdCompressSync(bytes)
}

/**
 * Materialize the manifest into a temp DSH home.
 * @returns {{home: string, cleanup: () => void, sessions: object[]}}
 */
export function buildFixtureHome() {
  const manifest = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'manifest.json'), 'utf8'))
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-usage-stats-fixtures-'))
  const sessionsDir = path.join(home, 'sessions')
  fs.mkdirSync(sessionsDir, { recursive: true })

  for (const entry of manifest.sessions) {
    const dir = path.join(sessionsDir, entry.workspace, entry.session)
    fs.mkdirSync(dir, { recursive: true })
    const target = path.join(dir, SESSION_FILE_NAME)

    if (typeof entry.content === 'string') {
      // Raw bytes, not a zstd frame: the corrupt-file case.
      fs.writeFileSync(target, Buffer.from(entry.content, 'utf8'))
      continue
    }

    const source = path.join(FIXTURES_DIR, entry.source)
    let text = ''
    if (fs.existsSync(source)) {
      const raw = fs.readFileSync(source, 'utf8')
      const lines = raw.split('\n').filter((line) => line.trim() !== '')
      text = lines
        .map((line) => rewriteLine(line, `${entry.workspace}/${entry.session}`))
        .join('\n')
      if (text) text += '\n'
    }
    // Missing source = intentionally empty log (valid frame, zero events).
    fs.writeFileSync(target, compress(text))
  }

  const cleanup = () => {
    try {
      fs.rmSync(home, { recursive: true, force: true })
    } catch {
      /* temp dir; best effort */
    }
  }
  return { home, cleanup, manifest }
}

/* ------------------------------------------------------------------ expectations */

/**
 * Numbers below are hand-derived from the fixture logs (see fixtures/manifest.json `covers`).
 * Kept literal on purpose: a wrong fold must fail loudly instead of re-deriving itself.
 */
const EXPECTED = {
  tokens: 1015 + 2300 + 400 + 100, // sess-a / sess-b / sess-c / sess-f
  inputTokens: 110 + 201 + 50 + 80,
  outputTokens: 55 + 101 + 20 + 20,
  cacheReadTokens: 900 + 1700 + 330 + 0,
  sessions: 4, // sess-nousage contributes no usage -> must not count
  turns: 1 + 1 + 1 + 1 + 0, // a, b, c, nousage, f
  steps: 2 + 2 + 1 + 1 + 1, // step/start counts (incl. sess-b's unclosed step)
  peak: { tokens: 2300, date: '2026-10-30' },
  longestChatMs: 115000, // sess-a: 55s + 60s; sess-b's second step is unclosed and must not count
  longestSessionSpanMs: 270000, // sess-a 09:00:00 -> 09:04:30 (non-kept event extends the span)
  streak: { current: 2, longest: 2 },
  dayTokens: { '2026-10-28': 1015, '2026-10-30': 2300, '2026-10-31': 500 },
  today: '2026-10-31',
  merge: {
    label: 'DeepSeek-V4.1-Flash',
    id: 'deepseek-v4.1-flash', // highest-token raw id wins the representative slot
    tokens: 1015 + 2000 + 300 + 100, // sess-a + sess-b (two raw ids) + sess-f
    providers: ['ark', 'deepseek-account', 'volcengine'],
  },
  pro: { label: 'DeepSeek-V4-Pro', id: 'deepseek-v4-pro-0801', tokens: 400 },
  errors: 2, // sess-broken (decompress) + sess-a (1 unparsable line)
}

/* ------------------------------------------------------------------ assertions */

function createChecker() {
  const results = []
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected)
    results.push({ name, ok, actual, expected })
    return ok
  }
  return { results, check }
}

const dayByDate = (payload, date) => payload.days.find((day) => day.date === date) || null

/** Structural invariants that must hold for ANY payload. */
function checkInvariants(payload, check) {
  const modelsSum = payload.models.reduce((sum, model) => sum + model.tokens, 0)
  const daysSum = payload.days.reduce((sum, day) => sum + day.tokens, 0)
  check('Σmodels == totals.tokens', modelsSum, payload.totals.tokens)
  check('Σdays == totals.tokens', daysSum, payload.totals.tokens)
  check('days[] length == 365', payload.days.length, 365)
  check(
    'share sums to 1',
    Math.abs(payload.models.reduce((sum, model) => sum + model.share, 0) - 1) < 0.01,
    true,
  )
  check(
    'peak == max day',
    payload.peak.tokens,
    Math.max(...payload.days.map((day) => day.tokens)),
  )
  check(
    'days are consecutive & sorted',
    payload.days.every(
      (day, i) => i === 0 || Date.parse(`${payload.days[i - 1].date}T00:00:00Z`) + 86400000 ===
        Date.parse(`${day.date}T00:00:00Z`),
    ),
    true,
  )
  check(
    'models sorted desc',
    payload.models.every((model, i) => i === 0 || payload.models[i - 1].tokens >= model.tokens),
    true,
  )
}

/* ------------------------------------------------------------------ main */

export async function runFixtureSuite() {
  const { collectUsageStats, getLastScanMeta, labelForModel } = await import('./stats.js')
  // `--real`-style cache must never leak into the fixture run.
  const { clearUsageStatsCache } = await import('./stats.js')
  clearUsageStatsCache()

  const { home, cleanup, manifest } = buildFixtureHome()
  const lines = []
  const push = (line = '') => lines.push(line)
  const { results, check } = createChecker()

  try {
    const anchorMs = localAtToMs(manifest.now, 'manifest.now')
    const payload = collectUsageStats({
      homeDir: home,
      now: anchorMs,
      generatedAt: anchorMs,
      force: true,
    })
    const meta = getLastScanMeta()

    push('=== fixture run ===')
    push(`temp home     ${home}`)
    push(`files         ${meta.files} (unreadable ${meta.unreadable})`)
    push(`events        ${meta.totalEvents} (bad lines ${meta.badLines})`)
    push(
      `totals        tokens=${payload.totals.tokens} in=${payload.totals.inputTokens} out=${payload.totals.outputTokens} cacheRead=${payload.totals.cacheReadTokens}`,
    )
    push(
      `              sessions=${payload.totals.sessions} turns=${payload.totals.turns} steps=${payload.totals.steps}`,
    )
    push(`peak          ${payload.peak.tokens} @ ${payload.peak.date}`)
    push(
      `chat/span     longestChatMs=${payload.longestChatMs} longestSessionSpanMs=${payload.longestSessionSpanMs}`,
    )
    push(`streak        current=${payload.streak.current} longest=${payload.streak.longest}`)
    push(`errors        ${payload.errors.length}`)
    for (const error of payload.errors) push(`  ! ${error.scope}: ${path.basename(error.file || '')} ${error.message}`)
    push()

    // --- payload totals (BRIEF §3 contract) ---
    check('totals.tokens', payload.totals.tokens, EXPECTED.tokens)
    check('totals.inputTokens', payload.totals.inputTokens, EXPECTED.inputTokens)
    check('totals.outputTokens', payload.totals.outputTokens, EXPECTED.outputTokens)
    check('totals.cacheReadTokens', payload.totals.cacheReadTokens, EXPECTED.cacheReadTokens)
    check('totals.sessions (usage-bearing only)', payload.totals.sessions, EXPECTED.sessions)
    check('totals.turns', payload.totals.turns, EXPECTED.turns)
    check('totals.steps', payload.totals.steps, EXPECTED.steps)
    check('totals.tokens uses totalTokens when present', payload.totals.tokens - 3815, 0)

    // --- peak / time ---
    check('peak', payload.peak, EXPECTED.peak)
    check('longestChatMs (unclosed step ignored)', payload.longestChatMs, EXPECTED.longestChatMs)
    check('longestSessionSpanMs (skipped events extend span)', payload.longestSessionSpanMs, EXPECTED.longestSessionSpanMs)
    check('streak', payload.streak, EXPECTED.streak)

    // --- local-day bucketing ---
    check('today (last day[])', payload.days[payload.days.length - 1].date, EXPECTED.today)
    for (const [date, tokens] of Object.entries(EXPECTED.dayTokens)) {
      check(`day ${date} tokens`, (dayByDate(payload, date) || {}).tokens, tokens)
    }
    // The 00:30 local usage must land on 2026-10-31, not on the previous UTC day.
    check('00:30 local usage not bucketed to 2026-10-30', (dayByDate(payload, '2026-10-30') || {}).tokens, 2300)
    check(
      'days[].byModel uses representative id',
      (dayByDate(payload, '2026-10-30') || {}).byModel,
      { [EXPECTED.merge.id]: 2300 },
    )

    // --- model label mapping + merge ---
    check('models length', payload.models.length, 2)
    const flash = payload.models[0] || {}
    const pro = payload.models[1] || {}
    check('merged label', flash.label, EXPECTED.merge.label)
    check('merged representative id', flash.id, EXPECTED.merge.id)
    check('merged tokens', flash.tokens, EXPECTED.merge.tokens)
    check('merged providers union', flash.providers, EXPECTED.merge.providers)
    check('unmapped family -> DeepSeek-V4-Pro', pro.label, EXPECTED.pro.label)
    check('pro id kept verbatim', pro.id, EXPECTED.pro.id)
    check('pro tokens', pro.tokens, EXPECTED.pro.tokens)
    check('labelForModel is case-insensitive', labelForModel('DeepSeek-Flash'), EXPECTED.merge.label)
    check('labelForModel passes unknown ids through', labelForModel('weird id'), 'weird id')

    // --- range windows ---
    check('daysInRange.7d length', payload.daysInRange['7d'].length, 7)
    check('daysInRange.30d length', payload.daysInRange['30d'].length, 30)
    check(
      'daysInRange.7d tokens == totals.tokens',
      payload.daysInRange['7d'].reduce((sum, day) => sum + day.tokens, 0),
      EXPECTED.tokens,
    )
    check(
      'daysInRange.30d tokens == totals.tokens',
      payload.daysInRange['30d'].reduce((sum, day) => sum + day.tokens, 0),
      EXPECTED.tokens,
    )
    check('modelsInRange.7d length', payload.modelsInRange['7d'].length, 2)
    check(
      'modelsInRange.7d tokens == totals.tokens',
      payload.modelsInRange['7d'].reduce((sum, model) => sum + model.tokens, 0),
      EXPECTED.tokens,
    )

    // --- tolerance ---
    check('errors length (corrupt file + bad line)', payload.errors.length, EXPECTED.errors)
    check(
      'corrupt file is skipped, not thrown',
      payload.errors.some((error) => error.scope === 'session' && /decompress|read failed/.test(error.message)),
      true,
    )
    check(
      'unparsable line is reported',
      payload.errors.some((error) => error.scope === 'session-lines'),
      true,
    )
    check('payload is JSON-serializable', typeof JSON.stringify(payload), 'string')
    check('empty log tolerated', payload.errors.every((error) => !/sess-empty/.test(error.file || '')), true)

    checkInvariants(payload, check)
  } finally {
    cleanup()
  }

  push('=== checks ===')
  for (const result of results) {
    if (!result.ok) {
      push(`FAIL ${result.name}: actual=${JSON.stringify(result.actual)} expected=${JSON.stringify(result.expected)}`)
    }
  }
  const failed = results.filter((result) => !result.ok).length
  push(`${results.length - failed}/${results.length} checks passed`)
  console.log(lines.join('\n'))
  console.log(failed === 0 ? '\nFIXTURES: PASS' : `\nFIXTURES: ${failed} check(s) FAILED`)
  return failed === 0 ? 0 : 1
}

// Allow `node lib/host/selftest.fixtures.mjs` directly.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runFixtureSuite().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error)
      process.exit(1)
    },
  )
}

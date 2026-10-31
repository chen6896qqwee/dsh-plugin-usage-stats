#!/usr/bin/env node
/**
 * selftest.mjs — runnable self check for the Host half of dsh-plugin-usage-stats.
 *
 * Usage:
 *   node lib/host/selftest.mjs           # synthetic fixtures under lib/host/fixtures/ (exit code = result)
 *   node lib/host/selftest.mjs --real     # real ~/.dsh data: writes lib/host/selftest.real.json,
 *                                         # prints reconciliation vs the BRIEF baseline, exit code = result
 *   node lib/host/selftest.mjs --real --home "C:\some\home"
 *
 * No third-party dependencies.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/* ------------------------------------------------------------------ real data mode */

/** Baseline captured by the Lead's prototype `_recon/tools/fold-usage.mjs` (BRIEF §3). */
const REAL_BASELINE = {
  sessions: 18,
  tokens: 205733805,
  usageDays: 5,
  firstDay: '2026-10-27',
  lastDay: '2026-10-31',
}

async function runReal(homeDir) {
  const { collectUsageStats, getLastScanMeta } = await import('./stats.js')

  const homes = []
  if (homeDir) homes.push(homeDir)
  else {
    if (process.env.DSH_HOME) homes.push(process.env.DSH_HOME)
    homes.push(path.join(process.env.USERPROFILE || process.env.HOME || '', '.dsh'))
  }
  let home = null
  for (const candidate of homes) {
    if (!candidate) continue
    if (fs.existsSync(path.join(candidate, 'sessions')) || fs.existsSync(candidate)) {
      home = candidate
      break
    }
  }
  if (!home) {
    console.error('FAIL: no DSH home found; pass --home <dir>')
    return 1
  }

  const started = process.hrtime.bigint()
  const payload = collectUsageStats({ homeDir: home })
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6
  const meta = getLastScanMeta()

  const outFile = path.join(HERE, 'selftest.real.json')
  fs.writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  const withUsageDays = payload.days.filter((d) => d.tokens > 0)
  const lines = []
  const push = (line) => lines.push(line)
  push('=== real data run ===')
  push(`home                    ${home}`)
  push(`sessionsDir             ${meta.sessionsDir}`)
  push(`files scanned           ${meta.files} (unreadable ${meta.unreadable})`)
  push(`compressed bytes        ${meta.compressedBytes}`)
  push(`decompressed chars      ${meta.textChars}`)
  push(`events                  ${meta.totalEvents} (bad lines ${meta.badLines})`)
  push(`scan+fold wall clock    ${elapsedMs.toFixed(1)} ms  (scan alone ${meta.ms} ms)`)
  push(`generatedAt/timeZone    ${payload.generatedAt} / ${payload.timeZone}`)
  push(
    `totals                  tokens=${payload.totals.tokens} in=${payload.totals.inputTokens} out=${payload.totals.outputTokens} cacheRead=${payload.totals.cacheReadTokens}`,
  )
  push(
    `totals                  sessions=${payload.totals.sessions} turns=${payload.totals.turns} steps=${payload.totals.steps}`,
  )
  push(`peak                    ${payload.peak.tokens} @ ${payload.peak.date}`)
  push(`longestChatMs           ${payload.longestChatMs} (${(payload.longestChatMs / 60000).toFixed(1)} min)`)
  push(`longestSessionSpanMs    ${payload.longestSessionSpanMs}`)
  push(`streak                  current=${payload.streak.current} longest=${payload.streak.longest}`)
  push(`usage days              ${withUsageDays.length}: ${withUsageDays.map((d) => d.date).join(' ')}`)
  push(`days[] length           ${payload.days.length} (first ${payload.days[0] && payload.days[0].date})`)
  push(`models[]                ${payload.models.length}`)
  for (const model of payload.models) {
    push(`  ${model.label.padEnd(22)} id=${String(model.id).padEnd(26)} tokens=${String(model.tokens).padStart(11)} share=${model.share} providers=${model.providers.join(',')}`)
  }
  push(`modelsInRange.7d        ${payload.modelsInRange['7d'].length} / .30d ${payload.modelsInRange['30d'].length}`)
  push(`daysInRange.7d          ${payload.daysInRange['7d'].length} days, tokens ${payload.daysInRange['7d'].reduce((a, d) => a + d.tokens, 0)}`)
  push(`daysInRange.30d         ${payload.daysInRange['30d'].length} days, tokens ${payload.daysInRange['30d'].reduce((a, d) => a + d.tokens, 0)}`)
  push(`errors                  ${payload.errors.length}`)
  for (const error of payload.errors) push(`  ! ${error.scope}: ${error.file || ''} ${error.message}`)
  push(`payload written to      ${outFile} (${fs.statSync(outFile).size} bytes)`)

  // Soft reconciliation against the Lead's prototype numbers: the live home keeps growing
  // while the team works, so only a structural/soft comparison is meaningful.
  const days = withUsageDays.map((d) => d.date)
  const check = (name, actual, expected, ok, note = '') => {
    push(`${ok ? 'PASS' : 'WARN'} ${name}: ${actual} (prototype baseline ${expected})${note ? ` ${note}` : ''}`)
    return ok
  }
  const results = []
  results.push(check('usage days >= baseline', days.length, REAL_BASELINE.usageDays, days.length >= REAL_BASELINE.usageDays))
  results.push(check('sessions  >= baseline', payload.totals.sessions, REAL_BASELINE.sessions, payload.totals.sessions >= REAL_BASELINE.sessions))
  results.push(check('tokens    >= baseline', payload.totals.tokens, REAL_BASELINE.tokens, payload.totals.tokens >= REAL_BASELINE.tokens))
  results.push(check('first day == baseline', days[0] || '-', REAL_BASELINE.firstDay, (days[0] || '') === REAL_BASELINE.firstDay))
  // Structural invariants that must always hold on real data.
  const modelsSum = payload.models.reduce((a, m) => a + m.tokens, 0)
  results.push(
    check('Σmodels == Σdays == totals.tokens', `${modelsSum}/${payload.days.reduce((a, d) => a + d.tokens, 0)}`, payload.totals.tokens, modelsSum === payload.totals.tokens && payload.days.reduce((a, d) => a + d.tokens, 0) === payload.totals.tokens),
  )
  results.push(check('share sums to 1', payload.models.reduce((a, m) => a + m.share, 0).toFixed(4), 1, Math.abs(payload.models.reduce((a, m) => a + m.share, 0) - 1) < 0.01))
  results.push(check('peak == max day', payload.peak.tokens, Math.max(...payload.days.map((d) => d.tokens)), payload.peak.tokens === Math.max(...payload.days.map((d) => d.tokens))))
  results.push(check('performance < 1000ms', `${elapsedMs.toFixed(1)}ms`, 1000, elapsedMs < 1000))

  push('')
  push(lines.includes('') ? '' : '')
  console.log(lines.join('\n'))
  const failed = results.filter((r) => r !== true).length
  console.log(failed === 0 ? '\nREAL DATA: PASS' : `\nREAL DATA: ${failed} soft check(s) failed`)
  // Real-data drift (new sessions) must not fail the build, but structural breakage is an error.
  const structuralFail = modelsSum !== payload.totals.tokens || payload.days.length !== 365
  return structuralFail ? 1 : 0
}

/* ------------------------------------------------------------------ fixture mode */

async function runFixtures() {
  const { runFixtureSuite } = await import('./selftest.fixtures.mjs')
  return runFixtureSuite()
}

/* ------------------------------------------------------------------ main */

const args = process.argv.slice(2)
const isReal = args.includes('--real')
let homeArg = null
const homeIndex = args.indexOf('--home')
if (homeIndex >= 0) homeArg = args[homeIndex + 1] || null

const code = isReal ? await runReal(homeArg) : await runFixtures()
process.exit(code)

/**
 * fold.js — pure folding of scanned session records into the UsageStats payload (BRIEF §3).
 *
 * This module does no IO: give it session records from scan.js (or hand-built fixtures)
 * and it returns the exact JSON shape documented in BRIEF §3. It is the only place that
 * owns the payload contract, so the contract rules live here verbatim:
 *
 *  - day bucketing uses the HOST LOCAL time zone (`new Date(ms).getFullYear()/getMonth()/getDate()`),
 *    never UTC;
 *  - tokens = usage.totalTokens ?? (usage.inputTokens + usage.outputTokens);
 *  - model label mapping, then a SECOND merge by label (id = the highest-token id in the group);
 *  - streak counts consecutive local calendar days that carry usage;
 *  - longestChatMs = max over sessions of Σ(step/end.time − step/start.time);
 *  - models / days are all-time; modelsInRange / daysInRange expose the 7d and 30d windows
 *    (inclusive of today) for the UI chips;
 *  - everything is plain JSON (no Map/Set/BigInt/undefined) so it survives the remote hop.
 */

/** All-time `days[]` window length: [today-364d, today] (BRIEF §3). */
export const DAYS_IN_HISTORY = 365

/** Range windows exposed for the UI chips (BRIEF §1.3「近7日/近30日」). */
export const RANGE_WINDOWS = [
  { key: '7d', days: 7 },
  { key: '30d', days: 30 },
]

const LABEL_V41_FLASH = 'DeepSeek-V4.1-Flash'
const LABEL_V4_PRO = 'DeepSeek-V4-Pro'

/**
 * Display label for a raw model id (BRIEF §3 label table). Unmapped ids are returned as-is.
 * Matching is case-insensitive; the payload keeps the original id string.
 */
export function labelForModel(id) {
  const key = String(id == null ? '' : id).toLowerCase()
  if (key === 'deepseek-flash') return LABEL_V41_FLASH
  if (key === 'deepseek-v4.1-flash') return LABEL_V41_FLASH
  if (key === 'deepseek-v4-1-flash-261017') return LABEL_V41_FLASH
  if (key.startsWith('deepseek-v4-pro')) return LABEL_V4_PRO
  // Unknown but well-formed model ids still deserve a readable legend entry:
  // `deepseek-v4.1-flash-1017` -> `DeepSeek-V4.1-Flash-1017`.
  if (/^[a-z0-9][a-z0-9._-]*$/i.test(key) && key.includes('-')) {
    return key
      .split('-')
      .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
      .join('-')
      .replace(/^deepseek/i, 'DeepSeek')
  }
  return id
}

function pad2(n) {
  return n < 10 ? `0${n}` : String(n)
}

/** `YYYY-MM-DD` for an epoch-ms instant, in the host process local time zone. */
export function localDateKey(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** Local calendar day ordinal (days since 1970-01-01 in local terms) — DST safe. */
export function localDayOrdinal(ms) {
  const d = new Date(ms)
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000
}

function startOfLocalDay(ms) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Shift a local-day start instant by N calendar days (DST safe via setDate). */
function shiftLocalDays(dayStartMs, delta) {
  const d = new Date(dayStartMs)
  d.setDate(d.getDate() + delta)
  return d.getTime()
}

export function detectTimeZone() {
  try {
    const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone
    if (zone && typeof zone === 'string') return zone
  } catch {
    /* ignore */
  }
  const offsetMinutes = -new Date().getTimezoneOffset()
  const sign = offsetMinutes < 0 ? '-' : '+'
  const abs = Math.abs(offsetMinutes)
  return `UTC${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`
}

function round4(value) {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 10000) / 10000
}

function sumOrZero(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * Merge raw per-model accumulators into the BRIEF §3 `models[]` shape:
 * group by display label, take the highest-token raw id as the group id, union providers.
 *
 * @param {Map<string, {tokens: number, providers: Set<string>}>} rawModels
 * @param {number} scopeTotal tokens of the enclosing scope (all-time or window)
 * @returns {{models: object[], repIdByRawId: Map<string, string>}}
 */
function mergeModelsByLabel(rawModels, scopeTotal) {
  const groups = new Map() // label -> { tokenSum, entries: [{id, tokens}], providers: Set }
  for (const [id, acc] of rawModels) {
    const label = labelForModel(id)
    const key = String(label == null ? '' : label)
    let group = groups.get(key)
    if (!group) {
      group = { label: key, tokenSum: 0, entries: [], providers: new Set() }
      groups.set(key, group)
    }
    group.tokenSum += acc.tokens
    group.entries.push({ id, tokens: acc.tokens })
    for (const provider of acc.providers) group.providers.add(provider)
  }

  const models = []
  const repIdByRawId = new Map()
  for (const group of groups.values()) {
    let rep = null
    for (const entry of group.entries) {
      if (
        rep === null ||
        entry.tokens > rep.tokens ||
        (entry.tokens === rep.tokens && String(entry.id) < String(rep.id))
      ) {
        rep = entry
      }
    }
    if (!rep) continue
    for (const entry of group.entries) repIdByRawId.set(entry.id, rep.id)
    models.push({
      id: rep.id,
      label: group.label,
      providers: [...group.providers].sort(),
      tokens: group.tokenSum,
      share: scopeTotal > 0 ? round4(group.tokenSum / scopeTotal) : 0,
    })
  }
  models.sort((a, b) => b.tokens - a.tokens || (String(a.id) < String(b.id) ? -1 : 1))
  return { models, repIdByRawId }
}

function newModelAccumulator() {
  return { tokens: 0, providers: new Set() }
}

function accumulateModel(rawModels, id, tokens, provider) {
  let acc = rawModels.get(id)
  if (!acc) {
    acc = newModelAccumulator()
    rawModels.set(id, acc)
  }
  acc.tokens += tokens
  if (provider) acc.providers.add(provider)
}

/** Build the day entry list for a window of consecutive local days ending today. */
function buildDayWindow({ days, todayStart, dayTokensByKey, repIdByRawId }) {
  const out = []
  const firstDayStart = shiftLocalDays(todayStart, -(days - 1))
  for (let i = 0; i < days; i++) {
    const dayStart = shiftLocalDays(firstDayStart, i)
    const date = localDateKey(dayStart)
    const raw = dayTokensByKey.get(date)
    const byModel = {}
    let tokens = 0
    if (raw) {
      for (const [rawId, value] of raw) {
        if (!value) continue
        tokens += value
        const repId = repIdByRawId.get(rawId) || rawId
        byModel[repId] = (byModel[repId] || 0) + value
      }
    }
    out.push({ date, tokens, byModel })
  }
  return out
}

/**
 * Fold session records into the UsageStats payload.
 *
 * @param {object[]} sessions records from scan.js `normalizeSession()`
 * @param {{now?: number, tz?: string, generatedAt?: number, errors?: object[], version?: number}} [options]
 * @returns {object} BRIEF §3 payload (plain JSON)
 */
export function foldSessions(sessions, options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now()
  const generatedAt = Number.isFinite(options.generatedAt) ? options.generatedAt : Date.now()
  const timeZone = options.tz || detectTimeZone()
  const version = Number.isInteger(options.version) ? options.version : 1
  const errors = Array.isArray(options.errors) ? options.errors.slice() : []

  const todayStart = startOfLocalDay(now)
  const todayOrdinal = localDayOrdinal(todayStart)
  const rangeStarts = new Map()
  for (const range of RANGE_WINDOWS) {
    rangeStarts.set(range.key, todayOrdinal - (range.days - 1))
  }

  let totalTokens = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCacheReadTokens = 0
  let turns = 0
  let steps = 0
  let longestChatMs = 0
  let longestSessionSpanMs = 0

  const sessionKeysWithUsage = new Set()
  const dayTokensByKey = new Map() // 'YYYY-MM-DD' -> Map<rawModelId, tokens>
  const allTimeModels = new Map() // rawModelId -> {tokens, providers:Set}
  const rangeModels = new Map() // '7d' | '30d' -> Map<rawModelId, {tokens, providers:Set}>
  const rangeTotals = new Map()
  const usageDayOrdinals = new Set()

  for (const range of RANGE_WINDOWS) {
    rangeModels.set(range.key, new Map())
    rangeTotals.set(range.key, 0)
  }

  for (let index = 0; index < sessions.length; index++) {
    const session = sessions[index] || {}

    // Session-level aggregates first: they are independent of usage records.
    const chatMs = Math.max(0, sumOrZero(session.activeMs))
    if (chatMs > longestChatMs) longestChatMs = chatMs
    if (Number.isFinite(session.firstTime) && Number.isFinite(session.lastTime)) {
      const span = Math.max(0, session.lastTime - session.firstTime)
      if (span > longestSessionSpanMs) longestSessionSpanMs = span
    }
    turns += sumOrZero(session.turnStarts)
    steps += sumOrZero(session.stepStarts)

    const usages = Array.isArray(session.usages) ? session.usages : []
    if (usages.length === 0) continue
    const sessionKey = session.sessionId || session.file || `session-${index}`

    for (const usage of usages) {
      if (!usage || !Number.isFinite(usage.time)) {
        errors.push({
          scope: 'usage',
          file: session.file || null,
          sessionId: session.sessionId || null,
          message: 'usage event without a numeric time was skipped',
        })
        continue
      }
      const tokens = sumOrZero(usage.tokens)
      const provider = usage.provider || '?'
      const modelId = usage.model == null ? '?' : String(usage.model)

      sessionKeysWithUsage.add(sessionKey)
      totalTokens += tokens
      totalInputTokens += sumOrZero(usage.inputTokens)
      totalOutputTokens += sumOrZero(usage.outputTokens)
      totalCacheReadTokens += sumOrZero(usage.cacheReadTokens)

      const date = localDateKey(usage.time)
      let dayMap = dayTokensByKey.get(date)
      if (!dayMap) {
        dayMap = new Map()
        dayTokensByKey.set(date, dayMap)
      }
      dayMap.set(modelId, (dayMap.get(modelId) || 0) + tokens)

      accumulateModel(allTimeModels, modelId, tokens, provider)

      const ordinal = localDayOrdinal(usage.time)
      usageDayOrdinals.add(ordinal)
      for (const range of RANGE_WINDOWS) {
        if (ordinal < rangeStarts.get(range.key) || ordinal > todayOrdinal) continue
        accumulateModel(rangeModels.get(range.key), modelId, tokens, provider)
        rangeTotals.set(range.key, rangeTotals.get(range.key) + tokens)
      }
    }
  }

  // --- models (all-time) + the raw-id -> representative-id map used by days[].byModel ---
  const merged = mergeModelsByLabel(allTimeModels, totalTokens)
  const repIdByRawId = merged.repIdByRawId

  // --- peak: single best local day across ALL history (totals are all-time too) ---
  let peakTokens = 0
  let peakDate = null
  for (const date of [...dayTokensByKey.keys()].sort()) {
    let dayTotal = 0
    for (const value of dayTokensByKey.get(date).values()) dayTotal += value
    if (dayTotal > peakTokens) {
      peakTokens = dayTotal
      peakDate = date
    }
  }

  // --- streak over local calendar days that carry usage ---
  const sortedOrdinals = [...usageDayOrdinals].sort((a, b) => a - b)
  let longestStreak = 0
  let run = 0
  let previous = null
  for (const ordinal of sortedOrdinals) {
    run = previous !== null && ordinal === previous + 1 ? run + 1 : 1
    if (run > longestStreak) longestStreak = run
    previous = ordinal
  }
  let currentStreak = 0
  // "用过了" today, or yesterday when today is still empty (today not using yet is not a break).
  let cursor = usageDayOrdinals.has(todayOrdinal)
    ? todayOrdinal
    : usageDayOrdinals.has(todayOrdinal - 1)
      ? todayOrdinal - 1
      : null
  while (cursor !== null && usageDayOrdinals.has(cursor)) {
    currentStreak++
    cursor--
  }

  const days = buildDayWindow({
    days: DAYS_IN_HISTORY,
    todayStart,
    dayTokensByKey,
    repIdByRawId,
  })

  const daysInRange = {}
  const modelsInRange = {}
  for (const range of RANGE_WINDOWS) {
    daysInRange[range.key] = buildDayWindow({
      days: range.days,
      todayStart,
      dayTokensByKey,
      repIdByRawId,
    })
    modelsInRange[range.key] = mergeModelsByLabel(
      rangeModels.get(range.key),
      rangeTotals.get(range.key),
    ).models
  }

  return {
    generatedAt,
    timeZone,
    totals: {
      tokens: totalTokens,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cacheReadTokens: totalCacheReadTokens,
      sessions: sessionKeysWithUsage.size,
      turns,
      steps,
    },
    peak: { tokens: peakTokens, date: peakDate },
    longestChatMs,
    longestSessionSpanMs,
    streak: { current: currentStreak, longest: longestStreak },
    days,
    models: merged.models,
    modelsInRange,
    daysInRange,
    version,
    errors,
  }
}

/**
 * dsh-plugin-usage-stats — Host half.
 *
 * Responsibility: compute the usage payload (BRIEF §3) from the local session
 * logs and serve it to the browser half over a named route on `webServer`.
 *
 * Why a route instead of a Typert remote namespace: a profile-installed plugin
 * cannot import platform packages (`@deepseek-ai/dsh-typert-protocol`), because
 * its imports resolve from the plugin directory rather than the packaged
 * runtime. The webserver's named-route seat is pure `node:http`, needs no
 * platform import, and the browser bundle is served from the same origin, so a
 * plain same-origin `fetch()` reaches it in both the Web and the Electron shell
 * (both load the GUI over http://127.0.0.1:<port>).
 *
 * Route table (GET only, same-origin):
 *   /dsh-usage-stats/data            → cached payload (60 s TTL)
 *   /dsh-usage-stats/data?force=1    → recompute before answering
 *   /dsh-usage-stats/health          → diagnostics without the payload
 */

import { collectUsageStats, getLastScanMeta, resolveHomeDir } from './host/stats.js'

/** Named-route prefix owned by this plugin (no trailing slash: the webserver matches `prefix + '/'`). */
export const ROUTE_PREFIX = '/dsh-usage-stats'
/** Cache lifetime for the folded payload. */
const CACHE_TTL_MS = 60_000

/** @type {{at: number, value: object|null}} */
const cache = { at: 0, value: null }
/** Last failure, for /health diagnostics. */
let lastError = null

function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('content-length', Buffer.byteLength(text))
  res.end(text)
}

function snapshot(force) {
  const now = Date.now()
  if (!force && cache.value && now - cache.at < CACHE_TTL_MS) return { value: cache.value, cached: true }
  const value = collectUsageStats({ force: true })
  cache.value = value
  cache.at = now
  lastError = null
  return { value, cached: false }
}

/**
 * Mount the route. `inject` requests `webServer`; a composition without the
 * browser carrier (e.g. a TUI host) simply never activates this plugin.
 */
export const inject = ['webServer']

export function apply(ctx) {
  const server = ctx.get('webServer')
  if (!server || typeof server.register !== 'function') {
    console.warn('[dsh-plugin-usage-stats] webServer unavailable; usage panel route not mounted')
    return
  }

  const handler = (req, res) => {
    let url
    try {
      url = new URL(req.url ?? '/', 'http://localhost')
    } catch {
      sendJson(res, 400, { error: 'bad-url' })
      return
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405
      res.setHeader('allow', 'GET, HEAD')
      res.end()
      return
    }

    if (url.pathname === `${ROUTE_PREFIX}/health`) {
      const meta = getLastScanMeta()
      sendJson(res, 200, {
        ok: lastError === null,
        homeDir: resolveHomeDir(),
        cacheAgeMs: cache.value ? Date.now() - cache.at : null,
        lastScan: meta,
        lastError,
      })
      return
    }

    if (url.pathname === `${ROUTE_PREFIX}/data`) {
      try {
        const force = url.searchParams.get('force') === '1'
        const { value, cached } = snapshot(force)
        res.setHeader('x-usage-stats-cache', cached ? 'hit' : 'miss')
        sendJson(res, 200, value)
      } catch (error) {
        lastError = String((error && error.stack) || error)
        console.error('[dsh-plugin-usage-stats] snapshot failed:', error)
        sendJson(res, 500, { error: 'usage-stats-failed', message: String((error && error.message) || error) })
      }
      return
    }

    sendJson(res, 404, { error: 'not-found' })
  }

  ctx.effect(() => {
    const dispose = server.register({ kind: 'prefix', path: ROUTE_PREFIX, handler })
    return dispose
  }, 'dsh-plugin-usage-stats: route')
}



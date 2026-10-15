/** Lightweight client error reporting → Workers Logs (via /api/log). Rate-limited per session. */
let sent = 0

export function reportError(error: unknown, extra: Record<string, unknown> = {}) {
  if (sent >= 10 || typeof navigator === 'undefined') return
  sent++
  const e = error instanceof Error ? error : new Error(String(error))
  const body = JSON.stringify({
    message: e.message.slice(0, 300),
    stack: e.stack?.slice(0, 1200),
    url: location.pathname + location.search,
    ua: navigator.userAgent.slice(0, 160),
    ...extra,
  })
  try {
    if (!navigator.sendBeacon?.('/api/log', body)) fetch('/api/log', { method: 'POST', body, keepalive: true }).catch(() => {})
  } catch {
    /* ignore */
  }
}

export function installGlobalErrorHandlers() {
  window.addEventListener('error', (e) => reportError(e.error ?? e.message, { where: 'window' }))
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, { where: 'promise' }))
}

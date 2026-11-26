import { expireKanadeOnlineState, readKanadeOnlineState } from './kanadeOnlineMode.js'

/** Shared projection plus the popup's short-lived, token-scoped read lifecycle. */
export function createTrayOnlineMode({ read, publish, now = Date.now, repeat = setInterval, stop = clearInterval }) {
  let disposed = false
  let receipt = 0
  let busy = false
  let current = null
  let lastMonitor

  function receive(raw) {
    if (disposed) return
    receipt++
    current = readKanadeOnlineState(raw, { now: now() })
    publish(current, busy)
  }

  function checkAge() {
    if (disposed) return
    const next = expireKanadeOnlineState(current, now())
    if (next !== current) { current = next; publish(current, busy) }
  }

  // Other tray events may carry the same projection; they must not undo a
  // manual refresh or keep old values alive. A changed snapshot wins races.
  function receiveMonitor(raw) {
    const key = JSON.stringify(raw)
    if (lastMonitor === key) return
    lastMonitor = key
    receive(raw)
  }

  async function refresh() {
    if (disposed || busy) return
    const begun = receipt
    busy = true
    publish(current, busy)
    let raw = null
    try { raw = await read() } catch { /* make any failed read unavailable */ }
    if (disposed) return
    busy = false
    if (begun === receipt) receive(raw)
    else publish(current, busy)
  }

  const timer = repeat(checkAge, 1000)
  return { receiveMonitor, refresh, checkAge, dispose() { disposed = true; stop(timer) } }
}

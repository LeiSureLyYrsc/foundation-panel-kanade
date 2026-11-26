import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { trayTransport } from '../composables/menuPopupTransport.js'
import { KANADE_ONLINE_MAX_AGE_MS, kanadeOnlineActions, kanadeOnlineRows } from './kanadeOnlineMode.js'
import { createTrayOnlineMode } from './trayOnlineMode.js'

const timestamp = 1_764_153_600_123
const tray = (fields = {}) => ({ capabilities: ['kanade-v1'], kanade: { version: 1, updated_at_ms: timestamp, ...fields } })
const available = (state) => kanadeOnlineActions({ state }).filter((action) => action.enabled).map((action) => action.id)
function harness(read = async () => null) {
  const updates = []
  let at = timestamp
  let tick
  const mode = createTrayOnlineMode({ read, now: () => at, repeat: (fn) => { tick = fn; return 1 },
    stop: (id) => { assert.equal(id, 1); tick = null }, publish: (...snapshot) => updates.push(snapshot) })
  return { ...mode, updates, latest: () => updates.at(-1), advance: (ms) => { at += ms; tick?.() } }
}

test('tray numbers are counts only and the four connection states remain independent', () => {
  const mode = harness()
  mode.receiveMonitor({ ...tray({ control: 'online', registration: 'registered', transport: 'protected', pending_count: 3,
    native_paired: false, streaming: false }), sessions: [{ id: 10 }] })
  const [current] = mode.latest()
  const levels = Object.fromEntries(kanadeOnlineRows(current).map((row) => [row.id, row.level]))
  assert.deepEqual(levels, { component: 'unknown', registration: 'registered', control: 'online', pending: 'count',
    transport: 'protected', connection: 'unknown', pairing: 'unpaired', streaming: 'idle' })
  assert.equal(kanadeOnlineRows(current).find((row) => row.id === 'pending').count, 3)
  assert.deepEqual(available(current), ['refresh', 'native_pin'])
  mode.advance(KANADE_ONLINE_MAX_AGE_MS + 1)
  assert.equal(mode.latest()[0].presence, 'stale')
  assert.equal(mode.latest()[0].data, null)
})

test('disconnected, old, incompatible, disabled and control-plane offline are fail-closed', () => {
  const mode = harness()
  for (const [raw, expected] of [[null, 'unavailable'], [{}, 'unsupported'], [tray({ version: 2 }), 'unsupported'],
    [tray({ component: 'disabled' }), 'supported'], [tray({ component: 'missing' }), 'supported'],
    [tray({ registration: 'unregistered' }), 'supported'], [tray({ control: 'offline' }), 'supported']]) {
    mode.receiveMonitor(raw)
    const [current] = mode.latest()
    assert.equal(current.presence, expected)
    assert.notEqual(current.data?.control, 'online')
    assert.deepEqual(available(current), ['refresh', 'native_pin'])
  }
})

test('refresh clears failed state; newer monitor data wins and duplicate events cannot overwrite a refresh', async () => {
  let resolve
  const mode = harness(() => new Promise((done) => { resolve = done }))
  const old = tray({ control: 'online' })
  const offline = tray({ control: 'offline' })
  mode.receiveMonitor(old)
  const first = mode.refresh()
  assert.equal(mode.latest()[1], true)
  mode.receiveMonitor(offline)
  resolve(old)
  await first
  assert.equal(mode.latest()[0].data.control, 'offline')
  const second = mode.refresh()
  resolve(null)
  await second
  mode.receiveMonitor(offline)
  assert.equal(mode.latest()[0].presence, 'unavailable')
  mode.receiveMonitor(old)
  assert.equal(mode.latest()[0].data.control, 'online')
  const refused = harness(async () => { throw Error('read refused') })
  refused.receiveMonitor(old)
  await refused.refresh()
  assert.equal(refused.latest()[0].data, null)
})

test('closing the popup releases the timer and discards late refreshes', async () => {
  let complete
  const mode = harness(() => new Promise((resolve) => { complete = resolve }))
  mode.receiveMonitor(null)
  const result = mode.refresh()
  mode.dispose()
  complete(tray({ control: 'online' }))
  await result
  mode.advance(KANADE_ONLINE_MAX_AGE_MS + 1)
  assert.equal(mode.updates.length, 2)
})

test('popup transport sends only a scoped read and existing native PIN navigation', async () => {
  const calls = []
  const transport = trayTransport({ listen: () => {}, invoke: async (...args) => { calls.push(args); return { capabilities: [] } } })
  assert.deepEqual(await transport.refreshOnlineMode(42), { capabilities: [] })
  await transport.act(42, 'online_native_pin')
  assert.deepEqual(calls, [['tray_popup_refresh_online_mode', { token: 42 }], ['tray_popup_act', { token: 42, id: 'online_native_pin' }]])
  const ui = readFileSync(new URL('./TrayOnlineMode.vue', import.meta.url), 'utf8')
  assert.match(ui, /transport\.act\(props\.token, 'online_native_pin'\)/)
  assert.doesNotMatch(ui, /\bfetch\b|local-auth\.token|https?:\/\/|shell\.open/)
  const rust = readFileSync(new URL('../../../src-tauri/src/tray.rs', import.meta.url), 'utf8')
  assert.match(rust, /if id == "online_native_pin" \{\s+if window\.label\(\) == crate::ctx_popup::POPUP_LABEL[\s\S]+?if crate::ctx_popup::pick_tray\(&handle, token\) \{\s+actions::open_pairing_window\(&handle\)/)
  const actions = readFileSync(new URL('../../../src-tauri/src/tray/actions.rs', import.meta.url), 'utf8')
  assert.match(actions, /fn open_pairing_window[\s\S]+?get_local_sunshine_url\(\)[\s\S]+?windows::open_pin_window\(&pin_handle\)/)
})

const webContract = process.env.FOUNDATION_ONLINE_WEB_CONTRACT
test('the WebUI and tray project the same contract fixtures', { skip: !webContract }, async () => {
  const web = await import(pathToFileURL(webContract).href)
  const cases = [null, {}, { kanade: tray().kanade }, { capabilities: ['kanade-v1'] }, tray({ version: 2 }),
    tray({ updated_at_ms: String(timestamp) }), tray({ updated_at_ms: timestamp - KANADE_ONLINE_MAX_AGE_MS - 1 }),
    ...['disabled', 'missing', 'incompatible', 'unavailable'].map((component) => tray({ component })),
    tray({ control: 'unreachable', transport: 'standby', registration: 'unregistered', pending_count: 0 }),
    tray({ component: 'available', control: 'online', registration: 'registered', transport: 'protected', pending_count: 2,
      connection_authorized: true, native_paired: false, streaming: true }),
    tray({ pending_count: '2', connection_authorized: 1, native_paired: null, streaming: 'true' })]
  const summary = (rows) => rows.map(({ id, level, count }) => [id, level, count ?? null])
  for (const raw of cases) {
    const webState = web.readKanadeOnlineState(raw, { now: timestamp })
    const mode = harness()
    mode.receiveMonitor(raw)
    const [trayState] = mode.latest()
    assert.deepEqual(summary(kanadeOnlineRows(trayState)), summary(web.kanadeOnlineRows(webState)))
    assert.deepEqual(kanadeOnlineActions({ state: trayState }), web.kanadeOnlineActions({ state: webState }))
  }
})

// Renderer for the versioned tray wire contract; no host endpoints or actions live here.
const cap = 'kanade-v1'
export const KANADE_ONLINE_MAX_AGE_MS = 120000
const words = {
  component: ['available', 'disabled', 'missing', 'incompatible', 'unavailable'],
  registration: ['registered', 'unregistered'],
  control: ['online', 'offline', 'unreachable'],
  transport: ['standby', 'protected'],
}
const validInt = (value) => Number.isSafeInteger(value) && value >= 0
const inSet = (value, key) => words[key].includes(value) ? value : 'unknown'
const flag = (value, yes, no) => typeof value === 'boolean' ? (value ? yes : no) : 'unknown'

export function readKanadeOnlineState(raw, { now = Date.now() } = {}) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { presence: 'unavailable', data: null }
  const src = raw.kanade
  if (!Array.isArray(raw.capabilities) || !raw.capabilities.includes(cap) || !src ||
      src.version !== 1 || !validInt(src.updated_at_ms) || src.updated_at_ms === 0) {
    return { presence: 'unsupported', data: null }
  }
  return expireKanadeOnlineState({ presence: 'supported', at: src.updated_at_ms, data: {
    component: inSet(src.component, 'component'),
    registration: inSet(src.registration, 'registration'),
    control: inSet(src.control, 'control'),
    count: validInt(src.pending_count) ? src.pending_count : null,
    transport: inSet(src.transport, 'transport'),
    connection: flag(src.connection_authorized, 'authorized', 'not_authorized'),
    pairing: flag(src.native_paired, 'paired', 'unpaired'),
    streaming: flag(src.streaming, 'active', 'idle'),
  } }, now)
}

export function expireKanadeOnlineState(state, now) {
  return state?.data && Math.abs(now - state.at) > KANADE_ONLINE_MAX_AGE_MS ? { presence: 'stale', data: null } : state
}

export function kanadeOnlineRows(state) {
  const data = state?.data
  if (!data) return [{ id: 'presence', level: state?.presence ?? 'unavailable' }]
  return [
    { id: 'component', level: data.component }, { id: 'registration', level: data.registration }, { id: 'control', level: data.control },
    { id: 'pending', level: data.count === null ? 'unknown' : data.count > 0 ? 'count' : 'none', count: data.count },
    { id: 'transport', level: data.transport }, { id: 'connection', level: data.connection },
    { id: 'pairing', level: data.pairing }, { id: 'streaming', level: data.streaming },
  ]
}

export function kanadeOnlineActions({ state, busy } = {}) {
  const data = state?.data
  const reason = ({ unsupported: 'unsupported_host', unavailable: 'state_unreadable', stale: 'state_stale' })[state?.presence]
    ?? (data && !['available', 'unknown'].includes(data.component) ? 'component_unavailable'
      : ['offline', 'unreachable'].includes(data?.control) ? 'control_offline' : 'no_handler')
  return [
    { id: 'refresh', enabled: !busy, reason: busy ? 'busy' : '' },
    { id: 'companion', enabled: false, reason }, { id: 'user_center', enabled: false, reason },
    { id: 'native_pin', enabled: true, reason: '' },
  ]
}

const labels = {
  'panel.title': ['Online mode', '在线模式'],
  'panel.description': ['Kanade authorization does not replace the native Sunshine PIN.', 'Kanade 授权不能替代 Sunshine 原生 PIN。'],
  'note.per_connection': ['Authorization, pairing and streaming are reported separately for this connection.', '授权、配对和串流仅针对当前连接，分别报告。'],
  'note.absence': ['Local network access and native PIN are still available.', '仍可使用局域网连接与原生 PIN。'],
  'presence.unsupported': ['This host does not provide a compatible online-mode status.', '当前主机未提供兼容的在线模式状态。'],
  'presence.unavailable': ['Cannot read the host’s online-mode status.', '暂时无法读取主机的在线模式状态。'],
  'presence.stale': ['Host status expired. Refresh to check again.', '主机状态已过期，请刷新重试。'],
  'field.component': ['Kanade component', 'Kanade 组件'], 'field.registration': ['Registration', '登记'],
  'field.control': ['Control plane', '控制面'], 'field.pending': ['Pending requests', '待处理请求'], 'field.transport': ['Transport', '传输'],
  'field.connection': ['Kanade connection', 'Kanade 连接'], 'field.pairing': ['Native pairing', '原生配对'], 'field.streaming': ['Streaming', '串流'],
  available: ['Ready', '正常'], disabled: ['Disabled', '已禁用'], missing: ['Not installed', '未安装'],
  incompatible: ['Incompatible version', '版本不兼容'], unavailable: ['Unavailable', '不可用'],
  registered: ['Registered', '已登记'], unregistered: ['Not registered', '未登记'],
  online: ['Online', '在线'], offline: ['Offline', '离线'], unreachable: ['Unreachable', '不可达'], none: ['None', '没有'],
  standby: ['Standby', '待命'], protected: ['Protected path ready', '受保护路径已就绪'],
  authorized: ['Authorized', '已获授权'], not_authorized: ['Not authorized', '未获授权'],
  paired: ['Paired', '已配对'], unpaired: ['Not paired', '未配对'], active: ['Streaming now', '正在串流'], idle: ['Not streaming', '没有串流'], unknown: ['Unknown', '未知'],
  'action.refresh': ['Refresh', '刷新'], 'action.companion': ['Open companion', '打开 companion'],
  'action.user_center': ['Open User Center', '打开 User Center'], 'action.native_pin': ['Enter native PIN', '输入原生 PIN'],
  'action_reason.busy': ['Reading host status.', '正在读取主机状态。'],
  'action_reason.no_handler': ['No trusted way to open it.', '尚无可信打开方式。'],
  'action_reason.unsupported_host': ['No compatible online mode.', '没有兼容的在线模式。'],
  'action_reason.state_unreadable': ['Host status is unavailable.', '主机状态不可用。'],
  'action_reason.state_stale': ['Refresh the expired status first.', '请先刷新已过期的状态。'],
  'action_reason.component_unavailable': ['Kanade is unavailable.', 'Kanade 不可用。'],
  'action_reason.control_offline': ['Control plane is offline.', '控制面离线。'],
}
export function onlineModeText(locale, key) {
  return labels[key][/^zh/i.test(locale) ? 1 : 0]
}

export function onlineModeRowText(locale, row) {
  if (row.level === 'count') return /^zh/i.test(locale) ? `${row.count} 项` : String(row.count)
  return onlineModeText(locale, row.id === 'presence' ? `presence.${row.level}` : row.level)
}

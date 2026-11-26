<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { createTrayOnlineMode } from './trayOnlineMode.js'
import {
  kanadeOnlineActions, kanadeOnlineRows, onlineModeRowText, onlineModeText,
} from './kanadeOnlineMode.js'

const props = defineProps({ state: Object, token: Number, transport: Object })
const expanded = ref(false)
const current = ref(null)
const busy = ref(false)
const mode = createTrayOnlineMode({
  read: () => props.transport.refreshOnlineMode(props.token),
  publish: (snapshot, pending) => { current.value = snapshot; busy.value = pending },
})
watch(() => props.state?.online_mode ?? null, (snapshot) => mode.receiveMonitor(snapshot), { immediate: true })
onUnmounted(mode.dispose)

const text = (key) => onlineModeText(props.state?.locale, key)
const rows = computed(() => kanadeOnlineRows(current.value))
const rowText = (row) => onlineModeRowText(props.state?.locale, row)
// Neither of these external programs has a trusted opener in the locked package.
const actions = computed(() => kanadeOnlineActions({ state: current.value, busy: busy.value }))

function act(id) {
  if (!actions.value.find((action) => action.id === id)?.enabled) return
  if (id === 'refresh') void mode.refresh()
  else if (id === 'native_pin') props.transport.act(props.token, 'online_native_pin')
}
function toggle() {
  expanded.value = !expanded.value
  if (expanded.value) mode.checkAge()
}
</script>

<template>
  <section class="tray-online">
    <button class="tray-online__trigger" type="button" :aria-expanded="expanded" aria-controls="tray-online-details" @click="toggle">
      {{ text('panel.title') }}
      <span aria-hidden="true">{{ expanded ? '−' : '+' }}</span>
    </button>
    <div v-show="expanded" id="tray-online-details" class="tray-online__details">
      <p>{{ text('panel.description') }}</p>
      <p v-if="rows[0].id === 'presence'" role="status">{{ rowText(rows[0]) }} {{ text('note.absence') }}</p>
      <dl v-else aria-live="polite">
        <div v-for="row in rows" :key="row.id">
          <dt>{{ text(`field.${row.id}`) }}</dt>
          <dd>{{ rowText(row) }}</dd>
        </div>
      </dl>
      <p v-if="rows[0].id !== 'presence'">{{ text('note.per_connection') }}</p>
      <div class="tray-online__actions">
        <div v-for="action in actions" :key="action.id">
          <button type="button" :disabled="!action.enabled" :aria-describedby="action.reason ? `tray-online-reason-${action.id}` : undefined" @click="act(action.id)">
            {{ text(`action.${action.id}`) }}
          </button>
          <small v-if="action.reason" :id="`tray-online-reason-${action.id}`">{{ text(`action_reason.${action.reason}`) }}</small>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tray-online { margin-block-end: .45rem; }
.tray-online__trigger, .tray-online__actions button {
  color: var(--md-sys-color-on-secondary-container);
  background: var(--md-sys-color-secondary-container);
  border: 0;
  border-radius: .65rem;
  font: inherit;
  cursor: pointer;
  min-height: 2rem;
  padding: .3rem .65rem;
}
.tray-online__trigger { display: flex; align-items: center; justify-content: space-between; width: 100%; text-align: start; }
:global(.m-tray.is-touch) .tray-online button { min-height: 2.75rem; }
.tray-online button:focus-visible { outline: 2px solid var(--md-sys-color-primary); outline-offset: 1px; }
.tray-online__details { padding: .35rem .45rem; color: var(--md-sys-color-on-surface); font-size: .85rem; overflow-wrap: anywhere; }
.tray-online__details p, .tray-online__details dl { margin: .35rem 0; }
.tray-online__details dl > div { display: flex; gap: .5rem; justify-content: space-between; padding: .2rem 0; border-bottom: 1px solid var(--md-sys-color-outline-variant); }
.tray-online__details dd { margin: 0; text-align: end; }
.tray-online__actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .3rem; }
.tray-online__actions button { width: 100%; }
.tray-online__actions button:disabled { color: var(--md-sys-color-on-surface-variant); background: transparent; cursor: default; }
.tray-online__actions small { display: block; color: var(--md-sys-color-on-surface-variant); line-height: 1.25; }
</style>

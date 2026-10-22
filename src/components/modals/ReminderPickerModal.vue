<script setup lang="ts">
import { useId } from 'vue'
import Modal from './Modal.vue'
import RoleIcon from '../RoleIcon.vue'

defineProps<{
  seat: number
  targetLabel?: string
  options: Array<{ role: string; name: string; [key: string]: unknown }>
  isImageOptIn: boolean
}>()
const search = defineModel<string>('search', { default: '' })
const tab = defineModel<string>('tab', { default: 'related' })
const emit = defineEmits<{
  close: []
  select: [reminder: { role: string; name: string; [key: string]: unknown }]
}>()
const prefix = `reminder-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
</script>

<template>
  <Modal name="reminder-picker" :aria-label="`添加提示标记到 ${targetLabel || `${seat + 1} 号座位`}`" :show-close="false" @close="emit('close')">
    <div class="reminder-picker">
      <header class="reminder-picker__header">
        <strong>添加提示标记到 <b>{{ targetLabel || `${seat + 1} 号座位` }}</b></strong>
        <input v-model="search" type="search" placeholder="搜索" aria-label="搜索提示标记" />
      </header>
      <div :id="`${prefix}-options`" class="reminder-picker__grid" role="tabpanel"
        :aria-labelledby="`${prefix}-${tab}`">
        <button v-for="(reminder, index) in options" :key="`${reminder.role}:${reminder.name}`"
          type="button" class="reminder-picker__token" :aria-label="`添加提示：${reminder.name}`"
          :title="reminder.name" @click="emit('select', reminder)">
          <RoleIcon :role="reminder" :is-image-opt-in="isImageOptIn" />
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <defs><path :id="`${prefix}-curve-${index}`" d="M 12 50 A 38 38 0 0 0 88 50" /></defs>
            <text text-anchor="middle" :font-size="reminder.name.length > 5 ? 12 : 15">
              <textPath :href="`#${prefix}-curve-${index}`" startOffset="50%">{{ reminder.name }}</textPath>
            </text>
          </svg>
        </button>
        <p v-if="!options.length" class="reminder-picker__empty" role="status">
          {{ search.trim() ? '没有匹配的提示标记' : '暂无可添加的提示标记' }}
        </p>
      </div>
      <nav class="reminder-picker__tabs" role="tablist" aria-label="提示标记分类">
        <button :id="`${prefix}-related`" type="button" role="tab" :aria-selected="tab === 'related'"
          :aria-controls="`${prefix}-options`" :class="{ active: tab === 'related' }" @click="tab = 'related'">相关提示</button>
        <button :id="`${prefix}-other`" type="button" role="tab" :aria-selected="tab === 'other'"
          :aria-controls="`${prefix}-options`" :class="{ active: tab === 'other' }" @click="tab = 'other'">其他提示</button>
      </nav>
    </div>
  </Modal>
</template>

<style lang="scss" scoped>
:global(.modal-backdrop.modal-backdrop--reminder-picker) {
  align-items: center;
  padding: 12px;
  background: rgba(0, 0, 0, .18);
  backdrop-filter: none;
}
:global(.modal-backdrop.modal-backdrop--reminder-picker .modal) {
  width: min(550px, 100%);
  max-height: calc(100dvh - 24px);
  border: 2px solid #050505;
  border-radius: 7px;
  background: rgba(15, 15, 14, .87);
  box-shadow: 0 3px 15px #0009;
  color: #fff;
}
:global(.modal-backdrop.modal-backdrop--reminder-picker .modal::before),
:global(.modal-backdrop.modal-backdrop--reminder-picker .modal::after) { display: none; }
:global(.modal-backdrop.modal-backdrop--reminder-picker .modal > .slot) { padding: 0; }
.reminder-picker { display: flex; flex-direction: column; font-family: var(--ts-font-ui, sans-serif); }
.reminder-picker__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 5px 7px;
  border-bottom: 2px solid #050505;
  strong { font-size: 20px; font-weight: 500; white-space: nowrap; }
  b { font-weight: 700; }
  input {
    min-width: 0;
    width: 105px;
    flex: 0 1 105px;
    height: 28px;
    padding: 1px 6px;
    border: 1px solid #e6bd52;
    border-radius: 4px;
    background: #fff;
    color: #222;
    font: inherit;
    text-align: center;
    box-shadow: 0 0 5px #e6bd5290;
  }
}
.reminder-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(78px, 1fr));
  gap: 7px;
  max-height: min(420px, 55dvh);
  min-height: 100px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 10px;
  scrollbar-width: thin;
}
.reminder-picker__token {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  align-self: start;
  padding: 0;
  border: 2px solid #030303;
  border-radius: 50%;
  background: url('@/assets/reminder.png') center / cover no-repeat;
  color: #fff;
  box-shadow: 0 2px 6px #0009;
  cursor: pointer;
  transition: transform 120ms ease;
  .icon { position: absolute; width: 70%; height: 70%; top: 4%; left: 15%; background-size: contain; }
  svg { position: absolute; inset: 0; width: 100%; height: 100%; fill: currentColor; overflow: visible; }
  text { font-weight: 700; paint-order: stroke; stroke: #09070d; stroke-width: 2px; stroke-linejoin: round; }
  &:hover { transform: scale(1.06); }
  &:focus-visible { outline: 2px solid #e6bd52; outline-offset: 2px; }
}
.reminder-picker__empty { grid-column: 1 / -1; align-self: center; margin: 0; color: #cfc9d5; text-align: center; font-size: 14px; }
.reminder-picker__tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-top: 2px solid #050505;
  button {
    min-height: 34px;
    padding: 2px 8px;
    border: 0;
    color: #fff;
    background: linear-gradient(#292827, #0c0c0c);
    cursor: pointer;
    font: inherit;
    font-size: 20px;
    & + button { border-left: 2px solid #050505; }
    &.active { background: linear-gradient(#8d35cf, #351251); }
    &:focus-visible { outline: 2px solid #e6bd52; outline-offset: -2px; }
  }
}
@media (max-width: 480px) {
  .reminder-picker__header strong { font-size: 15px; }
  .reminder-picker__header input { flex-basis: 80px; width: 80px; }
  .reminder-picker__grid { grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); }
  .reminder-picker__tabs button { font-size: 17px; }
}
@media (prefers-reduced-motion: reduce) { .reminder-picker__token { transition: none; } }
</style>

<script setup>
import { computed, ref } from 'vue'
import RoleIcon from './RoleIcon.vue'

const props = defineProps({
  sections: { type: Array, required: true },
  canEdit: Boolean,
  compact: Boolean,
  isImageOptIn: Boolean,
})
const emit = defineEmits(['toggle-marker'])
const selectedKey = ref(null)
const section = computed(() => props.sections.find(item => item.key === selectedKey.value)
  || props.sections.find(item => item.isCurrent) || props.sections[0])
const choices = computed(() => [...props.sections].sort((a, b) => Number(a.key !== 'first') - Number(b.key !== 'first')))
function label(key) { return key === 'first' ? '首个夜晚' : '其他夜晚' }
function reminder(role) {
  if (role.alias === 'minioninfo') return '如果有七名或更多玩家，唤醒所有爪牙：让他们互相认识，并指认恶魔。'
  if (role.alias === 'demoninfo') return '如果有七名或更多玩家，唤醒恶魔：指认所有爪牙，并展示三个不在场的善良角色。'
  return (section.value?.key === 'first' ? role.firstNightReminder : role.otherNightReminder) || ''
}
function markerTitle(role) {
  if (role.isConfigured) return `${role.name} 已配置，唤醒标记自动显示`
  if (!props.canEdit) return `${role.name} ${role.isWakeMarked ? '已添加' : '尚未添加'}唤醒标记`
  return `${role.isWakeMarked ? '移除' : '添加'} ${role.name} 的手动唤醒标记`
}
</script>

<template>
  <div class="night-sheet" :class="{ 'is-compact': compact }">
    <div class="night-sheet__switch" role="group" aria-label="选择夜晚">
      <button v-for="choice in choices" :key="choice.key" type="button"
        :aria-pressed="section?.key === choice.key" :aria-controls="`night-sheet-${choice.key}`"
        @click="selectedKey = choice.key">{{ label(choice.key) }}<span v-if="choice.isCurrent"> · 当前</span></button>
    </div>
    <ol v-if="section" :id="`night-sheet-${section.key}`" class="night-sheet__list" :aria-label="`${label(section.key)}唤醒顺序`">
      <li class="night-sheet__row night-sheet__boundary">
        <span class="night-sheet__symbol is-dusk" aria-hidden="true">☾</span>
        <strong>黄昏</strong><p>夜晚阶段开始。</p>
      </li>
      <li v-for="entry in section.entries" :key="entry.key" class="night-sheet__row"
        :class="`night-sheet__row--${entry.role.team}`" :data-wake-marked="String(entry.role.isWakeMarked)" :data-wake-source="entry.role.wakeMarkerSource">
        <button type="button" class="night-sheet__role-icon" :class="{ 'is-marked': entry.role.isWakeMarked }"
          :disabled="!canEdit || entry.role.isConfigured" :aria-label="markerTitle(entry.role)" :title="markerTitle(entry.role)"
          :aria-pressed="entry.role.isWakeMarked" @click="emit('toggle-marker', section.key, entry.role)">
          <span v-if="entry.role.alias === 'minioninfo' || entry.role.alias === 'demoninfo'" class="night-sheet__symbol is-info" aria-hidden="true">{{ entry.role.alias === 'minioninfo' ? 'M' : 'D' }}</span>
          <RoleIcon v-else :role="entry.role" :is-image-opt-in="isImageOptIn" />
          <span v-if="entry.role.isWakeMarked" class="night-sheet__wake" aria-hidden="true">☀</span>
        </button>
        <strong>{{ entry.role.name }}</strong>
        <p v-if="reminder(entry.role)">{{ reminder(entry.role) }}</p>
      </li>
      <li v-if="!section.entries.length" class="night-sheet__empty">本剧本没有{{ label(section.key) }}行动角色</li>
      <li class="night-sheet__row night-sheet__boundary">
        <span class="night-sheet__symbol is-dawn" aria-hidden="true">☀</span>
        <strong>黎明</strong><p>稍等一会，结束夜晚阶段。</p>
      </li>
    </ol>
  </div>
</template>

<style scoped lang="scss">
.night-sheet { font: var(--reference-text-size, 14px)/1.25 var(--ts-font-ui, sans-serif); padding: 0 .8em 2.5em 3.6em; }
.night-sheet__switch { display: flex; gap: .35em; justify-content: center; margin: 0 0 .7em; }
.night-sheet__switch button { flex: 1; max-width: 12em; padding: .35em .6em; border: 1px solid #69532b55; border-radius: 3px; background: #fff4; color: #594724; font: inherit; cursor: pointer; }
.night-sheet__switch button[aria-pressed='true'] { background: #b78227; border-color: #89601d; color: #fff8e6; box-shadow: inset 0 1px #ffedab88; }
.night-sheet__switch button:focus-visible, .night-sheet__role-icon:focus-visible { outline: 2px solid #77551c; outline-offset: 2px; }
.night-sheet__list { padding: 0; margin: 0; list-style: none; }
.night-sheet__row { --night-ink: #171512; display: grid; grid-template-columns: 3.4em 8em minmax(0, 1fr); align-items: center; gap: .6em; min-height: 3.5em; padding: .12em 0; }
.night-sheet__row--townsfolk, .night-sheet__row--outsider { --night-ink: #007d9e; }
.night-sheet__row--minion, .night-sheet__row--demon { --night-ink: #a12736; }
.night-sheet__row--traveler { --night-ink: #75408d; }
.night-sheet__row--fabled { --night-ink: #946719; }
.night-sheet__row strong { min-width: 0; text-align: right; color: var(--night-ink); font-size: 1.12em; overflow-wrap: anywhere; }
.night-sheet__row p { margin: 0; padding-left: .65em; border-left: 2px solid var(--night-ink); color: #171512; overflow-wrap: anywhere; }
.night-sheet__role-icon { position: relative; width: 3.4em; height: 3.4em; display: grid; place-items: center; border: 0; padding: 0; background: transparent; font-size: inherit; cursor: pointer; }
.night-sheet__role-icon:disabled { cursor: default; }
.night-sheet__role-icon:hover:not(:disabled) { background: #b18c2822; border-radius: 50%; }
.night-sheet__role-icon .icon { width: 100%; height: 100%; background-size: contain; filter: drop-shadow(0 1px 1px #4f320c44); }
.night-sheet__wake { position: absolute; right: -.1em; bottom: 0; font-size: 1em; color: #986411; text-shadow: 0 0 3px #fff; }
.night-sheet__symbol { justify-self: center; display: grid; place-items: center; width: 2.5em; height: 2.5em; border-radius: 50%; font: bold 1.15em/1 Georgia, serif; }
.night-sheet__symbol.is-dusk, .night-sheet__symbol.is-info { background: #2d1e40; color: #fff8e6; }
.night-sheet__symbol.is-dusk { font-size: 1.35em; width: 2.1em; height: 2.1em; }
.night-sheet__symbol.is-info { font-size: 2em; width: 1.4em; height: 1.4em; font-weight: normal; }
.night-sheet__symbol.is-dawn { background: #d89912; color: #fff9e5; }
.night-sheet__empty { padding: .7em; color: #69532b; }
@container (max-width: 440px) {
  .night-sheet { padding-left: 3.3em; padding-right: .5em; }
  .night-sheet__row { grid-template-columns: 2.6em 5em minmax(0, 1fr); gap: .35em; }
  .night-sheet__role-icon { width: 2.6em; height: 2.6em; }
  .night-sheet__row strong { font-size: 1em; }
}
.night-sheet.is-compact {
  padding: .6em .4em 2.5em 2em; font-size: 12px;
  .night-sheet__switch { flex-wrap: wrap; gap: .2em; }
  .night-sheet__switch button { padding: .3em; font-size: 11px; }
  .night-sheet__row { grid-template-columns: 2.5em minmax(0, 1fr); gap: .3em; min-height: 2.8em; }
  .night-sheet__role-icon { width: 2.5em; height: 2.5em; }
  .night-sheet__row strong { font-size: 1em; }
  .night-sheet__row p { display: none; }
  .night-sheet__symbol { font-size: .9em; }
  .night-sheet__symbol.is-info { font-size: 1.5em; }
}
</style>

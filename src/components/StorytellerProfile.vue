<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import Token from './Token.vue'
import RoleIcon from './RoleIcon.vue'
import HandSignal from './HandSignal.vue'
import VoiceSpeakingRing from './VoiceSpeakingRing.vue'
import type { Role } from '@/types/domain'

const props = withDefaults(defineProps<{
  name: string
  avatar: string
  role?: Role | null
  reminders: Array<Role & { name: string }>
  pending?: boolean
  isImageOptIn: boolean
  handSignal?: string
  canManage?: boolean
  isSpeaking?: boolean
  canTextChat?: boolean
  textUnread?: number
}>(), { canManage: true })
const emit = defineEmits<{
  action: [action: 'role' | 'reminder' | 'remove']
  removeReminder: [name: string]
  textChat: []
}>()
const open = ref(false)
const root = ref<HTMLElement>()
const trigger = ref<HTMLButtonElement>()
const menu = ref<HTMLElement>()

async function toggle() {
  if (!props.canManage) return
  open.value = !open.value
  if (open.value) {
    await nextTick()
    menu.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
  }
}
function close(restoreFocus = false) {
  open.value = false
  if (restoreFocus) trigger.value?.focus({ preventScroll: true })
}
function act(action: 'role' | 'reminder' | 'remove') {
  if (!props.canManage) return
  close()
  emit('action', action)
}
function outside(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) close()
}
function keydown(event: KeyboardEvent) {
  if (!open.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close(true)
  } else if (event.key === 'Tab') close()
  else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault()
    const buttons = [...(menu.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])]
    if (!buttons.length) return
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length
    buttons[index]?.focus({ preventScroll: true })
  }
}
onMounted(() => document.addEventListener('pointerdown', outside, true))
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside, true))
</script>

<template>
  <section ref="root" class="storyteller-profile" :class="{ 'has-hand-signal': handSignal }" aria-label="说书人" @keydown="keydown">
    <button ref="trigger" type="button" class="storyteller-profile__portrait"
      :data-speaking="isSpeaking || undefined"
      :aria-label="canManage ? '说书人操作' : `说书人：${name}`" :aria-haspopup="canManage ? 'menu' : undefined" :aria-expanded="canManage ? open : undefined" :disabled="pending" @click="toggle">
      <img :src="avatar" alt="" />
      <VoiceSpeakingRing :active="isSpeaking" />
      <span class="storyteller-profile__name"><span>{{ name }}</span><small>说书人</small></span>
    </button>
    <button v-if="canTextChat" type="button" class="storyteller-profile__text-action"
      :class="{ 'has-unread': textUnread }" aria-label="向说书人发送文本信息" title="向说书人发送文本信息"
      @click.stop="emit('textChat')">
      <font-awesome-icon icon="envelope" /><small v-if="textUnread">{{ textUnread }}</small>
    </button>
    <Transition name="hand-signal">
      <HandSignal v-if="handSignal" class="storyteller-profile__hand" :icon="handSignal" :name="name" :is-image-opt-in="isImageOptIn" />
    </Transition>
    <div v-if="canManage && (role || reminders.length)" class="storyteller-profile__tokens" aria-label="说书人角色与提示标记">
      <button v-if="role" type="button" class="storyteller-profile__role" :aria-label="`改变说书人角色：${role.name}`"
        :disabled="pending" @click="act('role')"><Token :role="role" /></button>
      <button v-for="reminder in reminders" :key="reminder.name" type="button"
        class="storyteller-profile__reminder" :aria-label="`移除说书人提示：${reminder.name}`"
        :disabled="pending" @click="emit('removeReminder', reminder.name)">
        <RoleIcon :role="reminder" :is-image-opt-in="isImageOptIn" /><span>{{ reminder.name }}</span>
      </button>
    </div>
    <div v-if="canManage && open" ref="menu" class="storyteller-profile__menu" role="menu" aria-label="说书人操作菜单">
      <button type="button" role="menuitem" :disabled="pending" @click="act('role')"><font-awesome-icon icon="theater-masks" />改变角色</button>
      <button type="button" role="menuitem" :disabled="pending" @click="act('reminder')"><font-awesome-icon icon="plus-circle" />添加提示标记</button>
      <button type="button" role="menuitem" :disabled="pending" @click="act('remove')"><font-awesome-icon icon="times-circle" />移除说书人</button>
    </div>
  </section>
</template>

<style scoped lang="scss">
.storyteller-profile {
  --portrait-size: clamp(86px, 12vmin, 144px);
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 55;
  width: var(--portrait-size);
  font-family: var(--ts-font-ui, sans-serif);
  button { font: inherit; cursor: pointer; &:disabled { cursor: wait; } }
  button:focus-visible { outline: 2px solid #f0ce72; outline-offset: 2px; }
}
.storyteller-profile__portrait {
  position: relative;
  display: block;
  width: 100%;
  height: var(--portrait-size);
  padding: 0;
  border: 2px solid #161118;
  border-radius: 6px;
  background: #251341;
  color: white;
  box-shadow: 0 2px 5px #0009;
  img { width: 100%; height: 100%; display: block; object-fit: cover; border-radius: 4px; }
}
.storyteller-profile__hand {
  --hand-size: calc(var(--portrait-size) * .62);
  position: absolute;
  left: calc(100% + 36px);
  top: 10%;
}
.storyteller-profile__name {
  position: absolute;
  top: calc(100% - 8px);
  left: 6%;
  width: 88%;
  padding: 2px 4px 5px;
  border: 1px solid #242221;
  border-radius: 0 0 3px 3px;
  background: #171914c9;
  text-shadow: 0 1px 2px black;
  line-height: 1.2;
  > span { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-size: clamp(14px, 1.8vmin, 22px); }
  small { display: block; margin-top: 2px; font-size: 12px; }
}
.storyteller-profile__menu {
  position: absolute;
  top: 0;
  left: calc(100% + 14px);
  z-index: 2;
  width: 190px;
  padding: 3px;
  border: 1px solid #e3ded3;
  border-radius: 6px;
  background: #34352fd9;
  box-shadow: 0 0 0 2px #171813, 0 3px 6px #0007;
  &::before { content: ''; position: absolute; left: -9px; top: 38px; width: 14px; height: 14px; border: solid #e3ded3; border-width: 0 0 1px 1px; background: #34352f; transform: rotate(45deg); }
  button { position: relative; display: flex; align-items: center; gap: 7px; width: 100%; min-height: 32px; padding: 2px 5px; border: 0; background: transparent; color: #fff; font-size: 18px; text-align: left; white-space: nowrap; text-shadow: 0 1px 2px #000; }
  button:hover, button:focus-visible { color: #ffe08a; background: #ffffff16; }
  svg { width: 20px; flex-shrink: 0; }
}
.storyteller-profile__tokens {
  position: absolute;
  top: 0;
  left: calc(100% - 28px);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  button { position: relative; padding: 0; border: 0; border-radius: 50%; background: transparent; }
}
.storyteller-profile__role {
  width: 66px;
  height: 66px;
  :deep(.token) { width: 100%; height: 100%; }
}
.storyteller-profile__reminder {
  width: 48px;
  height: 48px;
  background: url('@/assets/reminder.png') center / cover no-repeat !important;
  color: white;
  :deep(.icon) { position: absolute; top: 3%; left: 15%; width: 70%; height: 70%; background-size: contain; }
  span { position: absolute; bottom: 5px; left: 3px; right: 3px; font-size: 10px; line-height: 1; text-shadow: 0 1px 2px black; }
}
@media (max-width: 900px) {
  .storyteller-profile { --portrait-size: 72px; position: relative; grid-area: profile; top: auto; left: auto; margin-bottom: 30px; }
  .storyteller-profile__menu { width: 180px; button { font-size: 16px; } }
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import RoleIcon from './RoleIcon.vue'
import { useAppStore } from '@/stores/app'

const props = defineProps<{
  icon: string
  name: string
  seatAngle?: number
  isImageOptIn?: boolean
}>()
const role = computed(() => useAppStore().roles.get(props.icon.slice(5)) || { id: props.icon.slice(5) })
const placement = computed(() => {
  if (props.seatAngle === undefined) return undefined
  const radians = props.seatAngle * Math.PI / 180
  return {
    left: `${50 - Math.cos(radians) * 80}%`,
    top: `${50 - Math.sin(radians) * 80}%`,
    transform: `translate(-50%, -50%) rotate(${props.seatAngle + 315}deg)`,
  }
})
</script>

<template>
  <span class="hand-signal" :class="{ 'hand-signal--seated': seatAngle !== undefined }"
    :style="placement" role="img" :aria-label="`${name} 正在举手`">
    <span class="hand-signal__gesture" aria-hidden="true">
      <RoleIcon v-if="icon.startsWith('role:')" :role="role" :is-image-opt-in="isImageOptIn" />
      <span v-else>{{ icon }}</span>
    </span>
  </span>
</template>

<style scoped>
.hand-signal {
  display: grid;
  place-items: center;
  width: 1em;
  height: 1em;
  font-family: 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif;
  font-size: var(--hand-size, 64px);
  line-height: 1;
  transform: rotate(45deg);
  filter: drop-shadow(0 1px 1px #0009);
  pointer-events: none;
  user-select: none;
}
.hand-signal__gesture {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  transform: rotate(0deg);
  transform-origin: 50% 90%;
}
/* The gesture pivots at the wrist; the outer element keeps the seat direction. */
.hand-signal-enter-active, .hand-signal-leave-active {
  transition: opacity .24s ease;
}
.hand-signal-enter-active .hand-signal__gesture,
.hand-signal-leave-active .hand-signal__gesture,
.storyteller-signal-enter-active .hand-signal__gesture,
.storyteller-signal-leave-active .hand-signal__gesture {
  transition: transform .24s ease;
}
.hand-signal-enter-from, .hand-signal-leave-to { opacity: 0; }
.hand-signal-enter-from .hand-signal__gesture,
.hand-signal-leave-to .hand-signal__gesture,
.storyteller-signal-enter-from .hand-signal__gesture,
.storyteller-signal-leave-to .hand-signal__gesture {
  transform: rotate(90deg);
}
@media (prefers-reduced-motion: reduce) {
  .hand-signal-enter-active, .hand-signal-leave-active,
  .hand-signal__gesture { transition: none !important; }
}
.hand-signal--seated {
  position: absolute;
  z-index: 9;
  width: 55%;
  height: 55%;
  font-size: calc(var(--table-seat-size) * .42);
}
.hand-signal :deep(.icon) { display: block; width: 100%; height: 100%; background-size: contain; }
</style>

<script setup lang="ts">
import RoleIcon from './RoleIcon.vue'
import type { Role } from '@/types/domain'

defineProps<{
  name: string
  role: Role
  canEdit: boolean
  rotated: boolean
  pending: boolean
  isImageOptIn: boolean
}>()
defineEmits<{ rotate: []; remove: [] }>()
</script>

<template>
  <div class="reference-seat-reminder reminder-token" :class="{ 'is-rotated': rotated }">
    <button type="button" class="reminder-token__face" :disabled="!canEdit || pending"
      :aria-label="canEdit ? `操作提示：${name}` : name" :title="name" @click.stop>
      <span class="reminder-token__art">
        <RoleIcon :role="role" :is-image-opt-in="isImageOptIn" />
        <span class="reminder-token__name">{{ name }}</span>
      </span>
    </button>
    <div v-if="canEdit" class="reminder-token__actions" role="group" :aria-label="`${name}的操作`">
      <button type="button" :disabled="pending" :aria-label="`${rotated ? '恢复' : '旋转'}提示：${name}`"
        :aria-pressed="rotated" :title="rotated ? '恢复正向' : '旋转 180°'" @click.stop="$emit('rotate')">
        <font-awesome-icon icon="rotate-right" aria-hidden="true" />
      </button>
      <button type="button" :disabled="pending" :aria-label="`删除提示：${name}`" title="删除提示标记"
        @click.stop="$emit('remove')">
        <font-awesome-icon icon="trash-can" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.reminder-token__face {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  border-radius: inherit;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  &:disabled { cursor: default; opacity: 1; }
  &:focus-visible { outline: 2px solid #eed58e; outline-offset: 3px; }
}
.reminder-token__art {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  transition: transform 240ms ease-in-out;
  pointer-events: none;
}
.is-rotated .reminder-token__art { transform: rotate(180deg); }
.reminder-token__name {
  position: absolute;
  left: 2px;
  right: 2px;
  bottom: 5px;
  overflow-wrap: anywhere;
  text-shadow: 0 1px 2px #000;
  text-align: center;
}
.reminder-token__actions {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: inherit;
  background: #1b102a66;
  opacity: 0;
  visibility: hidden;
  transition: opacity 120ms linear, visibility 120ms;
  pointer-events: none;
  button {
    display: grid;
    place-items: center;
    flex: 0 0 21px;
    min-width: 0;
    height: 26px;
    padding: 0;
    border: 0;
    background: transparent;
    color: #fff;
    font-size: 19px;
    filter: drop-shadow(0 1px 2px #000);
    cursor: pointer;
    pointer-events: auto;
    &:hover, &:focus-visible { color: #f3d263; }
    &:focus-visible { outline: 2px solid #eed58e; outline-offset: -2px; border-radius: 4px; }
    &:disabled { cursor: wait; opacity: .5; }
  }
}
.reminder-token:has(:focus-visible) .reminder-token__actions {
  opacity: 1;
  visibility: visible;
}
@media (hover: hover) {
  .reminder-token:hover .reminder-token__actions {
    opacity: 1;
    visibility: visible;
  }
}
@media (hover: none) {
  .reminder-token:focus-within .reminder-token__actions {
    opacity: 1;
    visibility: visible;
  }
}
@media (prefers-reduced-motion: reduce) {
  .reminder-token__art, .reminder-token__actions { transition: none; }
}
</style>

<template>
  <Teleport to="body">
    <div ref="menu" class="role-token-menu" :style="position"
      role="menu" tabindex="-1" :aria-label="`第 ${seatIndex + 1} 席角色操作`" @keydown="onKeydown" @click.stop>
      <button role="menuitem" type="button" :disabled="!canEdit || pending" @click="emit('action', 'role')">
        <font-awesome-icon icon="masks-theater" /><span>改变角色</span>
      </button>
      <button role="menuitem" type="button" :disabled="!canChangeAlignment || pending" @click="emit('action', 'alignment')">
        <span class="alignment-icon" aria-hidden="true">☯</span><span>改变阵营</span>
      </button>
      <button v-if="showLife" role="menuitem" type="button" :disabled="pending" @click="emit('action', 'life')">
        <font-awesome-icon :icon="isDead ? 'heart' : 'skull'" /><span>{{ isDead ? '恢复存活' : '标记死亡' }}</span>
      </button>
      <button v-if="showNominate" role="menuitem" type="button" :disabled="!canNominate || pending" @click="emit('action', 'nominate-self')">
        <font-awesome-icon icon="hand-point-right" /><span>提名自己</span>
      </button>
      <button v-if="showWake" role="menuitem" type="button" :disabled="pending" @click="emit('action', 'wake')">
        <font-awesome-icon icon="eye" /><span>唤醒</span>
      </button>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { roleTokenMenuPosition } from '@/utils/roleTokenMenuPosition';

const props = defineProps<{
  anchor: HTMLElement | null;
  seatIndex: number;
  seatAngle?: number;
  canEdit: boolean;
  canChangeAlignment: boolean;
  canNominate: boolean;
  showNominate: boolean;
  showWake?: boolean;
  showLife?: boolean;
  isDead?: boolean;
  pending: boolean;
  isInteractionTarget?: (target: EventTarget | null) => boolean;
}>();
const emit = defineEmits<{
  close: [];
  action: [action: 'role' | 'alignment' | 'nominate-self' | 'wake' | 'life'];
}>();
const menu = ref<HTMLElement | null>(null);
const position = ref<Record<string, string>>({ visibility: 'hidden' });
let resizeObserver: ResizeObserver | undefined;
let animationFrame = 0;

function place() {
  if (!menu.value || !props.anchor?.isConnected) return;
  const anchor = props.anchor.getBoundingClientRect();
  const next = roleTokenMenuPosition(anchor, menu.value.getBoundingClientRect(),
    { width: window.innerWidth, height: window.innerHeight }, props.seatAngle ?? 90);
  if (Object.entries(next).some(([key, value]) => position.value[key] !== value)) position.value = next;
}
function followAnchor() {
  // Seats animate when their layout changes; ResizeObserver alone cannot see
  // translations. Track the anchor only while this small menu is mounted.
  place();
  animationFrame = window.requestAnimationFrame(followAnchor);
}
function outside(event: PointerEvent) {
  const target = event.target as Node;
  if (!menu.value?.contains(target) && !props.anchor?.contains(target)
    && !props.isInteractionTarget?.(event.target)) emit('close');
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    props.anchor?.focus({ preventScroll: true });
    emit('close');
  } else if (event.key === 'Tab') {
    emit('close');
  } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const buttons = Array.from(menu.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
    if (!buttons.length) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[index].focus();
  }
}
async function refresh() {
  await nextTick();
  place();
  await nextTick();
  (menu.value?.querySelector<HTMLButtonElement>('button:not(:disabled)') || menu.value)?.focus({ preventScroll: true });
}
watch(() => props.anchor, refresh);
watch(() => props.seatAngle, place);
onMounted(() => {
  void refresh();
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(place);
    if (menu.value) resizeObserver.observe(menu.value);
  }
  animationFrame = window.requestAnimationFrame(followAnchor);
  document.addEventListener('pointerdown', outside, true);
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  window.cancelAnimationFrame(animationFrame);
  document.removeEventListener('pointerdown', outside, true);
  window.removeEventListener('resize', place);
  window.removeEventListener('scroll', place, true);
});
</script>

<style scoped>
.role-token-menu {
  position: fixed;
  z-index: 1800;
  width: max-content;
  max-width: calc(100vw - 16px);
  box-sizing: border-box;
  padding: 2px 4px;
  border: 2px solid #eee;
  border-radius: 7px;
  background: rgb(24 24 24 / 88%);
  box-shadow: 0 0 0 1px #222, 0 3px 9px #0009;
  color: #eee;
  font-family: inherit;
  font-size: clamp(16px, 1.8vmin, 22px);
  line-height: 1.4;
}
.role-token-menu::after {
  content: '';
  position: absolute;
  left: var(--pointer-x);
  top: var(--pointer-y);
  width: 12px;
  height: 12px;
  border-right: 2px solid #eee;
  border-bottom: 2px solid #eee;
  background: #242424;
  visibility: var(--pointer-visibility, visible);
  transform: translate(-50%, -50%) rotate(var(--pointer-rotation));
  pointer-events: none;
}
.role-token-menu button {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  padding: 0 2px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: inherit;
  white-space: nowrap;
  cursor: pointer;
}
.role-token-menu button > :first-child { width: 1em; text-align: center; flex: 0 0 1em; }
.role-token-menu button:hover:not(:disabled),
.role-token-menu button:focus-visible { color: #e3bf44; outline: none; }
.role-token-menu button:disabled { color: #888; cursor: default; }
.alignment-icon { font-family: sans-serif; }
</style>

<script lang="ts">
const layers = new Map<symbol, { value: number }>()
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useAppStore } from '@/stores/app'

const props = defineProps<{ id: string; label: string; title: string; index: number }>()
const app = useAppStore()
// 0: closed, 1: names only, 2: full reference sheet.
const mode = ref(0)
const spot = ref<{ x: number; y: number } | null>(null)
const width = ref(660)
const height = ref(900)
const textSize = ref(14)
const interacting = ref(false)
const panel = ref<HTMLElement | null>(null)
const zIndex = ref(90)
const layerId = Symbol(props.id)
const storageKey = `ts-right-reference:${props.id}:v1`
let gesture: { kind: 'drag' | 'resize'; id: number; target: HTMLElement; x: number; y: number; left: number; top: number; width: number; height: number } | null = null
let moved = false
const compact = computed(() => mode.value === 1 && !spot.value)
const viewportWidth = ref(window.innerWidth)
const compactWidth = computed(() => Math.min(240, Math.max(160, viewportWidth.value * .12)))
const dockedWidth = computed(() => Math.min(1000, Math.max(280, viewportWidth.value * .4)))
const style = computed(() => ({ zIndex: zIndex.value, '--reference-text-size': `${textSize.value}px`, ...(spot.value ? {
  left: `${spot.value.x}px`, top: `${spot.value.y}px`, width: `${width.value}px`, height: `${height.value}px`,
} : { width: `${compact.value ? compactWidth.value : dockedWidth.value}px` }) }))
const tabStyle = computed(() => ({
  '--reference-index': props.index,
  right: mode.value && !spot.value ? `min(${compact.value ? compactWidth.value : dockedWidth.value}px, calc(100vw - 40px))` : '0px',
}))
function save() {
  try { localStorage.setItem(storageKey, JSON.stringify({ mode: mode.value, spot: spot.value, width: width.value, height: height.value, textSize: textSize.value })) } catch { /* Layout remains usable. */ }
}
function bringToFront() {
  const others = [...layers].filter(([id]) => id !== layerId).map(([, layer]) => layer)
  others.forEach((layer, index) => { layer.value = 90 + index })
  zIndex.value = 90 + others.length
}
function clamp() {
  viewportWidth.value = window.innerWidth
  width.value = Math.min(Math.max(280, width.value), Math.max(280, window.innerWidth - 40))
  height.value = Math.min(Math.max(180, height.value), Math.max(180, window.innerHeight - 24))
  if (spot.value) spot.value = {
    x: Math.max(0, Math.min(spot.value.x, window.innerWidth - width.value)),
    y: Math.max(8, Math.min(spot.value.y, window.innerHeight - height.value - 8)),
  }
}
function cycle() {
  // The edge label recalls a floating sheet to its narrow dock, like the reference.
  if (spot.value) { spot.value = null; mode.value = 1 }
  else mode.value = (mode.value + 1) % 3
  bringToFront(); clamp(); save()
}
function dock() { spot.value = null; mode.value = 2; clamp(); save() }
function reset() { spot.value = null; mode.value = 0; width.value = 660; height.value = 900; textSize.value = 14; clamp(); save() }
function zoom(delta: number) { textSize.value = Math.min(20, Math.max(10, textSize.value + delta)); save() }
function paperPointerDown(event: PointerEvent) {
  bringToFront()
  // The sheet itself is the drag surface; controls retain their own gestures.
  if ((event.target as HTMLElement).closest('button, a, input, select, textarea, [role="button"]')) return
  start(event, 'drag')
}
function start(event: PointerEvent, kind: 'drag' | 'resize') {
  if (!app.grimoire.allowTabMove) return
  if (event.button !== 0 || !panel.value) return
  bringToFront()
  const rect = panel.value.getBoundingClientRect()
  gesture = { kind, id: event.pointerId, target: event.currentTarget as HTMLElement, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, width: compact.value && kind === 'drag' ? dockedWidth.value : rect.width, height: rect.height }
  moved = false
  gesture.target.setPointerCapture?.(event.pointerId)
}
function move(event: PointerEvent) {
  if (!gesture || gesture.id !== event.pointerId) return
  const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y
  if (!moved && Math.hypot(dx, dy) < 4) return
  moved = true
  interacting.value = true
  mode.value = 2
  if (gesture.kind === 'drag') {
    width.value = gesture.width; height.value = gesture.height
    spot.value = { x: gesture.left + dx, y: gesture.top + dy }
    clamp()
  } else {
    // The top-left corner is the resize anchor. Hitting the viewport edge
    // stops the resize instead of pushing the whole sheet under the pointer.
    const maxWidth = Math.max(1, window.innerWidth - gesture.left - 8)
    const maxHeight = Math.max(1, window.innerHeight - gesture.top - 8)
    spot.value = { x: gesture.left, y: gesture.top }
    width.value = Math.min(maxWidth, Math.max(Math.min(280, maxWidth), gesture.width + dx))
    height.value = Math.min(maxHeight, Math.max(Math.min(180, maxHeight), gesture.height + dy))
  }
}
function end(event: PointerEvent) {
  if (!gesture || gesture.id !== event.pointerId) return
  if (gesture.target.hasPointerCapture?.(gesture.id)) gesture.target.releasePointerCapture(gesture.id)
  gesture = null; interacting.value = false; save()
}
function suppressClick(event: MouseEvent) {
  if (!moved) return
  moved = false; event.preventDefault(); event.stopPropagation()
}
function key(event: KeyboardEvent) {
  if (!app.grimoire.allowTabMove) return
  if (event.key === 'Home') { event.preventDefault(); dock(); return }
  const step = event.shiftKey ? 32 : 8
  const deltas: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
  const delta = deltas[event.key]
  if (!delta || !panel.value) return
  event.preventDefault()
  const rect = panel.value.getBoundingClientRect()
  mode.value = 2; width.value = rect.width; height.value = rect.height
  spot.value = { x: rect.left + delta[0], y: rect.top + delta[1] }; clamp(); save()
}
function resizeKey(event: KeyboardEvent) {
  if (!app.grimoire.allowTabMove) return
  const step = event.shiftKey ? 32 : 8
  const deltas: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
  const delta = deltas[event.key]
  if (!delta || !panel.value) return
  event.preventDefault()
  const rect = panel.value.getBoundingClientRect()
  mode.value = 2; spot.value = { x: rect.left, y: rect.top }
  const maxWidth = Math.max(1, window.innerWidth - rect.left - 8)
  const maxHeight = Math.max(1, window.innerHeight - rect.top - 8)
  width.value = Math.min(maxWidth, Math.max(Math.min(280, maxWidth), rect.width + delta[0]))
  height.value = Math.min(maxHeight, Math.max(Math.min(180, maxHeight), rect.height + delta[1]))
  save()
}
function openRequested(event: Event) {
  if ((event as CustomEvent).detail !== props.id) return;
  if (mode.value === 0) mode.value = 1;
  bringToFront(); clamp(); save();
}
onMounted(() => {
  window.addEventListener("ts-open-reference", openRequested);
  layers.set(layerId, zIndex)
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
    if (saved && [0, 1, 2].includes(saved.mode) && Number.isFinite(saved.width) && Number.isFinite(saved.height)) {
      mode.value = saved.mode; width.value = saved.width; height.value = saved.height
      if (Number.isFinite(saved.textSize)) textSize.value = Math.min(20, Math.max(10, saved.textSize))
      if (Number.isFinite(saved.spot?.x) && Number.isFinite(saved.spot?.y)) spot.value = saved.spot
    }
  } catch { /* Ignore invalid saved layouts. */ }
  clamp()
  window.addEventListener('resize', clamp)
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
  window.addEventListener('ts-hud-layout-reset', reset)
})
onBeforeUnmount(() => {
  window.removeEventListener("ts-open-reference", openRequested);
  layers.delete(layerId)
  window.removeEventListener('resize', clamp)
  window.removeEventListener('pointermove', move)
  window.removeEventListener('pointerup', end)
  window.removeEventListener('pointercancel', end)
  window.removeEventListener('ts-hud-layout-reset', reset)
})
</script>

<template>
  <button class="right-reference-tab" type="button" :style="tabStyle" :class="{ active: mode }"
    :aria-expanded="Boolean(mode)" :aria-controls="id" :aria-label="label" @click="cycle">{{ label }}</button>
  <Transition name="right-sheet">
  <section v-show="mode" :id="id" ref="panel" class="right-reference-sheet"
    :class="{ 'is-compact': compact, 'is-floating': spot, 'is-interacting': interacting }" :style="style" :aria-label="`${label}面板`" @pointerdown="paperPointerDown" @click.capture="suppressClick">
    <div class="right-reference-content">
      <header class="right-reference-heading">
        <button class="right-reference-title" type="button" :aria-label="`移动${label}面板`"
          title="拖动标题移动；双击或 Home 靠回右侧" @pointerdown="start($event, 'drag')" @keydown="key" @dblclick="dock">{{ title }}</button>
      </header>
      <slot :compact="compact" :floating="Boolean(spot)" />
    </div>
    <footer class="right-reference-tools">
      <button v-if="spot" type="button" :aria-label="`${label}面板靠回右侧`" title="靠回右侧" @click="dock">⇥</button>
      <button v-else type="button" :aria-label="compact ? `展开${label}说明` : `只显示${label}名称`" @click="mode = compact ? 2 : 1; save()">{{ compact ? '↔' : '↦' }}</button>
      <template v-if="spot">
        <button type="button" :aria-label="`缩小${label}文字`" :disabled="textSize <= 10" title="缩小文字" @click="zoom(-1)">−</button>
        <button type="button" :aria-label="`放大${label}文字`" :disabled="textSize >= 20" title="放大文字" @click="zoom(1)">＋</button>
      </template>
      <button type="button" :aria-label="`收起${label}面板`" @click="mode = 0; save()">×</button>
    </footer>
    <button v-show="!compact" type="button" class="right-reference-resize" :aria-label="`调整${label}面板大小`"
      title="拖动右下角调整大小；方向键微调" @pointerdown="start($event, 'resize')" @keydown="resizeKey">◢</button>
  </section>
  </Transition>
</template>

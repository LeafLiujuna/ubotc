<script lang="ts">
const layers = new Map<symbol, { value: number }>()
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'

const props = withDefaults(defineProps<{
  id: string
  label: string
  index: number
  open: boolean
  width?: number
  height?: number
  tokensOnlyAtRest?: boolean
  unreadCount?: number
}>(), { width: 350, height: 180 })
const emit = defineEmits<{ toggle: [] }>()
const app = useAppStore()
const panel = ref<HTMLElement | null>(null)
const spot = ref<{ x: number; y: number } | null>(null)
const size = ref({ width: props.width, height: props.height })
const zIndex = ref(80)
const interacting = ref(false)
const layerId = Symbol(props.id)
let gesture: {
  kind: 'drag' | 'resize'; pointerId: number; target: HTMLElement
  x: number; y: number; left: number; top: number; width: number; height: number
} | null = null
let suppressClick = false
const storageKey = `ts-edge-panel:${props.id}:v1`
const tokenSize = 106
const minSize = computed(() => props.tokensOnlyAtRest
  ? { width: tokenSize + 10, height: tokenSize + 10 }
  : { width: 180, height: 110 })
function bringToFront() {
  const others = [...layers].filter(([id]) => id !== layerId).map(([, layer]) => layer).sort((a, b) => a.value - b.value)
  others.forEach((layer, index) => { layer.value = 80 + index })
  zIndex.value = 80 + others.length
}
const panelStyle = computed(() => ({
  '--edge-index': props.index,
  '--edge-height': `${size.value.height}px`,
  '--edge-min-width': `${minSize.value.width}px`,
  '--edge-min-height': `${minSize.value.height}px`,
  '--edge-token-size': `${tokenSize}px`,
  ...(spot.value ? { left: `${spot.value.x}px`, top: `${spot.value.y}px` } : {}),
  width: `${size.value.width}px`, height: `${size.value.height}px`, zIndex: zIndex.value,
}))
const tabStyle = computed(() => ({
  '--edge-index': props.index,
  left: props.open && !spot.value ? `min(${size.value.width}px, calc(100vw - 44px))` : '0px',
}))

function clamp() {
  size.value = {
    width: Math.min(Math.max(minSize.value.width, size.value.width), Math.max(minSize.value.width, window.innerWidth - 44)),
    height: Math.min(Math.max(minSize.value.height, size.value.height), Math.max(minSize.value.height, window.innerHeight - 24)),
  }
  if (spot.value) {
    spot.value = {
      x: Math.max(0, Math.min(spot.value.x, window.innerWidth - size.value.width - 8)),
      y: Math.max(8, Math.min(spot.value.y, window.innerHeight - size.value.height - 8)),
    }
  }
}
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify({ spot: spot.value, size: size.value })) } catch { /* Session layout still works. */ }
}
function reset() {
  spot.value = null
  size.value = { width: props.width, height: props.height }
  clamp()
  persist()
}
function tabClick() {
  if (spot.value) {
    reset()
    if (!props.open) emit('toggle')
    return
  }
  emit('toggle')
}
function start(event: PointerEvent, kind: 'drag' | 'resize') {
  if (!app.grimoire.allowTabMove) return
  if (event.button !== 0 || !panel.value) return
  bringToFront()
  const target = event.target as HTMLElement
  if (kind === 'drag' && !target.closest('.edge-panel-grip')) {
    if (target.closest('button, a, input, textarea, select, [contenteditable="true"]')) return
    if (!props.tokensOnlyAtRest && target.closest('li, .token')) return
  }
  const rect = panel.value.getBoundingClientRect()
  gesture = { kind, pointerId: event.pointerId, target: event.currentTarget as HTMLElement,
    x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, width: rect.width, height: rect.height }
  suppressClick = false
}
function move(event: PointerEvent) {
  if (!gesture || event.pointerId !== gesture.pointerId) return
  const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y
  if (!suppressClick && Math.hypot(dx, dy) < 4) return
  if (!suppressClick) gesture.target.setPointerCapture?.(event.pointerId)
  suppressClick = true
  interacting.value = true
  if (gesture.kind === 'drag') {
    spot.value = { x: gesture.left + dx, y: gesture.top + dy }
    clamp()
  } else {
    spot.value = { x: gesture.left, y: gesture.top }
    const maxWidth = Math.max(1, window.innerWidth - gesture.left - 8)
    const maxHeight = Math.max(1, window.innerHeight - gesture.top - 8)
    size.value = {
      width: Math.min(maxWidth, Math.max(Math.min(minSize.value.width, maxWidth), gesture.width + dx)),
      height: Math.min(maxHeight, Math.max(Math.min(minSize.value.height, maxHeight), gesture.height + dy)),
    }
  }
}
function end(event: PointerEvent) {
  if (!gesture || event.pointerId !== gesture.pointerId) return
  if (gesture.target.hasPointerCapture?.(gesture.pointerId)) gesture.target.releasePointerCapture(gesture.pointerId)
  gesture = null
  interacting.value = false
  persist()
}
function click(event: MouseEvent) {
  if (!suppressClick) return
  suppressClick = false
  event.preventDefault()
  event.stopPropagation()
}
function key(event: KeyboardEvent, kind: 'drag' | 'resize') {
  if (!app.grimoire.allowTabMove) return
  if (event.key === 'Home') { event.preventDefault(); reset(); return }
  const step = event.shiftKey ? 32 : 8
  const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
  const change = delta[event.key]
  if (!change || !panel.value) return
  event.preventDefault()
  const rect = panel.value.getBoundingClientRect()
  if (kind === 'drag') spot.value = { x: rect.left + change[0], y: rect.top + change[1] }
  else {
    spot.value = { x: rect.left, y: rect.top }
    size.value = {
      width: Math.min(window.innerWidth - rect.left - 8, Math.max(minSize.value.width, rect.width + change[0])),
      height: Math.min(window.innerHeight - rect.top - 8, Math.max(minSize.value.height, rect.height + change[1])),
    }
  }
  if (kind === 'drag') clamp()
  persist()
}
watch(() => props.open, (open) => { if (open) { bringToFront(); clamp() } })
onMounted(() => {
  layers.set(layerId, zIndex)
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
    if (saved && Number.isFinite(saved.size?.width) && Number.isFinite(saved.size?.height)) {
      size.value = saved.size
      const oldDefaults: Record<string, [number, number]> = {
        'left-voice-panel': [350, 420], 'left-text-panel': [390, 490],
        'left-npc-panel': [330, 180], 'left-bluffs-panel': [330, 160],
      }
      const previous = oldDefaults[props.id]
      if (!saved.spot && previous && saved.size.width === previous[0] && saved.size.height === previous[1]) {
        size.value = { width: props.width, height: props.height }
      }
      if (Number.isFinite(saved.spot?.x) && Number.isFinite(saved.spot?.y)) spot.value = saved.spot
    }
  } catch { /* Ignore invalid saved layouts. */ }
  clamp()
  window.addEventListener('resize', clamp)
  window.addEventListener('ts-hud-layout-reset', reset)
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
})
onBeforeUnmount(() => {
  layers.delete(layerId)
  window.removeEventListener('resize', clamp)
  window.removeEventListener('ts-hud-layout-reset', reset)
  window.removeEventListener('pointermove', move)
  window.removeEventListener('pointerup', end)
  window.removeEventListener('pointercancel', end)
})
</script>

<template>
  <button type="button" class="reference-edge-tab" :class="{ active: open }" :style="tabStyle"
    :aria-label="label" :title="unreadCount ? `${unreadCount} 条未读消息` : undefined"
    :aria-expanded="open" :aria-controls="id" @click="tabClick"><span class="reference-edge-tab-label">{{ label }}</span><small v-if="unreadCount" class="edge-unread-badge" aria-hidden="true">{{ unreadCount }}</small></button>
  <Transition name="left-sheet">
  <section v-show="open" :id="id" ref="panel" class="reference-edge-panel"
    :class="{ 'is-floating': spot, 'is-token-panel': tokensOnlyAtRest, 'is-interacting': interacting }"
    :style="panelStyle" :aria-label="`${label}面板`" @pointerdown="start($event, 'drag')" @click.capture="click">
    <button type="button" class="edge-panel-grip" :aria-label="`移动${label}面板`"
      title="拖动面板；双击或 Home 恢复位置与大小" @dblclick="reset" @keydown="key($event, 'drag')"><span aria-hidden="true">······</span></button>
    <div class="edge-panel-content"><slot /></div>
    <button type="button" class="edge-panel-resize" :aria-label="`调整${label}面板大小`"
      title="拖动调整大小；方向键微调" @pointerdown.stop="start($event, 'resize')" @keydown="key($event, 'resize')"><span aria-hidden="true">◢</span></button>
  </section>
  </Transition>
</template>

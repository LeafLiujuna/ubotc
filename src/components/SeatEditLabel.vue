<template>
  <div class="seat-label seat-edit-label" :class="anchor">
    <div class="seat-edit-label__row">
      <button type="button" class="seat-edit-label__move" :disabled="editor.pending || !editor.canEdit" :aria-label="`移动 ${index + 1} 号座位`" title="拖动调整座位；也可点击后选择目标座位" :aria-pressed="editor.movingSeat === index"
        @pointerdown="startDrag" @pointermove="drag" @pointerup="finishDrag" @pointercancel="cancelDrag" @lostpointercapture="cancelDrag" @click.stop="selectMove">✥</button>
      <span class="seat-player-name">{{ name }}</span>
      <button type="button" class="seat-edit-label__remove" :disabled="editor.pending || !editor.canEdit || players.players.length <= editor.minimum" :aria-label="`移除 ${index + 1} 号座位`" @click.stop="editor.removeSeat(index)">×</button>
    </div>
    <span v-if="editor.movingSeat >= 0 && editor.movingSeat !== index" class="seat-claim">移动到 {{ index + 1 }} 号座位</span>
    <span v-else class="seat-claim">{{ occupied ? '拖动调整座位' : '坐在这里' }}</span>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount } from 'vue'
import { usePlayersStore } from '@/stores/players'
import { useSeatEditorStore } from '@/stores/seatEditor'
const props = defineProps<{ index: number; name: string; anchor: string; occupied: boolean }>()
const editor = useSeatEditorStore()
const players = usePlayersStore()
let start: { x: number; y: number; pointerId: number; target: HTMLElement } | null = null
let dragging = false
let suppressClick = false
function startDrag(event: PointerEvent) {
  if (event.button !== 0 || !editor.canEdit || editor.pending) return
  start = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, target: event.currentTarget as HTMLElement }
  start.target.setPointerCapture(event.pointerId)
}
function drag(event: PointerEvent) {
  if (!start || event.pointerId !== start.pointerId) return
  if (!dragging && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5) return
  dragging = true
  editor.movingSeat = props.index
  editor.dragX = event.clientX - start.x
  editor.dragY = event.clientY - start.y
  editor.dropSeat = -1
  const table = start.target.closest('.reference-table')
  let closest = Infinity
  table?.querySelectorAll<HTMLElement>('.reference-seat-group').forEach(seat => {
    if (Number(seat.dataset.seatIndex) === props.index) return
    const box = seat.getBoundingClientRect()
    const distance = Math.hypot(event.clientX - box.x - box.width / 2, event.clientY - box.y - box.height / 2)
    if (distance < Math.max(box.width, box.height) && distance < closest) {
      closest = distance
      editor.dropSeat = Number(seat.dataset.seatIndex)
    }
  })
}
function finishDrag(event: PointerEvent) {
  if (!start || event.pointerId !== start.pointerId) return
  const target = editor.dropSeat
  const wasDragging = dragging
  start = null
  dragging = false
  suppressClick = wasDragging
  if (wasDragging) {
    editor.cancelMove()
    if (target >= 0) void editor.moveSeat(props.index, target)
    else editor.cancelMove()
  }
}
function cancelDrag() {
  if (!start) return
  start = null
  dragging = false
  editor.cancelMove()
}
function selectMove() {
  if (suppressClick) { suppressClick = false; return }
  if (editor.movingSeat === props.index) editor.cancelMove()
  else if (editor.movingSeat >= 0) void editor.moveSeat(editor.movingSeat, props.index)
  else editor.movingSeat = props.index
}
onBeforeUnmount(cancelDrag)
</script>

<style scoped lang="scss">
.seat-edit-label { min-width: 85%; max-width: 128%; padding: 2px 4px; pointer-events: auto; }
.seat-edit-label__row { display: flex; align-items: center; width: 100%; gap: 4px; }
.seat-edit-label button { flex: 0 0 auto; width: 22px; height: 24px; padding: 0; border: 0; background: transparent; font-size: 22px; line-height: 1; cursor: pointer; }
.seat-edit-label button:disabled { opacity: .35; cursor: not-allowed; }
.seat-edit-label button:focus-visible { outline: 2px solid #f0d990; }
.seat-edit-label__move { color: #e8b535; cursor: grab !important; touch-action: none; }
.seat-edit-label__move:active { cursor: grabbing !important; }
.seat-edit-label__remove { color: #b38bdc; }
.seat-edit-label .seat-player-name { flex: 1; }
@media (max-width: 900px) {
  .seat-edit-label { min-width: 110%; font-size: 10px; }
  .seat-edit-label__row { gap: 0; }
  .seat-edit-label button { width: 17px; height: 20px; font-size: 18px; }
}
</style>

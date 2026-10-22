<script lang="ts" setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';

// ==================== Props ====================
const props = withDefaults(
  defineProps<{
    /** 默认标题文本（slot name="title" 未提供时显示） */
    title?: string;
    defaultWidth?: number;
    defaultHeight?: number;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
    defaultX?: number;
    defaultY?: number;
    /** 关闭后是否销毁 DOM */
    destroyOnClose?: boolean;
    /** 再次打开时是否恢复默认位置/尺寸 */
    resetPositionOnReopen?: boolean;
  }>(),
  {
    title: '',
    defaultWidth: 600,
    defaultHeight: 400,
    minWidth: 300,
    minHeight: 200,
    maxWidth: () => Math.min(window.innerWidth * 0.95, 1920),
    maxHeight: () => Math.min(window.innerHeight * 0.95, 1080),
    defaultX: undefined,
    defaultY: undefined,
    destroyOnClose: false,
    resetPositionOnReopen: false,
  },
);

// ==================== v-model ====================
const visible = defineModel<boolean>('visible', { default: false });

// ==================== Emits ====================
const emit = defineEmits<{
  resize: [payload: { width: number; height: number }];
  move: [payload: { x: number; y: number }];
  maximize: [isMaximized: boolean];
  close: [];
}>();

// ==================== 内部状态（仅用于 DOM 绑定） ====================
const windowEl = ref<HTMLElement | null>(null);
const windowStyle = ref<Record<string, string>>({});

// 非响应式 core 数据（直接读写，不触发 Vue 依赖追踪）
const state = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  isMaximized: false,
  savedX: 0,
  savedY: 0,
  savedWidth: 0,
  savedHeight: 0,
};

// ==================== 简易 throttle（尾调用保证） ====================
function throttleWithTrailing<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  let lastTime = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: any[] | null = null;

  const invoke = (args: any[]) => {
    lastTime = Date.now();
    fn(...args);
  };

  const throttled = (...args: any[]) => {
    const now = Date.now();
    const remaining = delay - (now - lastTime);
    if (remaining <= 0) {
      if (timer) { clearTimeout(timer); timer = null; }
      invoke(args);
    } else {
      pendingArgs = args;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          if (pendingArgs) {
            invoke(pendingArgs);
            pendingArgs = null;
          }
        }, remaining);
      }
    }
  };

  return throttled as unknown as T;
}

const emitResize = throttleWithTrailing(
  (payload: { width: number; height: number }) => emit('resize', payload),
  30,
);

const emitMove = throttleWithTrailing(
  (payload: { x: number; y: number }) => emit('move', payload),
  30,
);

// ==================== DOM style 同步 ====================
function syncStyle() {
  windowStyle.value = {
    left: state.x + 'px',
    top: state.y + 'px',
    width: state.width + 'px',
    height: state.height + 'px',
  };
}

// ==================== 默认值计算 ====================
function calcDefaultX(): number {
  if (props.defaultX !== undefined) return props.defaultX;
  return Math.round((window.innerWidth - state.width) / 2);
}
function calcDefaultY(): number {
  if (props.defaultY !== undefined) return props.defaultY;
  return Math.round((window.innerHeight - state.height) / 2);
}

function clampSize(w: number, h: number) {
  return {
    width: Math.min(props.maxWidth, Math.max(props.minWidth, Math.round(w))),
    height: Math.min(props.maxHeight, Math.max(props.minHeight, Math.round(h))),
  };
}

function clampPosition(x: number, y: number) {
  // 确保标题栏至少部分可见（保留 60px 可拖拽区域）
  const minVisibleX = -(state.width - 60);
  const minVisibleY = 0;
  const maxX = window.innerWidth - 60;
  const maxY = window.innerHeight - 30;
  return {
    x: Math.min(maxX, Math.max(minVisibleX, Math.round(x))),
    y: Math.min(maxY, Math.max(minVisibleY, Math.round(y))),
  };
}

function resetToDefault() {
  state.isMaximized = false;
  const size = clampSize(props.defaultWidth, props.defaultHeight);
  state.width = size.width;
  state.height = size.height;
  state.x = calcDefaultX();
  state.y = calcDefaultY();
  syncStyle();
}

// ==================== 打开/关闭 ====================
function open() {
  if (visible.value) return;
  visible.value = true;
}

function close() {
  emit('close');
  visible.value = false;
}

watch(visible, async (val) => {
  if (val) {
    if (props.resetPositionOnReopen) {
      resetToDefault();
    } else {
      // 如果是首次打开，用默认值
      if (state.width === 0) {
        const size = clampSize(props.defaultWidth, props.defaultHeight);
        state.width = size.width;
        state.height = size.height;
        state.x = calcDefaultX();
        state.y = calcDefaultY();
      }
    }
    // 状态永远保证合法
    const size = clampSize(state.width, state.height);
    state.width = size.width;
    state.height = size.height;
    const pos = clampPosition(state.x, state.y);
    state.x = pos.x;
    state.y = pos.y;
    syncStyle();
  }
}, { immediate: true });

// ==================== 最大化/恢复 ====================
function toggleMaximize() {
  if (state.isMaximized) {
    // 恢复
    state.x = state.savedX;
    state.y = state.savedY;
    state.width = state.savedWidth;
    state.height = state.savedHeight;
    state.isMaximized = false;
  } else {
    // 保存当前
    state.savedX = state.x;
    state.savedY = state.y;
    state.savedWidth = state.width;
    state.savedHeight = state.height;
    // 全屏
    state.x = 0;
    state.y = 0;
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    state.isMaximized = true;
  }
  syncStyle();
  emit('maximize', state.isMaximized);
}

// ==================== 标题栏拖拽 ====================
let dragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragWinX = 0;
let dragWinY = 0;

function onTitlePointerDown(e: PointerEvent) {
  if (e.target instanceof HTMLElement && e.target.closest('[data-no-drag]')) return;
  if (state.isMaximized) return;
  dragging = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragWinX = state.x;
  dragWinY = state.y;
  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
}

function onPointerMove(e: PointerEvent) {
  if (!dragging) return;
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  const pos = clampPosition(dragWinX + dx, dragWinY + dy);
  state.x = pos.x;
  state.y = pos.y;
  syncStyle();
}

function onPointerUp(_e: PointerEvent) {
  if (!dragging) return;
  dragging = false;
  emitMove({ x: state.x, y: state.y });
}

// ==================== 缩放 ====================
type ResizeDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

let resizing: ResizeDir | null = null;
let resizeStartX = 0;
let resizeStartY = 0;
let resizeStartW = 0;
let resizeStartH = 0;
let resizeStartWinX = 0;
let resizeStartWinY = 0;

const RESIZE_HANDLE_SIZE = 8;

function onResizePointerDown(dir: ResizeDir, e: PointerEvent) {
  e.preventDefault();
  e.stopPropagation();
  resizing = dir;
  resizeStartX = e.clientX;
  resizeStartY = e.clientY;
  resizeStartW = state.width;
  resizeStartH = state.height;
  resizeStartWinX = state.x;
  resizeStartWinY = state.y;
  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
}

function applyResize(e: PointerEvent) {
  if (!resizing) return;
  const dx = e.clientX - resizeStartX;
  const dy = e.clientY - resizeStartY;
  const dir = resizing;

  let newW = resizeStartW;
  let newH = resizeStartH;
  let newX = resizeStartWinX;
  let newY = resizeStartWinY;

  if (dir.includes('e')) newW = resizeStartW + dx;
  if (dir.includes('w')) { newW = resizeStartW - dx; newX = resizeStartWinX + dx; }
  if (dir.includes('s')) newH = resizeStartH + dy;
  if (dir.includes('n')) { newH = resizeStartH - dy; newY = resizeStartWinY + dy; }

  const clamped = clampSize(newW, newH);

  // 左侧/上侧缩放时，如果尺寸被 min 截断，需要回退 position
  if (dir.includes('w') && clamped.width !== newW) {
    newX = resizeStartWinX + (resizeStartW - clamped.width);
  }
  if (dir.includes('n') && clamped.height !== newH) {
    newY = resizeStartWinY + (resizeStartH - clamped.height);
  }

  state.width = clamped.width;
  state.height = clamped.height;
  state.x = newX;
  state.y = newY;
  syncStyle();
}

function onResizePointerUp(_e: PointerEvent) {
  if (!resizing) return;
  resizing = null;
  emitResize({ width: state.width, height: state.height });
}

// 全局 pointer 事件
function globalPointerMove(e: PointerEvent) {
  if (dragging) onPointerMove(e);
  if (resizing) applyResize(e);
}

function globalPointerUp(e: PointerEvent) {
  if (dragging) onPointerUp(e);
  if (resizing) onResizePointerUp(e);
}

onMounted(() => {
  window.addEventListener('pointermove', globalPointerMove);
  window.addEventListener('pointerup', globalPointerUp);
});

onUnmounted(() => {
  window.removeEventListener('pointermove', globalPointerMove);
  window.removeEventListener('pointerup', globalPointerUp);
});

// ==================== defineExpose ====================
defineExpose({
  /** 获取当前尺寸 */
  getSize: () => ({ width: state.width, height: state.height }),
  /** 获取当前位置 */
  getPosition: () => ({ x: state.x, y: state.y }),
  /** 获取可见状态 */
  getVisible: () => visible.value,
  /** 设置尺寸（受 min/max 约束） */
  setSize(w: number, h: number) {
    const size = clampSize(w, h);
    state.width = size.width;
    state.height = size.height;
    syncStyle();
  },
  /** 设置位置 */
  setPosition(x: number, y: number) {
    const pos = clampPosition(x, y);
    state.x = pos.x;
    state.y = pos.y;
    syncStyle();
  },
  /** 设置尺寸（别名） */
  resize(w: number, h: number) {
    this.setSize(w, h);
  },
  /** 设置位置（别名） */
  moveTo(x: number, y: number) {
    this.setPosition(x, y);
  },
  open,
  close,
  toggleMaximize,
  resetToDefault,
});
</script>

<template>
  <div
    v-if="visible || !destroyOnClose"
    v-show="visible"
    ref="windowEl"
    class="window-frame"
    :style="windowStyle"
    role="dialog"
  >
    <!-- ======== 缩放 handle（8 个方向） ======== -->
    <div class="resize-handle nw" @pointerdown="onResizePointerDown('nw', $event)" />
    <div class="resize-handle n" @pointerdown="onResizePointerDown('n', $event)" />
    <div class="resize-handle ne" @pointerdown="onResizePointerDown('ne', $event)" />
    <div class="resize-handle e" @pointerdown="onResizePointerDown('e', $event)" />
    <div class="resize-handle se" @pointerdown="onResizePointerDown('se', $event)" />
    <div class="resize-handle s" @pointerdown="onResizePointerDown('s', $event)" />
    <div class="resize-handle sw" @pointerdown="onResizePointerDown('sw', $event)" />
    <div class="resize-handle w" @pointerdown="onResizePointerDown('w', $event)" />

    <!-- ======== 标题栏 ======== -->
    <div
      class="window-title-bar"
      @pointerdown="onTitlePointerDown"
    >
      <div class="window-title-content">
        <slot name="title">
          <span class="window-title-text">{{ title }}</span>
        </slot>
        <slot name="title-extra" />
      </div>
      <div class="window-title-actions" data-no-drag>
        <slot name="action-btn">
          <slot name="action-btn-extra" />
          <button
            class="title-btn"
            :title="state.isMaximized ? '恢复' : '最大化'"
            @click.stop="toggleMaximize"
          >
            <span v-if="state.isMaximized">⛶</span>
            <span v-else>⛶</span>
          </button>
          <button class="title-btn title-btn-close" title="关闭" @click.stop="close">
            ×
          </button>
        </slot>
      </div>
    </div>

    <!-- ======== body ======== -->
    <div class="window-body">
      <slot />
    </div>
  </div>
</template>

<style lang="scss">
.window-frame {
  position: fixed;
  z-index: 10001;
  border-radius: 10px;
  border: 1px solid rgba(212, 175, 55, 0.35);
  box-shadow: 2px 2px 20px 1px #000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: linear-gradient(
    135deg,
    rgba(10, 10, 20, 0.85),
    rgba(20, 15, 30, 0.85)
  );
  backdrop-filter: blur(8px);
  min-width: 0;
  min-height: 0;
}

// ======== 标题栏 ========
.window-title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  cursor: grab;
  user-select: none;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(212, 175, 55, 0.15);
  min-height: 36px;

  &:active {
    cursor: grabbing;
  }
}

.window-title-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.window-title-text {
  color: rgba(212, 175, 55, 0.9);
  font-size: 15px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.window-title-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  margin-left: 12px;
}

.title-btn {
  cursor: pointer;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  font-size: 18px;
  line-height: 1;
  border-radius: 4px;
  transition: color 0.15s, background 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
}

.title-btn-close {
  font-size: 22px;
  &:hover {
    color: red;
    background: rgba(255, 0, 0, 0.15);
  }
}

// ======== body ========
.window-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  min-height: 0;
}

// ======== 滚动条（与 Modal 一致） ========
.window-body {
  &::-webkit-scrollbar {
    width: 5px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgb(54, 54, 54);
    border-radius: 10px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: rgb(97, 97, 97);
  }
}

// ======== 缩放 handle ========
.resize-handle {
  position: absolute;
  z-index: 10;

  // 四角
  &.nw { top: 0; left: 0; width: 12px; height: 12px; cursor: nw-resize; }
  &.ne { top: 0; right: 0; width: 12px; height: 12px; cursor: ne-resize; }
  &.sw { bottom: 0; left: 0; width: 12px; height: 12px; cursor: sw-resize; }
  &.se { bottom: 0; right: 0; width: 12px; height: 12px; cursor: se-resize; }

  // 四边
  &.n  { top: 0; left: 12px; right: 12px; height: 8px; cursor: n-resize; }
  &.s  { bottom: 0; left: 12px; right: 12px; height: 8px; cursor: s-resize; }
  &.w  { left: 0; top: 12px; bottom: 12px; width: 8px; cursor: w-resize; }
  &.e  { right: 0; top: 12px; bottom: 12px; width: 8px; cursor: e-resize; }
}
</style>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoomNotificationsStore } from '@/stores/roomNotifications';

const notices = useRoomNotificationsStore();
const open = ref(false);
const root = ref<HTMLElement | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
function toggle() {
  open.value = !open.value;
  if (open.value) notices.markRead();
}
function outside(event: PointerEvent) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) open.value = false;
}
function time(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}
watch(() => notices.previewId, () => {
  clearTimeout(timer);
  if (open.value) notices.markRead();
  else if (notices.preview && !notices.preview.sticky) timer = setTimeout(() => notices.hidePreview(), 8000);
}, { immediate: true });
onMounted(() => document.addEventListener('pointerdown', outside, true));
onBeforeUnmount(() => {
  clearTimeout(timer);
  document.removeEventListener('pointerdown', outside, true);
});
</script>

<template>
  <div id="notifications" ref="root" class="room-notifications" @keydown.esc.stop="open = false">
    <button type="button" class="hud-icon notification-bell" :class="{ unread: notices.unreadCount > 0 }"
      title="房间通知" :aria-label="`房间通知${notices.unreadCount ? `，${notices.unreadCount} 条未读` : ''}`"
      :aria-expanded="open" aria-controls="room-notification-list" @click="toggle">
      <font-awesome-icon :icon="['fas', 'bell']" />
      <span v-if="notices.unreadCount" class="notification-dot" aria-hidden="true" />
    </button>
    <section v-if="open" id="room-notification-list" class="notification-panel" aria-label="房间通知记录">
      <header><strong>房间通知</strong><button v-if="notices.items.length" type="button" @click="notices.clear()">清空</button></header>
      <ul v-if="notices.items.length">
        <li v-for="notice in notices.items" :key="notice.id" class="notification" :class="notice.tone">
          <time>{{ time(notice.timestamp) }}</time><p>{{ notice.message }}</p>
          <button type="button" aria-label="删除这条通知" @click="notices.dismiss(notice.id)">×</button>
        </li>
      </ul>
      <p v-else class="notification-empty">暂无房间通知</p>
    </section>
    <div v-else-if="notices.preview" class="notification-preview" :class="notices.preview.tone" role="status" aria-live="polite">
      <p>{{ notices.preview.message }}</p>
      <button type="button" aria-label="收起通知提示" @click="notices.hidePreview()">×</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.room-notifications { position: relative; }
.notification-bell.unread { color: #ffd557; }
.notification-dot { position: absolute; top: 5px; right: 5px; width: 6px; height: 6px; border-radius: 50%; background: #ffd557; }
.notification-panel, .notification-preview {
  position: absolute; top: calc(100% + 10px); right: 0; z-index: 5;
  width: min(320px, calc(100vw - 32px)); border-radius: 7px;
  color: #151515; background: #fff; box-shadow: 0 4px 16px #0006;
  font: 14px/1.45 Arial, sans-serif; text-align: left; text-shadow: none; overflow-wrap: anywhere;
  &::before { content: ''; position: absolute; right: 14px; bottom: 100%; border: 7px solid transparent; border-bottom-color: white; }
  button { appearance: none; border: 0; color: #555; background: transparent; font: inherit; cursor: pointer; }
  button:focus-visible { outline: 2px solid #74429e; }
  p { margin: 0; white-space: pre-wrap; }
}
.notification-preview { display: flex; gap: 8px; padding: 10px 12px; }
.notification-preview p { flex: 1; }
.notification-preview > button { align-self: start; padding: 0 2px; font-size: 18px; }
.notification-panel header { display: flex; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #ddd; }
.notification-panel ul { max-height: min(420px, 65vh); overflow-y: auto; list-style: none; margin: 0; padding: 0; }
.notification { position: relative; padding: 9px 30px 10px 12px; border-bottom: 1px solid #eee; }
.notification time { display: block; color: #777; font-size: 11px; margin-bottom: 3px; }
.notification > button { position: absolute; top: 6px; right: 7px; font-size: 18px; }
.notification-empty { padding: 16px 12px; color: #777; }
.notification.warning, .notification-preview.warning { border-left: 3px solid #d6a02b; }
.notification.error, .notification-preview.error { border-left: 3px solid #b63d48; }
@media (prefers-reduced-motion: no-preference) {
  .notification-preview { animation: notification-in .18s ease-out; }
  @keyframes notification-in { from { opacity: 0; transform: translateY(-4px); } }
}
</style>

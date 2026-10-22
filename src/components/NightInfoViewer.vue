<template>
  <section v-if="visible" class="night-info-viewer" aria-label="夜间信息">
    <button type="button" class="night-info-viewer__trigger" :aria-expanded="open" aria-haspopup="dialog" title="查看夜间信息" @click="showHistory">
      <font-awesome-icon icon="eye" aria-hidden="true" /><span>夜间信息</span>
    </button>
    <Modal v-if="open" name="night-received" :title="message ? '说书人唤醒了你：' : '夜间信息'" :style="pickerOpen ? { display: 'none' } : undefined"
      :close-on-backdrop="!sending" :show-close="!sending" return-focus=".night-info-viewer__trigger" @close="close"
      @keydown.esc.capture="sending && $event.stopPropagation()">
      <p v-if="loading && !message" role="status" class="night-received-status">正在读取夜间信息…</p>
      <p v-else-if="!message" class="night-received-status">{{ historyError || '当前还没有夜间信息。' }}</p>
      <template v-if="message">
        <div ref="exchange" class="night-exchange" aria-label="夜间信息记录" aria-live="polite">
          <div v-for="entry in timeline" :key="entry.messageId" class="night-exchange-row" :class="entry.isDM ? 'is-received' : 'is-sent'">
            <strong><font-awesome-icon :icon="entry.isDM ? 'circle-arrow-left' : 'circle-arrow-right'" /> {{ entry.isDM ? '已接收：' : '已发送：' }}</strong><NightMessageContent :content="entry.content" />
          </div>
        </div>
        <NightMessageComposer ref="replyComposer" :key="`${scope}:${message.messageId}:${draftVersion}`" mode="reply" player-name="说书人" :roles="roles" :initial-draft="drafts[message.messageId] || []"
          :disabled="sending" :send-disabled="Boolean(unavailableReason)" :status-text="sendError || unavailableReason" @send="sendReply" @picker-open="pickerOpen = $event"
          @draft-update="saveDraft(message.messageId, $event)" />
      </template>
    </Modal>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import Modal from './modals/Modal.vue';
import NightMessageComposer from './NightMessageComposer.vue';
import NightMessageContent from './NightMessageContent.vue';
import { useGameController } from '@/controllers/GameController';
import { SocketClientEvent } from '@/types/socket';
import type { MessageContent } from '@/types/message';
import { nightReplyActionId, type NightMessageDraft } from '@/utils/nightMessages';
import { useGameStore } from '@/stores/game';
import { useRoomChatStore, type NightInfoMessage } from '@/stores/roomChat';
import { useUserStore } from '@/stores/user';
import { useSessionStore } from '@/stores/session';
import { useGameScriptStore } from '@/stores/gameScript';

const controller = useGameController();
const game = useGameStore();
const chat = useRoomChatStore();
const users = useUserStore();
const session = useSessionStore();
const script = useGameScriptStore();
const open = ref(false);
const pickerOpen = ref(false);
const loading = ref(false);
const sending = ref(false);
const historyError = ref('');
const sendError = ref('');
const activeId = ref('');
const drafts = ref<Record<string, NightMessageDraft[]>>({});
const draftVersion = ref(0);
const replyComposer = ref<InstanceType<typeof NightMessageComposer> | null>(null);
const exchange = ref<HTMLElement | null>(null);
const currentUserId = computed(() => users.userId || '');
const scope = computed(() => `${session.sessionId}:${currentUserId.value}`);
const visible = computed(() => Boolean(session.sessionId && game.currentIsPlayer && currentUserId.value && !game.currentIsDm && game.currentPlayer?.seat));
const messages = computed(() => chat.getMessages('dm_skill', currentUserId.value)
  .filter((item): item is NightInfoMessage => item.context?.kind === 'night-info')
  .sort((left, right) => left.timestamp - right.timestamp || left.messageId.localeCompare(right.messageId, undefined, { numeric: true })));
const received = computed(() => messages.value.filter(item => item.isDM === true && item.senderUserId !== currentUserId.value));
const message = computed(() => received.value.find(item => item.messageId === activeId.value));
const timeline = computed(() => messages.value.filter(item => item.isDM || item.senderUserId === currentUserId.value));
const roles = computed(() => script.characters.filter(role => role.id && role.name).map(role => ({ ...role, name: role.name! })));
const unavailableReason = computed(() => {
  if (!visible.value || !message.value) return '当前身份无法回复夜间信息。';
  if (!controller.isConnected) return '房间正在重连，连接恢复后可发送。';
  if (game.level !== 'night' || game.levelDays !== message.value.context.levelDays) return '这条夜间信息已结束，可以查看记录。';
  return '';
});
let historyRequest = 0;
let replyRequest = 0;
const seenLiveIds = new Set<string>();

function saveDraft(id: string, draft: NightMessageDraft[]): void { drafts.value[id] = draft; }
function selectMessage(index: number): void {
  if (sending.value || !received.value[index]) return;
  activeId.value = received.value[index].messageId;
  sendError.value = '';
}
function close(): void { if (!sending.value) open.value = false; }
async function showHistory(): Promise<void> {
  if (!visible.value) return;
  if (open.value) { close(); return; }
  if (!message.value) selectMessage(received.value.length - 1);
  open.value = true;
  await loadHistory();
}
async function loadHistory(): Promise<void> {
  if (!visible.value || !controller.isConnected) return;
  const request = ++historyRequest;
  const requestScope = scope.value;
  const userId = currentUserId.value;
  loading.value = true;
  historyError.value = '';
  try {
    const response = await controller.request(SocketClientEvent.GetMessageHistory, { channel: 'dm_skill', toUserId: userId });
    if (requestScope !== scope.value || request !== historyRequest || !visible.value) return;
    if (response.status !== 200) throw new Error(response.message || '读取夜间信息失败，请重新打开重试。');
    chat.mergeConversation('dm_skill', userId, response.data?.messages || []);
    if (!message.value) selectMessage(received.value.length - 1);
  } catch (cause) {
    if (requestScope === scope.value && request === historyRequest) historyError.value = cause instanceof Error ? cause.message : '读取夜间信息失败，请重新打开重试。';
  } finally {
    if (request === historyRequest) loading.value = false;
  }
}
async function sendReply(content: MessageContent[]): Promise<void> {
  const source = message.value;
  if (sending.value || unavailableReason.value || !source || !content.length) return;
  const requestScope = scope.value;
  const userId = currentUserId.value;
  const request = ++replyRequest;
  const context = { ...source.context, actionId: nightReplyActionId(source.messageId) };
  sending.value = true;
  sendError.value = '';
  try {
    const response = await controller.request(SocketClientEvent.SendDMMessage, { playerUserId: userId, channel: 'skill', content, context });
    if (requestScope !== scope.value || request !== replyRequest || !visible.value) return;
    if (response.status !== 200 || !response.data?.messageId) throw new Error(response.message || '回复发送失败，请重试。');
    // Socket echo may arrive before or after the acknowledgement. Merge by id so
    // either order shows the confirmed reply once and never clears a failed draft.
    const existing = chat.getMessages('dm_skill', userId).find(item => item.messageId === response.data!.messageId);
    chat.mergeConversation('dm_skill', userId, [existing || {
      messageId: response.data.messageId, senderUserId: userId, isDM: false, content, context, timestamp: Date.now(),
    }]);
    drafts.value[source.messageId] = [];
    activeId.value = received.value.at(-1)?.messageId || source.messageId;
    draftVersion.value++;
    // Keep a newer wake visible if it arrived while replying to an earlier one.
    open.value = activeId.value !== source.messageId;
  } catch (cause) {
    if (requestScope === scope.value && request === replyRequest) sendError.value = cause instanceof Error ? cause.message : '回复发送失败，请重试。';
  } finally {
    if (request === replyRequest) {
      sending.value = false;
      void nextTick(() => { if (open.value && requestScope === scope.value) replyComposer.value?.focusQuickItems(); });
    }
  }
}
watch(() => chat.lastDelivery, delivery => {
  if (!visible.value || !delivery || delivery.channel !== 'dm_skill' || delivery.targetUserId !== currentUserId.value || seenLiveIds.has(delivery.messageId)) return;
  const incoming = received.value.find(item => item.messageId === delivery.messageId);
  if (!incoming) return;
  seenLiveIds.add(incoming.messageId);
  if (!message.value || (!drafts.value[activeId.value]?.length && !pickerOpen.value && !sending.value)) selectMessage(received.value.findIndex(item => item.messageId === incoming.messageId));
  open.value = true;
});
watch([open, () => timeline.value.length], () => {
  if (open.value) void nextTick(() => { if (exchange.value) exchange.value.scrollTop = exchange.value.scrollHeight; });
});
watch(() => controller.isConnected, connected => { if (connected) void loadHistory(); });
watch([scope, visible], () => {
  ++historyRequest; ++replyRequest;
  open.value = false; pickerOpen.value = false; loading.value = false; sending.value = false;
  activeId.value = ''; drafts.value = {}; sendError.value = ''; historyError.value = ''; seenLiveIds.clear();
  if (visible.value) void loadHistory();
}, { immediate: true });
</script>

<style scoped lang="scss">
.night-info-viewer__trigger { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 4px 9px; color: #eee8dc; background: #0c0b11b8; border: 1px solid #75604470; border-radius: 5px; font: inherit; font-size: 13px; cursor: pointer; }
.night-info-viewer__trigger:focus-visible { outline: 2px solid #e5c469; outline-offset: 3px; }
.night-exchange { display: grid; gap: 7px; max-height: 40dvh; overflow: auto; padding: 4px 0 14px; }
.night-exchange-row { display: grid; grid-template-columns: 105px minmax(0, 1fr); align-items: start; gap: 8px; font-size: 14px; }
.night-exchange-row > strong { padding-top: 3px; color: #a766f3; white-space: nowrap; }
.night-exchange-row.is-sent > strong { color: #efb92a; }
.night-received-status { color: #ddd2c2; text-align: center; }
@media (max-width: 480px) {
  .night-exchange-row { grid-template-columns: 82px minmax(0, 1fr); gap: 4px; font-size: 13px; }
}
</style>

<style lang="scss">
.modal-backdrop.modal-backdrop--night-received { background: #0003; backdrop-filter: none; z-index: 10010; }
.modal-backdrop--night-received .modal { --ts-modal-spine: none; width: min(600px, 100%); color: #f4f0e8; background: #08090ce8; border: 1px solid #ffffff30; border-radius: 6px; box-shadow: 0 10px 35px #0008; }
.modal-backdrop--night-received .modal::after, .modal-backdrop--night-received .modal-ornament { display: none; }
.modal-backdrop--night-received .modal-heading { padding: 12px 44px; text-align: center; background: transparent; border-bottom: 1px solid #ffffff18; }
.modal-backdrop--night-received .modal-title { color: #f4f0e8; font-family: inherit; font-size: 16px; line-height: 1.4; letter-spacing: 0; }
.modal-backdrop--night-received .modal > .slot { padding: 12px 18px 18px; }
.modal-backdrop--night-received .modal > .top-right-buttons { top: 5px; right: 5px; }
.modal-backdrop--night-received .modal > .top-right-buttons > .top-right-button { width: 30px; height: 30px; border: 0; box-shadow: none; background: transparent; color: #a69e95; font-size: 16px; }
@media (max-width: 480px) {
  .modal-backdrop.modal-backdrop--night-received { padding: 10px; }
  .modal-backdrop--night-received .modal > .slot { padding: 10px; }
}
</style>

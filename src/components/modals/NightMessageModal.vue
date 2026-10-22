<template>
  <Modal name="night-message" :style="pickerOpen ? { display: 'none' } : undefined" :title="`唤醒 ${seatIndex + 1} 号座位`" :show-close="false" :close-on-backdrop="!sending"
    :return-focus="`.reference-seat-group[data-seat-index='${seatIndex}'] .reference-token`" @keydown.esc.capture="sending && $event.stopPropagation()" @close="close">
    <p v-if="loading" class="night-conversation-status" role="status">正在读取夜间信息…</p>
    <p v-else-if="historyError" class="night-conversation-status" role="status">{{ historyError }}</p>
    <div v-if="messages.length" ref="exchange" class="night-conversation" aria-label="夜间信息记录" aria-live="polite">
      <div v-for="entry in messages" :key="entry.messageId" class="night-conversation-row" :class="entry.isDM ? 'is-sent' : 'is-received'">
        <strong><font-awesome-icon :icon="entry.isDM ? 'circle-arrow-right' : 'circle-arrow-left'" /> {{ entry.isDM ? '已发送：' : '已接收：' }}</strong>
        <NightMessageContent :content="entry.content" />
      </div>
    </div>
    <NightMessageComposer :player-name="targetName" :candidates="candidates" :roles="roles" :disabled="sending"
      :send-disabled="Boolean(unavailableReason)" :status-text="error || unavailableReason" @picker-open="pickerOpen = $event" @cancel="close" @send="send">
      <template #guidance><p v-if="roleGuidance" class="night-wake-guidance" :aria-label="`${target?.role?.name || '角色'}夜间提示`">{{ roleGuidance }}</p></template>
    </NightMessageComposer>
  </Modal>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import Modal from './Modal.vue';
import NightMessageComposer from '@/components/NightMessageComposer.vue';
import NightMessageContent from '@/components/NightMessageContent.vue';
import { nightConversation } from '@/utils/nightMessages';
import { useGameController } from '@/controllers/GameController';
import { useGameStore } from '@/stores/game';
import { useGameScriptStore } from '@/stores/gameScript';
import { usePlayersStore } from '@/stores/players';
import { useSessionStore } from '@/stores/session';
import { useRoomChatStore } from '@/stores/roomChat';
import { useUserStore } from '@/stores/user';
import { SocketClientEvent } from '@/types/socket';
import type { MessageContent } from '@/types/message';
const props = defineProps<{ seatIndex: number; playerUserId: string; levelDays: number }>();
const emit = defineEmits<{ close: [] }>();
const game = useGameStore();
const players = usePlayersStore();
const script = useGameScriptStore();
const session = useSessionStore();
const controller = useGameController();
const chat = useRoomChatStore();
const users = useUserStore();
const sending = ref(false);
const pickerOpen = ref(false);
const error = ref('');
const historyError = ref('');
const loading = ref(false);
const exchange = ref<HTMLElement | null>(null);
const readerUserId = computed(() => users.userId || game.currentPlayer?.userId || '');
const scope = computed(() => `${session.sessionId}:${session.gameServerId}:${readerUserId.value}:${props.playerUserId}:${props.levelDays}`);
const canView = computed(() => Boolean(session.sessionId && game.currentIsDm && target.value?.id === props.playerUserId));
const messages = computed(() => nightConversation(chat.getMessages('dm_skill', props.playerUserId))
  .filter(item => item.isDM || item.senderUserId === props.playerUserId));
const target = computed(() => players.players[props.seatIndex]);
const roleGuidance = computed(() => {
  const role = target.value?.id === props.playerUserId ? target.value.role : null;
  return props.levelDays <= 1 ? role?.firstNightReminder || role?.otherNightReminder : role?.otherNightReminder || role?.firstNightReminder;
});
const targetName = computed(() => `${props.seatIndex + 1} 号座位${target.value?.id === props.playerUserId && target.value?.name ? ` · ${target.value.name}` : ''}`);
const candidates = computed(() => players.players.flatMap((player, index) => player.id && !game.players[player.id]?.isDM
  ? [{ id: player.id, name: player.name, seat: index + 1 }] : []));
const roles = computed(() => script.characters.filter(role => role.id && role.name).map(role => ({ ...role, name: role.name! })));
const unavailableReason = computed(() => {
  if (!session.sessionId || !session.gameServerId) return '联机房间中入座后可发送夜间信息。';
  if (!game.currentIsDm || game.level !== 'night' || game.levelDays !== props.levelDays) return '阶段或主持权限已变更，请关闭后重新唤醒。';
  if (!props.playerUserId) return '该座位暂无玩家，入座后请重新唤醒。';
  if (target.value?.id !== props.playerUserId || game.players[props.playerUserId]?.isDM || !game.players[props.playerUserId]?.seat) return '座位上的玩家已变更，请关闭后重新唤醒。';
  if (!controller.isConnected) return '房间正在重连，连接恢复后可发送。';
  return '';
});
function close(): void { if (!sending.value) emit('close'); }
let historyRequest = 0;
let disposed = false;
async function loadHistory(): Promise<void> {
  if (!canView.value || !controller.isConnected) return;
  const request = ++historyRequest;
  const requestScope = scope.value;
  const userId = props.playerUserId;
  loading.value = true;
  historyError.value = '';
  try {
    const response = await controller.request(SocketClientEvent.GetMessageHistory, { channel: 'dm_skill', toUserId: userId });
    if (disposed || request !== historyRequest || requestScope !== scope.value || !canView.value) return;
    if (response.status !== 200) throw new Error(response.message || '读取夜间信息失败，重新打开可重试。');
    chat.mergeConversation('dm_skill', userId, response.data?.messages || []);
  } catch (cause) {
    if (!disposed && request === historyRequest && requestScope === scope.value && canView.value) historyError.value = cause instanceof Error ? cause.message : '读取夜间信息失败。';
  } finally {
    if (request === historyRequest) loading.value = false;
  }
}
watch([scope, () => controller.isConnected], () => { void loadHistory(); }, { immediate: true });
watch([canView, scope, () => messages.value.map(item => item.messageId).join(','), pickerOpen], () => {
  if (!canView.value || pickerOpen.value) return;
  chat.markNightConversationRead(readerUserId.value, props.playerUserId);
  void nextTick(() => { if (exchange.value) exchange.value.scrollTop = exchange.value.scrollHeight; });
}, { immediate: true });
onBeforeUnmount(() => { disposed = true; ++historyRequest; });
async function send(content: MessageContent[]): Promise<void> {
  if (sending.value || unavailableReason.value || !content.length) return;
  sending.value = true;
  error.value = '';
  const requestScope = scope.value;
  const senderUserId = readerUserId.value;
  const playerUserId = props.playerUserId;
  const context = { kind: 'night-info' as const, levelDays: props.levelDays,
    actionId: `seat:${props.seatIndex + 1}`, section: props.levelDays <= 1 ? 'first' as const : 'other' as const };
  try {
    const response = await controller.request(SocketClientEvent.SendDMMessage, {
      playerUserId, channel: 'skill', content,
      context,
    });
    if (disposed || scope.value !== requestScope || !canView.value) return;
    if (response.status !== 200) throw new Error(response.message || '夜间信息发送失败，请重试。');
    if (response.data?.messageId) {
      const existing = chat.getMessages('dm_skill', playerUserId).find(item => item.messageId === response.data!.messageId);
      chat.mergeConversation('dm_skill', playerUserId, [existing || {
        messageId: response.data.messageId, senderUserId, isDM: true, content, context, timestamp: Date.now(),
      }]);
    }
    window.$toast.success(`已向${targetName.value}发送夜间信息。`);
    emit('close');
  } catch (cause) {
    if (!disposed && scope.value === requestScope && canView.value) error.value = cause instanceof Error ? cause.message : '夜间信息发送失败，请重试。';
  } finally { sending.value = false; }
}
</script>

<style scoped lang="scss">
.night-conversation { display: grid; gap: 8px; max-height: 28dvh; overflow: auto; padding-bottom: 14px; }
.night-conversation-row { display: grid; grid-template-columns: 100px minmax(0, 1fr); align-items: start; gap: 8px; font-size: 14px; }
.night-conversation-row strong { padding-top: 3px; color: #a766f3; white-space: nowrap; }
.night-conversation-row.is-sent strong { color: #efb92a; }
.night-wake-guidance { margin: 8px 0 12px; max-height: 16dvh; overflow: auto; color: #e9bb3d; font-size: 14px; line-height: 1.5; text-align: center; }
.night-conversation-status { font-size: 13px; color: #e2cda4; text-align: center; }
@media (max-width: 480px) { .night-conversation-row { grid-template-columns: 82px minmax(0, 1fr); gap: 4px; font-size: 13px; } }
</style>

<style lang="scss">
.modal-backdrop.modal-backdrop--night-message { background: rgb(0 0 0 / 30%); backdrop-filter: none; }
.modal-backdrop.modal-backdrop--night-message .modal {
  width: min(940px, calc(100vw - 24px)); max-width: calc(100vw - 24px);
  --ts-modal-spine: none;
  color: #f4f0e8; background: rgb(10 10 13 / 93%); border: 2px solid #888;
  border-radius: 8px; box-shadow: 0 16px 60px #0009; padding: 0;
}
.modal-backdrop.modal-backdrop--night-message .modal::before,
.modal-backdrop.modal-backdrop--night-message .modal::after { display: none; }
.modal-backdrop.modal-backdrop--night-message .modal-ornament { display: none; }
.modal-backdrop.modal-backdrop--night-message .modal-heading { padding: 14px 22px; text-align: center; }
.modal-backdrop.modal-backdrop--night-message .modal-title { color: #f4f0e8; font-size: 18px; }
.modal-backdrop.modal-backdrop--night-message .modal > .slot { padding: 14px 22px 22px; }
@media (max-width: 640px) {
  .modal-backdrop.modal-backdrop--night-message .modal > .slot { padding: 12px; }
}
</style>

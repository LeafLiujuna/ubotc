<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Modal from './Modal.vue';
import RoomMemberProfile from './RoomMemberProfile.vue';
import { GameApi } from '@/api/http/game';
import { useGameController } from '@/controllers/GameController';
import { useAppStore } from '@/stores/app';
import { useGameStore } from '@/stores/game';
import { useSessionStore } from '@/stores/session';
import { useUserStore } from '@/stores/user';
import { SocketClientEvent } from '@/types/socket';
import type { RoomDetails } from '@/types/game';

defineOptions({ name: 'RoomInfoModal' });
const app = useAppStore(), game = useGameStore(), session = useSessionStore(), users = useUserStore();
const controller = useGameController();
const visible = computed({ get: () => Boolean(app.modals.roomInfo), set: (value) => {
  if (value !== Boolean(app.modals.roomInfo)) app.toggleModal('roomInfo');
} });
const details = ref<RoomDetails | null>(null);
const selectedUserId = ref(''), roomName = ref(''), saving = ref(false), message = ref('');
let loadId = 0;
const canEdit = computed(() => Boolean(game.roomUsers[users.userId || '']?.isRoomOwner || users.current?.isAdmin));
const currentTitle = computed(() => game.roomMeta?.roomTitle || session.roomTitle || details.value?.name || '未命名房间');
watch(currentTitle, value => { roomName.value = value; }, { immediate: true });
const members = computed(() => {
  const ids = new Set([...Object.keys(game.roomUsers), ...Object.keys(game.players), ...Object.keys(game.dms)]);
  return [...ids].map(userId => {
    const user = game.roomUsers[userId], player = game.players[userId] || game.dms[userId];
    return {
      userId, name: user?.displayName || users.getUserById(userId)?.displayName || userId,
      isDM: Boolean(player?.isDM || user?.isDM || game.roomMeta?.dmUserIds.includes(userId)),
      isOwner: Boolean(user?.isRoomOwner), seat: player?.seat || 0,
      connected: user ? !user.disconnectedAt : Boolean(player?.connected),
    };
  });
});
const groups = computed(() => [
  { title: '说书人', members: members.value.filter(member => member.isDM) },
  { title: '玩家', members: members.value.filter(member => !member.isDM && member.seat > 0).sort((a, b) => a.seat - b.seat) },
  { title: '旁观者', members: members.value.filter(member => !member.isDM && member.seat === 0) },
]);
const selectedMember = computed(() => members.value.find(member => member.userId === selectedUserId.value));
watch(() => [visible.value, session.sessionId] as const, async ([open, roomId]) => {
  const id = ++loadId;
  selectedUserId.value = ''; message.value = ''; roomName.value = currentTitle.value;
  details.value = null;
  if (!open || !roomId || !session.gameServerId) return;
  const result = await GameApi.getRoom(roomId).catch(() => null);
  if (id !== loadId) return;
  if (result?.data) details.value = result.data;
}, { immediate: true });
async function saveName() {
  const name = roomName.value.trim();
  if (!canEdit.value || saving.value || name === currentTitle.value) return;
  if (!name || name.length > 80) { message.value = '房间名称需要 1 至 80 个字'; return; }
  saving.value = true; message.value = '';
  try {
    await controller.request(SocketClientEvent.AdminUpdateRoomMeta, { roomTitle: name });
    if (game.roomMeta) game.applyRoomMeta({ ...game.roomMeta, roomTitle: name });
  } catch (error) { message.value = error instanceof Error ? error.message : '房间名称保存失败'; }
  finally { saving.value = false; }
}
async function copyRoom() {
  try {
    await navigator.clipboard.writeText(new URL(`/game/${encodeURIComponent(session.sessionId)}`, window.location.origin).href);
    message.value = '房间链接已复制';
  } catch { message.value = '复制失败，请从地址栏复制房间链接'; }
}
function close() { visible.value = false; }
</script>

<template>
  <Modal v-model:visible="visible" id="room-info-modal" name="room-info" :class="{ 'room-member-view': selectedMember }"
    :aria-label="selectedMember ? '用户资料' : '当前游戏房间'" :show-close="false" return-focus=".hud-icon.connection" @close="close">
    <RoomMemberProfile v-if="selectedMember" :key="selectedMember.userId" :member="selectedMember"
      @back="selectedUserId = ''" @close="close" />
    <div v-else class="room-info-modal">
      <h2 class="room-info-title">当前游戏房间：</h2>
      <dl class="room-info-settings">
        <div><dt><label for="room-info-name">房间名称：</label></dt><dd class="room-name-control">
          <input id="room-info-name" v-model="roomName" maxlength="80" :readonly="!canEdit" :disabled="saving"
            @change="saveName" @keydown.enter.prevent="saveName" />
          <button type="button" class="icon-button" aria-label="复制房间链接" title="复制房间链接" @click="copyRoom"><font-awesome-icon icon="copy" /></button>
        </dd></div>
        <div><dt>房间可见性：</dt><dd>{{ details ? details.isPrivate ? '私密房间' : '公开房间' : '读取中…' }}
          <font-awesome-icon :icon="details?.isPrivate ? 'lock' : 'unlock'" aria-hidden="true" /></dd></div>
        <div><dt>访问：</dt><dd>{{ details ? details.isPrivate ? '需要房间密码' : '所有人都可以访问' : '读取中…' }}
          <font-awesome-icon :icon="details?.isPrivate ? 'lock' : 'unlock'" aria-hidden="true" /></dd></div>
      </dl>
      <p v-if="message" class="room-info-message" role="status">{{ message }}</p>
      <div class="room-info-members">
        <section v-for="group in groups" v-show="group.title !== '玩家' || group.members.length" :key="group.title" :aria-label="group.title">
          <h3>{{ group.title }}</h3>
          <div class="member-names">
            <button v-for="member in group.members" :key="member.userId" type="button" class="member-name"
              :class="{ 'is-owner': member.isOwner, 'is-offline': !member.connected }"
              :aria-label="`查看${member.name}的资料`" @click="selectedUserId = member.userId">
              <small v-if="member.seat">{{ member.seat }}.</small>{{ member.name }}
              <font-awesome-icon v-if="member.isDM" icon="hat-wizard" aria-hidden="true" />
              <small v-if="!member.connected">离线</small>
            </button>
            <span v-if="!group.members.length" class="room-info-empty">暂无{{ group.title }}</span>
          </div>
        </section>
      </div>
      <footer class="room-info-footer"><span class="room-code">{{ session.sessionId }}</span><button type="button" class="reference-close" @click="close">✖ 关闭</button></footer>
    </div>
  </Modal>
</template>

<style scoped lang="scss">
:global(.modal-backdrop.modal-backdrop--room-info) { background: #0004; backdrop-filter: none; }
:global(.modal-backdrop.modal-backdrop--room-info .modal) {
  --ts-modal-spine: none;
  width: min(960px, 94vw); max-height: 86dvh; padding: 0; border: 1px solid #050405;
  border-radius: 6px; background: rgba(3, 3, 6, .86); box-shadow: 0 2px 12px #000b;
  font-family: Georgia, 'Noto Serif SC', 'SimSun', serif;
}
:global(.modal-backdrop.modal-backdrop--room-info .modal::after),
:global(.modal-backdrop.modal-backdrop--room-info .modal-ornament) { display: none; }
:global(.modal-backdrop.modal-backdrop--room-info .slot) { padding: 0; }
:global(.modal-backdrop.modal-backdrop--room-info.room-member-view .modal) { width: min(660px, 94vw); }
.room-info-modal { color: #fff; text-align: center; padding: 8px 14px 10px; font-size: 17px; text-shadow: 0 1px 2px #000; }
.room-info-title { margin: 0 0 4px; font-size: 17px; font-weight: 400; }
.room-info-settings { width: min(380px, 100%); margin: 0 auto 10px; > div { display: grid; grid-template-columns: 125px minmax(0, 1fr); align-items: center; min-height: 28px; gap: 12px; } dt { text-align: left; font-weight: 700; } dd { display: flex; align-items: center; justify-content: flex-end; gap: 7px; min-width: 0; margin: 0; color: #d7ba44; } dd > svg { flex-shrink: 0; color: #bd8fe3; width: 18px; } small { font-size: 13px; } }
.room-name-control { input { min-width: 0; width: 100%; height: 24px; padding: 1px 5px; color: #111; background: white; border: 1px solid #bbb; border-radius: 2px; font: 15px Georgia, 'SimSun', serif; text-shadow: none; } }
.icon-button { padding: 2px; border: 0; color: #fff; background: transparent; cursor: pointer; font-size: 18px; }
.room-info-members { border-top: 1px solid #000b; padding-top: 3px; section { margin: 3px 0 0; } h3 { margin: 0; color: white; font-size: 18px; line-height: 1.5; } }
.member-names { display: flex; flex-wrap: wrap; justify-content: center; gap: 2px 12px; }
.member-name { display: inline-flex; gap: 5px; align-items: center; max-width: 100%; padding: 2px 4px; color: #eee; border: 0; border-bottom: 1px solid transparent; background: transparent; font: inherit; cursor: pointer; overflow-wrap: anywhere; &.is-owner { border-bottom-color: #c28539; } &.is-offline { color: #8f8c92; } &:hover { color: #ecd45d; border-bottom-color: currentColor; } svg { color: #b392d6; font-size: 14px; } }
.room-info-empty { color: #999; font-size: 15px; padding: 3px; }
.room-info-footer { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 9px; }
.room-code { color: #918993; font-size: 12px; letter-spacing: .1em; }
.reference-close { padding: 3px 10px; border: 1px solid #24202a; border-radius: 4px; background: linear-gradient(#38353e, #0b090e); color: #e9cc56; font: inherit; cursor: pointer; }
.room-info-message { margin: 4px 0; color: #eed28b; font-size: 14px; }
button:focus-visible, input:focus-visible { outline: 2px solid #e7c765; outline-offset: 2px; }
@media (max-width: 520px) { .room-info-modal { font-size: 15px; padding: 10px; } .room-info-settings > div { grid-template-columns: 105px minmax(0, 1fr); gap: 5px; min-height: 32px; } .member-name { min-height: 36px; } }
</style>

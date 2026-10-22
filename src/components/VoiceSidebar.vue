<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useVoiceController } from '@/controllers/VoiceController'
import { useGameStore } from '@/stores/game'
import { useUserStore } from '@/stores/user'
const props = withDefaults(defineProps<{ listenRequests?: boolean }>(), {
  listenRequests: true,
})
const voice = useVoiceController()
const game = useGameStore()
const user = useUserStore()
const places = [
  { id: 'potion-shop', name: '药水商店' },
  { id: 'tower', name: '塔楼' },
  { id: 'church', name: '大教堂' },
  { id: 'campfire', name: '营火' },
  { id: 'brook', name: '溪边' },
]
const pending = ref(false)
const error = ref('')
const canJoin = computed(
  () => Boolean(game.currentPlayer || game.currentIsDm) && game.level !== 'night'
)
const currentRoom = computed(() => voice.roomDirectory[voice.currentActiveRoomId])
const pendingInvites = computed(() => voice.outgoingInvites.filter(invite => invite.status === 'pending'))
const hasRequests = computed(() => pendingInvites.value.length || voice.incomingInvites.length)
const inviteRooms = computed(() =>
  Object.entries(voice.roomDirectory).filter(
    ([id, room]) =>
      id !== voice.currentActiveRoomId &&
      room.access === 'invite' &&
      room.allowedUserIds?.includes(user.userId || '')
  )
)
const inPrivate = computed(
  () =>
    voice.currentActiveRoomId &&
    voice.currentActiveRoomId !== voice.publicRoomId
)
function display(id: string) {
  return (
    game.roomUsers[id]?.displayName || user.getUserById(id)?.displayName || id
  )
}
function placeEntry(name: string) {
  return Object.entries(voice.roomDirectory).find(
    ([, room]) => room.access === 'open' && room.scene === name
  )
}
function isCurrentPlace(name: string) {
  return placeEntry(name)?.[0] === voice.currentActiveRoomId
}
function members(name: string) {
  return placeEntry(name)?.[1].users || []
}
async function run(action: () => Promise<unknown>) {
  if (pending.value) return
  pending.value = true
  error.value = ''
  try {
    await action()
  } catch (reason) {
    error.value =
      reason instanceof Error ? reason.message : '语音操作失败，请重试'
  } finally {
    pending.value = false
  }
}
function requestChat() {
  if (!canJoin.value || voice.waitingForInvite) return
  error.value = ''
  voice.startInviteSelection()
}
watch(() => voice.selectingInvitee, (selecting) => { if (!selecting) error.value = '' })
onMounted(() => {
  if (props.listenRequests)
    window.addEventListener('ts-request-voice-chat', requestChat)
})
onBeforeUnmount(() =>
  window.removeEventListener('ts-request-voice-chat', requestChat)
)
</script>
<template>
  <div class="player-voice-sidebar" aria-label="语音地点" :aria-busy="pending">
    <header>
      <strong>{{
        hasRequests ? '聊天请求' : inPrivate
          ? currentRoom?.access === 'invite' ? '聊天' : currentRoom?.scene || '聊天'
          : '城镇广场'
      }}</strong
      ><button
        v-if="inPrivate"
        type="button"
        aria-label="返回广场"
        :disabled="pending"
        @click="run(() => voice.backToPublicRoom())"
      >
        ↪
      </button>
    </header>
    <ul v-if="hasRequests" class="voice-requests" aria-label="聊天请求" aria-live="polite">
      <li v-for="invite in pendingInvites" :key="`${invite.chatRoomId}:${invite.userId}`" class="voice-request voice-request--outgoing">
        <span aria-hidden="true">➜</span><span class="voice-request__name">{{ display(invite.userId) }}</span>
        <small>等待回应</small>
        <button type="button" class="voice-request__action" :aria-label="`取消向 ${display(invite.userId)} 的私聊请求`" :disabled="pending" @click="run(() => voice.cancelInvite(invite.chatRoomId))">×</button>
      </li>
      <li v-for="invite in voice.incomingInvites" :key="invite.applyId" class="voice-request voice-request--incoming">
        <span aria-hidden="true">➜</span><span class="voice-request__name">{{ display(invite.fromUserId || '') }}</span>
        <button type="button" class="voice-request__action" :aria-label="`同意 ${display(invite.fromUserId || '')} 的私聊请求`" :disabled="Boolean(voice.respondingInviteId) || pending" @click="voice.respondToInvite(invite.applyId, true)">✓</button>
        <button type="button" class="voice-request__action" :aria-label="`拒绝 ${display(invite.fromUserId || '')} 的私聊请求`" :disabled="Boolean(voice.respondingInviteId) || pending" @click="voice.respondToInvite(invite.applyId, false)">×</button>
      </li>
    </ul>
    <p v-if="inPrivate && currentRoom" class="voice-current-members" aria-label="当前聊天成员">{{ currentRoom.users.map(member => display(member.userId)).join('、') }}</p>
    <ul class="voice-places">
      <li
        v-for="place in places"
        :key="place.id"
        :class="{ current: isCurrentPlace(place.name) }"
      >
        <button
          type="button"
          :disabled="pending || !canJoin || isCurrentPlace(place.name)"
          :aria-current="isCurrentPlace(place.name) ? 'location' : undefined"
          @click="run(() => voice.joinPlace(place.id))"
        >
          {{ place.name }}
        </button>
        <p v-if="members(place.name).length">
          {{
            members(place.name)
              .map((item) => display(item.userId))
              .join('、')
          }}
        </p>
      </li>
      <li
        v-for="[id, room] in inviteRooms"
        :key="id"
        :class="{ current: id === voice.currentActiveRoomId }"
      >
        <button
          type="button"
          :disabled="pending || !canJoin || id === voice.currentActiveRoomId"
          @click="run(() => voice.joinVoiceRoom(id))"
        >
          {{ room.scene }} 🔒
        </button>
        <p>{{ room.users.map((item) => display(item.userId)).join('、') }}</p>
      </li>
    </ul>
    <p v-if="game.level === 'night'" class="voice-notice">
      夜晚不能加入私聊地点
    </p>
    <p v-if="!game.currentPlayer" class="voice-notice">请先入座再加入语音</p>
    <ul v-if="!hasRequests && voice.outgoingInvites.some(invite => invite.status !== 'pending' && invite.status !== 'accepted')" class="voice-invite-status" aria-live="polite" aria-label="私聊邀请状态">
      <li v-for="invite in voice.outgoingInvites.filter(invite => invite.status !== 'pending' && invite.status !== 'accepted')" :key="`${invite.chatRoomId}:${invite.userId}`">
        {{ display(invite.userId) }}：{{ { pending: '等待对方同意…', accepted: '已同意', rejected: '已拒绝', timeout: '邀请已超时', cancelled: '邀请已取消', failed: '邀请失败' }[invite.status] }}
      </li>
    </ul>
    <p v-if="error || voice.inviteError" role="alert" class="voice-error">
      {{ error || voice.inviteError }}
    </p>
    <p v-if="voice.selectingInvitee" class="voice-notice" role="status">点击桌上的玩家或说书人，请求私聊。</p>
    <button
      type="button"
      class="request-chat"
      :disabled="pending || !canJoin || voice.waitingForInvite || voice.inviteSending"
      :aria-pressed="voice.selectingInvitee"
      @click="requestChat"
    >
      {{ voice.inviteSending ? '发送中…' : voice.selectingInvitee ? '取消选择' : '请求私聊' }}
    </button>
  </div>
</template>
<style scoped>
.player-voice-sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: #eee;
  font-family: Georgia, 'Noto Serif SC', serif;
  font-size: 13px;
  line-height: 1.25;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 5px;
}
header strong {
  color: #edbd52;
}
button {
  font: inherit;
  cursor: pointer;
  color: inherit;
}
header button {
  background: transparent;
  border: 0;
}
ul {
  list-style: none;
  padding: 0;
  margin: 0;
}
.voice-places { flex: 1; min-height: 0; overflow: auto; scrollbar-width: thin; }
.voice-requests, .voice-invite-status { flex-shrink: 0; max-height: 35%; overflow: auto; }
li {
  border: 1px solid #080509;
  border-radius: 5px;
  margin: 2px 0;
  padding: 0 5px;
}
li > button {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  color: #bb8ce8;
  padding: 2px 0;
  line-height: 18px;
}
li.current {
  background: #74439d26;
}
li.current > button {
  color: #e9b94b;
}
li p {
  margin: 2px 0 4px;
  font-size: 12px;
  overflow-wrap: anywhere;
}
button:disabled {
  cursor: default;
}
button:disabled:not([aria-current]) {
  opacity: 0.5;
}
button:focus-visible {
  outline: 2px solid #edc462;
}
.request-chat {
  flex-shrink: 0;
  display: block;
  margin: 6px auto 2px;
  border: 1px solid #776c86;
  border-radius: 5px;
  background: linear-gradient(#625769, #1a151f);
  padding: 4px 12px;
}
.voice-requests .voice-request { display: flex; align-items: center; gap: 5px; padding: 3px 5px; border: 0; }
.voice-request--incoming { color: #edbd52; }
.voice-request__name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.voice-request small { font-size: 10px; color: #c6bacf; }
.voice-requests .voice-request > .voice-request__action { display: inline-grid; place-items: center; width: 24px; height: 24px; flex: 0 0 24px; border: 0; padding: 0; color: #fff; background: #ffffff12; border-radius: 50%; text-align: center; }
.voice-current-members { margin: 2px 5px 7px; font-size: 12px; overflow-wrap: anywhere; }
.voice-notice {
  font-size: 12px;
  color: #dccb9e;
}
.voice-error {
  color: #f3a7a7;
  font-size: 13px;
}
</style>

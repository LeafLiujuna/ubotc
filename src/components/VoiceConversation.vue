<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useVoiceController } from '@/controllers/VoiceController'
import { useGameStore } from '@/stores/game'
import { useUserStore } from '@/stores/user'
import { useAppStore } from '@/stores/app'
import { usePlayerViewStore } from '@/stores/playerView'
import type { Player } from '@/types/domain'
import { roleTooltip } from '@/directives/roleTooltip'
import defaultAvatar from '@/assets/storyteller-Ch-i0CP4.png'
import Token from './Token.vue'
import VoiceSpeakingRing from './VoiceSpeakingRing.vue'
const props = defineProps<{ players?: Player[] }>()
const emit = defineEmits<{ roleAction: [userId: string, event: MouseEvent] }>()
const vRoleTooltip = roleTooltip
const voice = useVoiceController()
const game = useGameStore()
const users = useUserStore()
const app = useAppStore()
const view = usePlayerViewStore()
const expanded = ref('')
const collapsed = ref(false)
const returning = ref(false)
const room = computed(() =>
  voice.currentActiveRoomId && voice.currentActiveRoomId !== voice.publicRoomId
    ? voice.roomDirectory[voice.currentActiveRoomId]
    : undefined
)
const members = computed(
  () =>
    room.value?.users.map((member) => {
      const profile = users.getUserById(member.userId)
      const player = game.players[member.userId] || game.dms[member.userId]
      const seat = props.players?.find(seat => seat.id === member.userId)
      const roleId = !view.rolesCleared || game.currentIsDm ? player?.characterId : ''
      const visibleRole = seat?.role ?? (roleId ? { id: roleId } : { id: '' })
      const knownRole = app.roles.get(visibleRole.id)
      return {
        ...member,
        name:
          game.roomUsers[member.userId]?.displayName ||
          profile?.displayName ||
          member.userId,
        avatar: profile?.avatarUrl || defaultAvatar,
        role: {
          ...knownRole, ...visibleRole,
          name: visibleRole.name || knownRole?.name || '',
          team: visibleRole.team || knownRole?.team || '',
          ability: visibleRole.ability || knownRole?.ability || '',
        },
        canEditRole: Boolean(seat),
      }
    }) || []
)
watch(
  () => voice.currentActiveRoomId,
  () => { expanded.value = ''; collapsed.value = false }
)
watch(
  () => room.value?.users.map((member) => member.userId).join(','),
  () => {
    if (!room.value?.users.some(member => member.userId === expanded.value)) expanded.value = ''
    const ids = room.value?.users.map((member) => member.userId) || []
    if (ids.length) void users.getUsersInfo(ids).catch(() => undefined)
  },
  { immediate: true }
)
async function back() {
  if (returning.value) return
  returning.value = true
  try {
    await voice.backToPublicRoom()
  } catch {
    window.$toast.error('返回广场失败，请重试')
  } finally {
    returning.value = false
  }
}
</script>
<template>
  <section v-if="room" class="voice-conversation" :class="{ 'is-collapsed': collapsed }" aria-label="当前语音成员">
    <header>
      <span>{{ room.scene }}</span
      ><button type="button" :aria-pressed="collapsed" @click="collapsed = !collapsed">{{ collapsed ? '放大语音卡片' : '收起卡片，操作魔典' }}</button>
      <button type="button" :disabled="returning" @click="back">
        {{ returning ? '返回中…' : '返回广场' }}
      </button>
    </header>
    <div class="voice-member-cards">
      <article
        v-for="member in members"
        :key="member.userId"
        class="voice-member-card"
        :class="{ 'is-expanded': expanded === member.userId }"
        :data-speaking="voice.remoteVoiceStates[member.userId]?.isSpeaking || undefined"
      >
        <VoiceSpeakingRing :active="voice.remoteVoiceStates[member.userId]?.isSpeaking" />
        <button class="voice-member-portrait" type="button" :aria-label="`${expanded === member.userId ? '缩小' : '放大'} ${member.name} 的头像`"
          :aria-pressed="expanded === member.userId" @click="expanded = expanded === member.userId ? '' : member.userId">
        <img :src="member.avatar" :alt="member.name" /><span
          class="voice-member-name"
          >{{ member.muted ? '🔇' : '♬' }} {{ member.name }}</span
        ></button>
        <button class="voice-member-role" type="button" v-role-tooltip="member.role.id ? { id: member.role.id, name: member.role.name, team: member.role.team, ability: member.role.ability } : null"
          :aria-label="`${member.name} 的角色：${member.role.name || member.role.id || '未知角色'}${member.canEditRole ? '，点击操作魔典' : ''}`"
          :disabled="!member.canEditRole" @click.stop="emit('roleAction', member.userId, $event)">
          <Token :role="member.role" />
        </button>
      </article>
    </div>
  </section>
</template>
<style scoped>
.voice-conversation {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 75;
  width: min(66vw, 720px);
  color: #fff;
  pointer-events: none;
}
.voice-conversation header {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 15px;
  margin-bottom: 8px;
  font-size: 13px;
  text-shadow: 0 1px 3px #000;
}
.voice-conversation header button {
  pointer-events: auto;
  background: #21112de8;
  border: 1px solid #8b7598;
  border-radius: 5px;
  color: #fff;
  padding: 5px 10px;
  cursor: pointer;
}
.voice-member-cards {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 12px;
  max-height: 72dvh;
  overflow: auto;
  padding: 8px 15px;
}
.voice-member-card {
  position: relative;
  flex: 0 0 auto;
  width: clamp(130px, 19vw, 260px);
  aspect-ratio: 3 / 4;
  background: #201129;
  border: 1px solid #160d1b;
  padding: 0;
  border-radius: 5px;
  box-shadow: 0 3px 8px #0008;
  color: #fff;
  pointer-events: auto;
}
.voice-member-portrait { display: block; width: 100%; height: 100%; border: 0; padding: 0; background: transparent; color: inherit; cursor: zoom-in; border-radius: inherit; }
.voice-member-card.is-expanded { width: min(38vw, 380px, 46dvh); }
.voice-member-card.is-expanded .voice-member-portrait { cursor: zoom-out; }
.voice-member-card button:focus-visible { outline: 2px solid #edc462; outline-offset: 3px; }
.voice-member-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}
.voice-member-name {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  text-align: left;
  padding: 3px 5px;
  background: #120b18c9;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.voice-member-role {
  position: absolute;
  right: -12px;
  bottom: -4px;
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: #e6d7b0;
  padding: 0;
  border: 0;
  cursor: pointer;
}
.voice-member-role :deep(.token) {
  width: 100%;
  height: 100%;
}
.is-expanded .voice-member-role { width: 76px; height: 76px; }
.voice-member-role:disabled { cursor: default; }
.voice-conversation.is-collapsed { left: auto; top: auto; right: 20px; bottom: 70px; transform: none; width: min(360px, 65vw); }
.is-collapsed .voice-member-cards { justify-content: flex-end; max-height: 24dvh; }
.is-collapsed .voice-member-card { width: 66px; }
.is-collapsed .voice-member-role { width: 32px; height: 32px; right: -8px; }
.is-collapsed header { flex-wrap: wrap; gap: 5px; }
@media (max-width: 600px) {
  .voice-conversation { width: 88vw; }
  .voice-member-card { width: clamp(105px, 28vw, 160px); }
  .voice-member-card.is-expanded { width: min(58vw, 38dvh); }
  .voice-conversation header { gap: 5px; flex-wrap: wrap; }
}
</style>

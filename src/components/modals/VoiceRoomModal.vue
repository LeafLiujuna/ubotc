<script setup lang="ts">
import { computed, ref, watch, watchEffect } from 'vue'
import { storeToRefs } from 'pinia'
import VoiceSidebar from '../VoiceSidebar.vue'
import { useGameStore } from '@/stores/game'
import { useSessionStore } from '@/stores/session'
import { useAppStore } from '@/stores/app'
import { useUserStore } from '@/stores/user'
import { useVoiceController } from '@/controllers/VoiceController'
import type { VoiceRoomUserInfo } from '@/types/socket'
import type { BaseUserInfo } from '@/types'
import Modal from './Modal.vue'

defineOptions({ name: 'VoiceRoomModal' })
const props = defineProps<{ embedded?: boolean }>()

const appStore = useAppStore()
const userStore = useUserStore()
const { modals } = storeToRefs(appStore)
const voice = useVoiceController()

const visible = ref(Boolean(modals.value.voiceRoom))

watch(
  () => modals.value.voiceRoom,
  (v) => {
    visible.value = !!v
  },
  { immediate: true }
)

watch(visible, (v) => {
  if (!props.embedded && !v && modals.value.voiceRoom) {
    appStore.toggleModal('voiceRoom')
  }
})

/* ---- derived room list ---- */
interface RoomEntry {
  chatRoomId: string
  scene: string
  userCount: number
  isPublic: boolean
  isBroadcast: boolean
  isCurrent: boolean
}

const roomList = computed<RoomEntry[]>(() => {
  const dir = voice.roomDirectory
  return Object.entries(dir).map(([chatRoomId, info]) => ({
    chatRoomId,
    scene: info.scene,
    userCount: info.users.length,
    isPublic: chatRoomId === "townsquare" || chatRoomId === voice.publicRoomId,
    isBroadcast: chatRoomId === voice.broadcastRoomId,
    isCurrent: chatRoomId === voice.currentActiveRoomId,
  }))
})

const currentRoomEntry = computed(
  () => roomList.value.find((r) => r.isCurrent) ?? null
)

const currentRoomUsers = computed<VoiceRoomUserInfo[]>(() => {
  const roomId = voice.currentActiveRoomId
  if (!roomId) return []
  return voice.roomDirectory[roomId]?.users ?? []
})

/* ---- user info cache ---- */
const userCache = ref<Record<string, BaseUserInfo>>({})

watchEffect(() => {
  const allIds = new Set<string>()
  for (const room of Object.values(voice.roomDirectory)) {
    for (const u of room.users) {
      allIds.add(u.userId)
    }
  }
  const ids = [...allIds]
  if (ids.length === 0) return
  void userStore.getUsersInfo(ids).then((users) => {
    for (const u of users) {
      if (u) userCache.value[u.id] = u
    }
  })
})

function getUserDisplay(userId: string): string {
  return userCache.value[userId]?.displayName ?? userId
}

function getUserAvatar(userId: string): string | undefined {
  return userCache.value[userId]?.avatarUrl
}

/* ---- mute helpers ---- */
function isUserMutedLocally(userId: string): boolean {
  return voice.localMutedUsers[userId] ?? false
}

function isUserMutedByAdmin(info: VoiceRoomUserInfo): boolean {
  return info.mutedByAdmin
}

function isUserSelfMuted(info: VoiceRoomUserInfo): boolean {
  return info.muted
}

function isUserSpeakerMuted(info: VoiceRoomUserInfo): boolean {
  return info.speakerMuted
}

function isUserSilenced(userId: string, info: VoiceRoomUserInfo): boolean {
  return (
    isUserMutedLocally(userId) ||
    isUserMutedByAdmin(info) ||
    isUserSelfMuted(info) ||
    isUserSpeakerMuted(info)
  )
}

/* ---- room actions ---- */
const joiningRoomId = ref('')
const createTargetIds = ref('')
const isLeaving = ref(false)
const isReturning = ref(false)
const isCreating = ref(false)
const pendingAdminUserId = ref('')
const isAdminMutingAll = ref(false)
const actionError = ref('')

function clearActionError(): void {
  actionError.value = ''
}

function reportActionError(error: unknown, fallback: string): void {
  const detail = error instanceof Error ? error.message.trim() : ''
  const message = detail ? `${fallback}：${detail}` : fallback
  actionError.value = message

  if (typeof window !== 'undefined') {
    window.$toast?.error(message)
  }
}

function getRoomTypeLabel(room: RoomEntry): string {
  if (room.isPublic) return '公共广场'
  if (room.isBroadcast) return '广播频道'
  return '私密议事'
}

function getRoomDisplayName(room: RoomEntry): string {
  return room.scene || room.chatRoomId
}

async function handleJoinRoom(chatRoomId: string) {
  clearActionError()
  joiningRoomId.value = chatRoomId
  try {
    await voice.joinVoiceRoom(chatRoomId)
  } catch (error) {
    reportActionError(error, '加入语音频道失败')
  } finally {
    joiningRoomId.value = ''
  }
}

async function handleLeaveRoom() {
  clearActionError()
  isLeaving.value = true
  try {
    await voice.leaveVoiceRoom()
  } catch (error) {
    reportActionError(error, '退出语音频道失败')
  } finally {
    isLeaving.value = false
  }
}

async function handleBackToPublic() {
  clearActionError()
  isReturning.value = true
  try {
    await voice.backToPublicRoom()
  } catch (error) {
    reportActionError(error, '返回公共广场失败')
  } finally {
    isReturning.value = false
  }
}

async function handleCreateRoom() {
  const trimmed = createTargetIds.value.trim()
  if (!trimmed) return
  const ids = trimmed.split(/[,，\s]+/).filter(Boolean)
  if (ids.length === 0) return
  clearActionError()
  isCreating.value = true
  try {
    await voice.createVoiceRoom(ids)
    createTargetIds.value = ''
  } catch (error) {
    reportActionError(error, '创建私密语音房间失败')
  } finally {
    isCreating.value = false
  }
}

function handleToggleLocalMute(userId: string) {
  voice.toggleLocalMuteUser(userId)
}

async function handleAdminMuteUser(userId: string, mute: boolean) {
  clearActionError()
  pendingAdminUserId.value = userId
  try {
    await voice.adminSetUserMute(userId, mute)
  } catch (error) {
    reportActionError(error, mute ? '管理禁言失败' : '解除管理禁言失败')
  } finally {
    pendingAdminUserId.value = ''
  }
}

async function handleAdminMuteAll(mute: boolean) {
  clearActionError()
  isAdminMutingAll.value = true
  try {
    await voice.adminSetAllMute(mute)
  } catch (error) {
    reportActionError(error, mute ? '全员禁言失败' : '解除全员禁言失败')
  } finally {
    isAdminMutingAll.value = false
  }
}

function onClose() {
  clearActionError()
}
</script>

<template>
  <component
    :is="embedded ? 'div' : Modal"
    :class="{ 'voice-room-embedded': embedded }"
    v-model:visible="visible"
    name="voice-room"
    title="语音议事厅"
    description="在公共广场、广播频道与私密议事间切换，并管理当前频道的收听状态。"
    @close="onClose"
  >
    <VoiceSidebar v-if="useSessionStore().gameServerId && !useGameStore().currentIsDm" :listen-requests="false" />
    <div v-else-if="embedded" class="voice-sidebar">
      <ul class="voice-sidebar__rooms" aria-label="语音频道列表">
        <li v-for="room in roomList" :key="room.chatRoomId">
          <button type="button" class="voice-sidebar__room" :class="{ 'is-current': room.isCurrent }"
            :disabled="room.isCurrent || Boolean(joiningRoomId || isLeaving || isReturning)"
            :aria-current="room.isCurrent ? 'true' : undefined"
            :aria-label="`${room.isCurrent ? '当前频道' : '加入频道'}：${getRoomDisplayName(room)}`"
            @click="handleJoinRoom(room.chatRoomId)">
            <strong>{{ getRoomDisplayName(room) }}</strong><span>{{ room.userCount }}</span>
          </button>
          <p v-if="voice.roomDirectory[room.chatRoomId]?.users.length" class="voice-sidebar__members">
            <span v-for="user in voice.roomDirectory[room.chatRoomId].users" :key="user.userId">{{ getUserDisplay(user.userId) }}</span>
          </p>
        </li>
      </ul>
      <p v-if="!roomList.length" class="voice-sidebar__empty">暂无可用频道</p>
      <p v-if="actionError" class="voice-sidebar__error" role="alert">{{ actionError }}</p>
      <button type="button" class="voice-sidebar__manage" @click="appStore.toggleModal('voiceRoom')">语音管理</button>
    </div>
    <div v-else
      class="voice-room-modal"
      :aria-busy="
        Boolean(joiningRoomId || isLeaving || isReturning || isCreating)
      "
    >
      <section
        class="current-room-card"
        :class="{ 'current-room-card--empty': !currentRoomEntry }"
        aria-labelledby="voice-current-room"
      >
        <span class="current-room-icon" aria-hidden="true">
          <font-awesome-icon :icon="['fas', 'volume-up']" />
        </span>

        <div class="current-room-copy">
          <span id="voice-current-room" class="section-kicker">当前频道</span>
          <template v-if="currentRoomEntry">
            <strong>{{ getRoomTypeLabel(currentRoomEntry) }}</strong>
            <code>{{ getRoomDisplayName(currentRoomEntry) }}</code>
          </template>
          <strong v-else>尚未进入语音频道</strong>
        </div>

        <span v-if="currentRoomEntry" class="room-population">
          <font-awesome-icon
            :icon="['fas', 'user-friends']"
            aria-hidden="true"
          />
          {{ currentRoomEntry.userCount }} 人
        </span>

        <button
          v-if="currentRoomEntry && !currentRoomEntry.isPublic"
          type="button"
          class="voice-button voice-button--ghost current-room-action"
          :disabled="isReturning || isLeaving"
          @click="handleBackToPublic"
        >
          <font-awesome-icon :icon="['fas', 'users']" aria-hidden="true" />
          {{ isReturning ? '返回中…' : '返回广场' }}
        </button>
      </section>

      <div v-if="actionError" class="action-error" role="alert">
        <font-awesome-icon
          :icon="['fas', 'exclamation-triangle']"
          aria-hidden="true"
        />
        <span>{{ actionError }}</span>
        <button
          type="button"
          aria-label="关闭错误提示"
          @click="clearActionError"
        >
          <font-awesome-icon :icon="['fas', 'times']" aria-hidden="true" />
        </button>
      </div>

      <div class="voice-room-layout">
        <div class="voice-room-column">
          <section
            class="voice-section"
            aria-labelledby="voice-room-list-title"
          >
            <header class="section-heading">
              <div>
                <span class="section-kicker">频道目录</span>
                <h3 id="voice-room-list-title">可用房间</h3>
              </div>
              <span class="section-count">{{ roomList.length }}</span>
            </header>

            <div v-if="roomList.length" class="rooms" role="list">
              <article
                v-for="room in roomList"
                :key="room.chatRoomId"
                class="room-item"
                :class="{ 'room-item--current': room.isCurrent }"
                role="listitem"
              >
                <div class="room-info">
                  <div class="room-info-topline">
                    <span class="room-type-tag">{{
                      getRoomTypeLabel(room)
                    }}</span>
                    <span class="room-count">{{ room.userCount }} 人</span>
                  </div>
                  <strong class="room-name">{{
                    getRoomDisplayName(room)
                  }}</strong>
                  <code
                    v-if="room.scene && room.scene !== room.chatRoomId"
                    class="room-id"
                  >
                    {{ room.chatRoomId }}
                  </code>
                </div>

                <div class="room-actions">
                  <span
                    v-if="room.isCurrent"
                    class="current-badge"
                    aria-current="true"
                  >
                    当前
                  </span>
                  <button
                    v-else
                    type="button"
                    class="voice-button voice-button--primary"
                    :disabled="
                      Boolean(joiningRoomId || isLeaving || isReturning)
                    "
                    @click="handleJoinRoom(room.chatRoomId)"
                  >
                    <font-awesome-icon
                      :icon="['fas', 'sign-in-alt']"
                      aria-hidden="true"
                    />
                    {{ joiningRoomId === room.chatRoomId ? '加入中…' : '加入' }}
                  </button>
                  <button
                    v-if="room.isCurrent && !room.isPublic"
                    type="button"
                    class="voice-button voice-button--danger"
                    :disabled="isLeaving || isReturning"
                    @click="handleLeaveRoom"
                  >
                    {{ isLeaving ? '退出中…' : '退出' }}
                  </button>
                </div>
              </article>
            </div>

            <div v-else class="empty-state" role="status">
              <font-awesome-icon
                :icon="['fas', 'volume-mute']"
                aria-hidden="true"
              />
              <strong>暂无可用频道</strong>
              <span>等待房间语音目录同步后，这里会自动出现频道。</span>
            </div>
          </section>

          <section
            class="voice-section create-section"
            aria-labelledby="voice-create-title"
          >
            <header class="section-heading section-heading--compact">
              <div>
                <span class="section-kicker">悄声议事</span>
                <h3 id="voice-create-title">创建私密房间</h3>
              </div>
            </header>

            <label class="field-label" for="voice-room-targets"
              >受邀用户 ID</label
            >
            <div class="create-form">
              <input
                id="voice-room-targets"
                v-model="createTargetIds"
                type="text"
                inputmode="text"
                autocomplete="off"
                placeholder="例如 user-01, user-02"
                class="form-input"
                :disabled="isCreating"
                aria-describedby="voice-room-targets-hint"
                @keyup.enter="handleCreateRoom"
              />
              <button
                type="button"
                class="voice-button voice-button--primary create-button"
                :disabled="isCreating || !createTargetIds.trim()"
                @click="handleCreateRoom"
              >
                <font-awesome-icon
                  :icon="['fas', 'comments']"
                  aria-hidden="true"
                />
                {{ isCreating ? '创建中…' : '创建' }}
              </button>
            </div>
            <p id="voice-room-targets-hint" class="field-hint">
              多名用户可用中文逗号、英文逗号或空格分隔。
            </p>
          </section>
        </div>

        <section
          v-if="currentRoomEntry"
          class="voice-section members-section"
          aria-labelledby="voice-members-title"
        >
          <header class="section-heading">
            <div>
              <span class="section-kicker">席间众人</span>
              <h3 id="voice-members-title">频道成员</h3>
            </div>
            <span class="section-count">{{ currentRoomUsers.length }}</span>
          </header>

          <div v-if="currentRoomUsers.length" class="members-list" role="list">
            <article
              v-for="user in currentRoomUsers"
              :key="user.userId"
              class="member-item"
              :class="{
                'member-item--silenced': isUserSilenced(user.userId, user),
              }"
              role="listitem"
            >
              <div class="member-avatar" aria-hidden="true">
                <img
                  v-if="getUserAvatar(user.userId)"
                  :src="getUserAvatar(user.userId)"
                  alt=""
                />
                <span v-else class="avatar-fallback">
                  {{ getUserDisplay(user.userId).charAt(0) }}
                </span>
                <span class="voice-presence"></span>
              </div>

              <div class="member-copy">
                <strong class="member-name">{{
                  getUserDisplay(user.userId)
                }}</strong>
                <span class="member-id">{{ user.userId }}</span>
                <span class="member-mute-tags">
                  <span v-if="isUserMutedLocally(user.userId)" class="tag"
                    >本地静音</span
                  >
                  <span v-if="isUserSelfMuted(user)" class="tag">已自禁</span>
                  <span v-if="isUserMutedByAdmin(user)" class="tag tag--danger"
                    >管理禁言</span
                  >
                  <span v-if="isUserSpeakerMuted(user)" class="tag tag--warning"
                    >禁止发言</span
                  >
                  <span
                    v-if="!isUserSilenced(user.userId, user)"
                    class="tag tag--active"
                    >正在收听</span
                  >
                </span>
              </div>

              <div class="member-actions">
                <button
                  type="button"
                  class="voice-button voice-button--icon"
                  :class="{
                    'voice-button--active': isUserMutedLocally(user.userId),
                  }"
                  :aria-pressed="isUserMutedLocally(user.userId)"
                  :aria-label="`${isUserMutedLocally(user.userId) ? '取消本地静音' : '本地静音'}：${getUserDisplay(user.userId)}`"
                  @click="handleToggleLocalMute(user.userId)"
                >
                  <font-awesome-icon
                    :icon="[
                      'fas',
                      isUserMutedLocally(user.userId)
                        ? 'volume-up'
                        : 'volume-mute',
                    ]"
                    aria-hidden="true"
                  />
                </button>
                <button
                  v-if="voice.allowBroadcastSpeaking"
                  type="button"
                  class="voice-button voice-button--icon voice-button--admin"
                  :class="{ 'voice-button--active': isUserMutedByAdmin(user) }"
                  :disabled="Boolean(pendingAdminUserId || isAdminMutingAll)"
                  :aria-pressed="isUserMutedByAdmin(user)"
                  :aria-label="`${isUserMutedByAdmin(user) ? '解除管理禁言' : '管理禁言'}：${getUserDisplay(user.userId)}`"
                  @click="
                    handleAdminMuteUser(user.userId, !isUserMutedByAdmin(user))
                  "
                >
                  <font-awesome-icon
                    :icon="[
                      'fas',
                      isUserMutedByAdmin(user)
                        ? 'microphone'
                        : 'microphone-slash',
                    ]"
                    aria-hidden="true"
                  />
                </button>
              </div>
            </article>
          </div>

          <div v-else class="empty-state empty-state--compact" role="status">
            <font-awesome-icon
              :icon="['fas', 'user-friends']"
              aria-hidden="true"
            />
            <strong>频道内暂无成员</strong>
          </div>

          <div
            v-if="voice.allowBroadcastSpeaking && currentRoomUsers.length"
            class="admin-toolbar"
            aria-label="频道管理"
          >
            <span>说书人管理</span>
            <div>
              <button
                type="button"
                class="voice-button voice-button--danger"
                :disabled="isAdminMutingAll || Boolean(pendingAdminUserId)"
                @click="handleAdminMuteAll(true)"
              >
                全员禁言
              </button>
              <button
                type="button"
                class="voice-button voice-button--ghost"
                :disabled="isAdminMutingAll || Boolean(pendingAdminUserId)"
                @click="handleAdminMuteAll(false)"
              >
                {{ isAdminMutingAll ? '处理中…' : '解除全员' }}
              </button>
            </div>
          </div>
        </section>
      </div>

      <p class="sr-status" aria-live="polite">
        <span v-if="joiningRoomId">正在加入语音频道。</span>
        <span v-else-if="isLeaving">正在退出当前频道。</span>
        <span v-else-if="isReturning">正在返回公共广场。</span>
        <span v-else-if="isCreating">正在创建私密语音房间。</span>
      </p>
    </div>
  </component>
</template>

<style scoped lang="scss">
.voice-sidebar { padding: 2px 8px 8px; color: #e8e0d1; font-size: 13px; }
.voice-sidebar__rooms { margin: 0; padding: 0; list-style: none; }
.voice-sidebar__rooms li { margin: 0 0 4px; }
.voice-sidebar__room { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: 28px; padding: 3px 9px; border: 2px solid #090909; border-radius: 12px; background: #151514c9; color: #b18ce1; font: inherit; text-align: left; cursor: pointer; }
.voice-sidebar__room.is-current { color: #ffad00; }
.voice-sidebar__room:hover:not(:disabled) { background: #070707; color: #ffad00; }
.voice-sidebar__room:disabled { cursor: default; }
.voice-sidebar__room:focus-visible, .voice-sidebar__manage:focus-visible { outline: 2px solid #e8c777; outline-offset: 2px; }
.voice-sidebar__members { display: flex; flex-wrap: wrap; gap: 3px 8px; margin: 2px 9px 4px; color: #eee4d1; font-size: 12px; }
.voice-sidebar__empty { padding: 8px; margin: 0; color: #c5baa5; }
.voice-sidebar__error { color: #f5a7a7; }
.voice-sidebar__manage { display: block; margin: 8px auto 0; padding: 4px 14px; border: 2px solid #111; border-radius: 14px; background: #4e4c46; box-shadow: inset 0 1px #ffffff44; color: #fff; font-family: inherit; font-size: 13px; font-weight: bold; line-height: 1.2; cursor: pointer; }
:deep(.modal.voice-room) {
  width: min(920px, 100%);
}

:deep(.modal.voice-room > .slot) {
  padding: var(--ts-space-5, 24px);
}

.voice-room-modal {
  width: 100%;
  min-width: 0;
  max-width: none;
  max-height: none;
  padding: 0;
  overflow: visible;
  display: flex;
  flex-direction: column;
  gap: var(--ts-space-4, 16px);
  color: var(--ts-text-primary, #f4ebdd);
}

.current-room-card {
  min-width: 0;
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--ts-space-3, 12px);
  padding: var(--ts-space-4, 16px);
  border: 1px solid rgba(214, 184, 106, 0.34);
  border-radius: var(--ts-radius-md, 10px);
  background:
    linear-gradient(105deg, rgba(128, 28, 38, 0.24), transparent 52%),
    linear-gradient(145deg, rgba(55, 35, 27, 0.92), rgba(24, 16, 20, 0.96)),
    var(--ts-noise-stone);
  box-shadow:
    inset 0 1px 0 rgba(255, 240, 205, 0.08),
    0 12px 30px rgba(0, 0, 0, 0.22);

  &--empty {
    grid-template-columns: 48px minmax(0, 1fr);
  }
}

.current-room-icon {
  width: 48px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(214, 184, 106, 0.42);
  border-radius: 50%;
  color: var(--ts-accent-gold-hover, #e7cf86);
  background:
    radial-gradient(
      circle at 35% 28%,
      rgba(255, 232, 170, 0.16),
      transparent 38%
    ),
    #2a1715;
  box-shadow:
    inset 0 0 0 4px rgba(11, 7, 9, 0.62),
    0 4px 14px rgba(0, 0, 0, 0.32);
}

.current-room-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;

  strong {
    color: #fff3da;
    font-family: var(--ts-font-heading, serif);
    font-size: 1.05rem;
    letter-spacing: 0.025em;
  }

  code {
    max-width: 100%;
    overflow: hidden;
    color: var(--ts-text-muted, #c9bca7);
    font-family: var(--ts-font-ui, sans-serif);
    font-size: 0.76rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.section-kicker {
  color: var(--ts-accent-gold, #d6b86a);
  font-size: 0.69rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  line-height: 1.2;
  text-transform: uppercase;
}

.room-population,
.section-count,
.current-badge {
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid rgba(214, 184, 106, 0.28);
  border-radius: var(--ts-radius-pill, 999px);
  color: #ead7aa;
  background: rgba(10, 7, 9, 0.46);
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
}

.room-population {
  padding: 0 11px;
}

.current-badge {
  min-width: 54px;
  padding: 0 10px;
  border-color: rgba(109, 168, 128, 0.44);
  color: #c7e6cf;
  background: rgba(45, 101, 64, 0.22);
}

.voice-room-layout {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 0.92fr) minmax(320px, 1.08fr);
  align-items: start;
  gap: var(--ts-space-4, 16px);
}

.voice-room-column {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ts-space-4, 16px);
}

.voice-section {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--ts-border-subtle, rgba(214, 184, 106, 0.22));
  border-radius: var(--ts-radius-md, 10px);
  background:
    linear-gradient(180deg, rgba(214, 184, 106, 0.045), transparent 64px),
    rgba(12, 9, 14, 0.58);
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.025);
}

.section-heading {
  min-height: 62px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--ts-border-subtle, rgba(214, 184, 106, 0.22));

  &--compact {
    min-height: auto;
    padding-bottom: 10px;
  }

  h3 {
    margin: 3px 0 0;
    color: #f5e8cf;
    font-family: var(--ts-font-heading, serif);
    font-size: 1.02rem;
    line-height: 1.25;
    letter-spacing: 0.025em;
  }
}

.section-count {
  min-width: 30px;
  padding: 0 9px;
}

.rooms {
  display: flex;
  flex-direction: column;
}

.room-item {
  min-width: 0;
  min-height: 78px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid rgba(214, 184, 106, 0.14);
  background: rgba(16, 11, 15, 0.3);
  transition:
    background-color var(--ts-motion-fast, 160ms) ease,
    box-shadow var(--ts-motion-fast, 160ms) ease;

  &:last-child {
    border-bottom: 0;
  }

  &:hover {
    background: rgba(111, 31, 39, 0.12);
  }

  &--current {
    background:
      linear-gradient(90deg, rgba(131, 35, 45, 0.2), transparent 72%),
      rgba(16, 11, 15, 0.42);
    box-shadow: inset 3px 0 0 var(--ts-accent-crimson, #8e2f36);
  }
}

.room-info {
  min-width: 0;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 5px;
}

.room-info-topline {
  display: flex;
  align-items: center;
  gap: 8px;
}

.room-type-tag {
  color: var(--ts-accent-gold, #d6b86a);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.room-count {
  color: var(--ts-text-subtle, #9d907f);
  font-size: 0.72rem;
}

.room-name {
  max-width: 100%;
  overflow: hidden;
  color: #f2e7d3;
  font-size: 0.92rem;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.room-id {
  max-width: 100%;
  overflow: hidden;
  color: var(--ts-text-subtle, #9d907f);
  font-size: 0.69rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.room-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
}

.voice-button {
  min-width: 44px;
  min-height: 44px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid rgba(214, 184, 106, 0.32);
  border-radius: var(--ts-radius-md, 10px);
  color: #efe1c5;
  background: linear-gradient(
    180deg,
    rgba(76, 48, 34, 0.9),
    rgba(31, 20, 19, 0.96)
  );
  box-shadow:
    inset 0 1px rgba(255, 244, 215, 0.06),
    0 4px 12px rgba(0, 0, 0, 0.18);
  cursor: pointer;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 750;
  line-height: 1.15;
  touch-action: manipulation;
  transition:
    color var(--ts-motion-fast, 160ms) ease,
    background-color var(--ts-motion-fast, 160ms) ease,
    border-color var(--ts-motion-fast, 160ms) ease,
    box-shadow var(--ts-motion-fast, 160ms) ease,
    transform var(--ts-motion-fast, 160ms) ease;

  &:hover:not(:disabled) {
    color: #fff5e3;
    border-color: rgba(231, 207, 134, 0.72);
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:focus-visible {
    outline: 3px solid var(--ts-focus-ring, #f0d990);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.46;
    transform: none;
  }

  &--primary {
    border-color: rgba(214, 184, 106, 0.55);
    color: #fff0c6;
    background: linear-gradient(
      180deg,
      rgba(132, 87, 36, 0.94),
      rgba(72, 42, 24, 0.98)
    );
  }

  &--danger {
    border-color: rgba(179, 61, 72, 0.54);
    color: #ffdfe0;
    background: linear-gradient(
      180deg,
      rgba(126, 39, 47, 0.9),
      rgba(65, 25, 30, 0.98)
    );
  }

  &--ghost {
    background: rgba(9, 7, 10, 0.32);
  }

  &--icon {
    width: 44px;
    padding: 0;
    border-radius: 50%;
  }

  &--active {
    border-color: rgba(214, 184, 106, 0.78);
    color: #ffe6a2;
    background: linear-gradient(
      180deg,
      rgba(132, 87, 36, 0.74),
      rgba(66, 37, 24, 0.96)
    );
  }
}

.current-room-action {
  white-space: nowrap;
}

.action-error {
  min-height: 48px;
  padding: 8px 8px 8px 13px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 44px;
  align-items: center;
  gap: 10px;
  border: 1px solid rgba(190, 63, 74, 0.58);
  border-radius: var(--ts-radius-md, 10px);
  color: #ffd8d9;
  background: linear-gradient(
    90deg,
    rgba(143, 42, 51, 0.34),
    rgba(48, 19, 24, 0.68)
  );
  font-size: 0.8rem;
  line-height: 1.45;

  > svg {
    color: #ef9299;
  }

  button {
    width: 44px;
    height: 44px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: var(--ts-radius-md, 10px);
    color: #f4c7c9;
    background: transparent;
    cursor: pointer;

    &:hover {
      color: white;
      background: rgba(255, 255, 255, 0.08);
    }

    &:focus-visible {
      outline: 3px solid var(--ts-focus-ring, #f0d990);
      outline-offset: 1px;
    }
  }
}

.create-section {
  padding-bottom: 14px;
}

.field-label,
.field-hint,
.create-form {
  margin-right: 14px;
  margin-left: 14px;
}

.field-label {
  display: block;
  margin-top: 12px;
  margin-bottom: 7px;
  color: #e9d9bc;
  font-size: 0.78rem;
  font-weight: 700;
}

.create-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.form-input {
  min-width: 0;
  min-height: 44px;
  padding: 9px 12px;
  border: 1px solid rgba(214, 184, 106, 0.28);
  border-radius: var(--ts-radius-md, 10px);
  color: #f5ead6;
  background: linear-gradient(
    180deg,
    rgba(9, 7, 10, 0.78),
    rgba(24, 16, 18, 0.88)
  );
  box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.38);
  font: inherit;
  font-size: 0.88rem;
  outline: none;

  &::placeholder {
    color: #81776c;
  }

  &:focus {
    border-color: var(--ts-accent-gold, #d6b86a);
    box-shadow:
      0 0 0 3px rgba(214, 184, 106, 0.14),
      inset 0 1px 4px rgba(0, 0, 0, 0.38);
  }

  &:disabled {
    cursor: wait;
    opacity: 0.58;
  }
}

.create-button {
  min-width: 92px;
}

.field-hint {
  margin-top: 7px;
  margin-bottom: 0;
  color: var(--ts-text-subtle, #9d907f);
  font-size: 0.7rem;
  line-height: 1.45;
}

.members-section {
  display: flex;
  min-height: 0;
  flex-direction: column;
}

.members-list {
  min-height: 0;
  max-height: min(400px, 42dvh);
  overflow: hidden auto;
  scrollbar-color: var(--ts-border-strong, #8f7443) transparent;
  scrollbar-width: thin;
}

.member-item {
  min-width: 0;
  min-height: 72px;
  padding: 11px 12px;
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid rgba(214, 184, 106, 0.13);
  background: rgba(11, 8, 12, 0.26);

  &:last-child {
    border-bottom: 0;
  }

  &--silenced {
    background:
      linear-gradient(90deg, rgba(101, 36, 43, 0.12), transparent 64%),
      rgba(11, 8, 12, 0.38);
  }
}

.member-avatar {
  position: relative;
  width: 46px;
  height: 46px;
  flex: 0 0 46px;

  img,
  .avatar-fallback {
    width: 100%;
    height: 100%;
    border: 1px solid rgba(214, 184, 106, 0.44);
    border-radius: 50%;
    object-fit: cover;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
  }

  .avatar-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff0d0;
    background:
      radial-gradient(
        circle at 35% 28%,
        rgba(255, 236, 183, 0.16),
        transparent 38%
      ),
      linear-gradient(145deg, #762a34, #3b2022);
    font-family: var(--ts-font-heading, serif);
    font-size: 1rem;
    font-weight: 800;
  }
}

.voice-presence {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 12px;
  height: 12px;
  border: 2px solid #171016;
  border-radius: 50%;
  background: #78aa7b;
  box-shadow: 0 0 8px rgba(120, 170, 123, 0.52);
}

.member-item--silenced .voice-presence {
  background: #8b8177;
  box-shadow: none;
}

.member-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.member-name,
.member-id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-name {
  color: #f4e8d2;
  font-size: 0.88rem;
  line-height: 1.3;
}

.member-id {
  color: var(--ts-text-subtle, #9d907f);
  font-size: 0.66rem;
}

.member-mute-tags {
  min-height: 18px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag {
  min-height: 18px;
  padding: 2px 6px;
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(172, 158, 141, 0.22);
  border-radius: var(--ts-radius-pill, 999px);
  color: #bdb1a0;
  background: rgba(76, 69, 65, 0.2);
  font-size: 0.6rem;
  font-weight: 700;
  line-height: 1;

  &--danger {
    border-color: rgba(179, 61, 72, 0.38);
    color: #f2b8bd;
    background: rgba(126, 39, 47, 0.2);
  }

  &--warning {
    border-color: rgba(205, 142, 61, 0.38);
    color: #e9c58f;
    background: rgba(126, 80, 33, 0.2);
  }

  &--active {
    border-color: rgba(99, 150, 111, 0.38);
    color: #b9ddc1;
    background: rgba(49, 101, 61, 0.18);
  }
}

.member-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.admin-toolbar {
  min-height: 66px;
  margin-top: auto;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-top: 1px solid rgba(214, 184, 106, 0.2);
  background:
    linear-gradient(90deg, rgba(117, 30, 39, 0.16), transparent),
    rgba(12, 8, 11, 0.54);

  > span {
    color: var(--ts-accent-gold, #d6b86a);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.08em;
  }

  > div {
    display: flex;
    gap: 7px;
  }
}

.empty-state {
  min-height: 136px;
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 7px;
  color: var(--ts-text-subtle, #9d907f);
  text-align: center;

  svg {
    color: rgba(214, 184, 106, 0.54);
    font-size: 1.4rem;
  }

  strong {
    color: #d6c9b5;
    font-family: var(--ts-font-heading, serif);
  }

  span {
    max-width: 32ch;
    font-size: 0.75rem;
    line-height: 1.45;
  }

  &--compact {
    min-height: 180px;
  }
}

.sr-status {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  border: 0;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (max-width: 760px) {
  :deep(.modal.voice-room > .slot) {
    padding: var(--ts-space-4, 16px);
  }

  .voice-room-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .members-list {
    max-height: min(360px, 42dvh);
  }
}

@media (max-width: 520px) {
  .voice-room-modal {
    gap: 12px;
  }

  .current-room-card {
    grid-template-columns: 44px minmax(0, 1fr) auto;
    padding: 12px;
  }

  .current-room-icon {
    width: 44px;
    height: 44px;
  }

  .room-population {
    padding: 0 8px;

    svg {
      display: none;
    }
  }

  .current-room-action {
    grid-column: 1 / -1;
    width: 100%;
  }

  .room-item {
    align-items: stretch;
    flex-direction: column;
  }

  .room-actions {
    justify-content: flex-end;
  }

  .room-actions .voice-button:not(.voice-button--icon) {
    flex: 1 1 auto;
  }

  .create-form {
    grid-template-columns: minmax(0, 1fr);
  }

  .create-button {
    width: 100%;
  }

  .member-item {
    grid-template-columns: 44px minmax(0, 1fr);
  }

  .member-avatar {
    width: 44px;
    height: 44px;
  }

  .member-actions {
    grid-column: 1 / -1;
    justify-content: flex-end;
    padding-left: 54px;
  }

  .member-actions .voice-button {
    border-radius: var(--ts-radius-md, 10px);
  }

  .admin-toolbar {
    align-items: stretch;
    flex-direction: column;

    > div {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
}

@media (max-height: 620px) {
  .members-list {
    max-height: 220px;
  }

  .empty-state--compact {
    min-height: 110px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .room-item,
  .voice-button {
    transition-duration: 0.01ms !important;
  }
}
</style>

<style scoped lang="scss">
.voice-room-embedded {
  padding: 0;
}
</style>

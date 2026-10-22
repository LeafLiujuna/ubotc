<template>
  <Modal
    v-if="modals.groupChat"
    name="group-chat"
    title="私聊分组"
    description="整理本地私聊对象与临时分组；这里不会改变实时游戏服务器中的语音或文字频道。"
    @close="close"
  >
    <div class="group-chat-panel">
      <aside
        class="sync-notice"
        :class="{ 'sync-notice--api': isApiRoom }"
        role="note"
        aria-label="同步状态"
      >
        <span class="sync-notice__icon" aria-hidden="true">
          <font-awesome-icon :icon="['fas', 'broadcast-tower']" />
        </span>
        <span class="sync-notice__copy">
          <strong>本地私聊分组 · 仅本机可见</strong>
          <span>
            {{
              isApiRoom
                ? '新增、移除与保留设置只影响当前浏览器，不会发送给房间中的其他玩家。'
                : '这些分组只保存在当前设备上，不会同步给其他玩家。'
            }}
          </span>
        </span>
      </aside>

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

      <header class="group-toolbar">
        <div>
          <span class="section-kicker">议事名册</span>
          <h3>已有分组</h3>
          <p>{{ session.groupChats.length }} 个本地分组</p>
        </div>
        <button
          type="button"
          class="panel-button panel-button--primary"
          :disabled="adding || !canStartGroup"
          :title="!canStartGroup ? '当前没有足够的可选玩家' : undefined"
          @click="requestGroupChat()"
        >
          <font-awesome-icon :icon="['fas', 'plus']" aria-hidden="true" />
          新建分组
        </button>
      </header>

      <section
        v-if="session.groupChats.length"
        class="groups-list"
        aria-label="本地私聊分组列表"
      >
        <article
          v-for="(group, groupIndex) in session.groupChats"
          :key="group.id"
          class="group-card"
          :class="{
            'group-card--editing': adding && addingGroup === group.id,
          }"
        >
          <header class="group-card__header">
            <div class="group-card__identity">
              <span class="local-badge">本地</span>
              <h4>{{ getGroupTitle(group, groupIndex) }}</h4>
              <span>{{ group.players.length }} 名成员</span>
            </div>

            <div class="group-card__actions">
              <button
                type="button"
                class="panel-button panel-button--icon"
                :disabled="adding || selectablePlayers.length === 0"
                :aria-label="
                  '向' + getGroupTitle(group, groupIndex) + '添加成员'
                "
                title="添加成员"
                @click="requestGroupChat(group.id)"
              >
                <font-awesome-icon
                  :icon="['fas', 'user-plus']"
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                class="panel-button panel-button--icon panel-button--danger"
                :disabled="adding"
                :aria-label="'移除' + getGroupTitle(group, groupIndex)"
                title="移除分组"
                @click="removeGroupChat(group.id)"
              >
                <font-awesome-icon
                  :icon="['fas', 'trash-alt']"
                  aria-hidden="true"
                />
              </button>
            </div>
          </header>

          <div v-if="group.players.length" class="group-members" role="list">
            <div
              v-for="player in group.players"
              :key="player.id"
              class="member-chip"
              role="listitem"
            >
              <span class="seat-mark">{{ getPlayerSeat(player) }}</span>
              <span class="member-name">{{ player.name || '未命名玩家' }}</span>
              <button
                type="button"
                :disabled="adding"
                :aria-label="
                  '从' +
                  getGroupTitle(group, groupIndex) +
                  '移除' +
                  (player.name || '未命名玩家')
                "
                @click="removeGroupChatMember(group.id, player)"
              >
                <font-awesome-icon
                  :icon="['fas', 'times']"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
          <p v-else class="group-empty">该分组目前没有成员。</p>

          <footer class="group-card__footer">
            <label class="keep-toggle">
              <input
                type="checkbox"
                :checked="group.keep"
                :disabled="adding"
                @change="toggleGroupKeep(group.id)"
              />
              <span class="keep-toggle__control" aria-hidden="true"></span>
              <span class="keep-toggle__copy">
                <strong>仅剩 1 人时保留</strong>
                <span>关闭后，人数不足会自动移除分组。</span>
              </span>
            </label>
          </footer>
        </article>
      </section>

      <section v-else class="empty-state" aria-labelledby="group-empty-title">
        <span class="empty-state__seal" aria-hidden="true">
          <font-awesome-icon :icon="['fas', 'users']" />
        </span>
        <h3 id="group-empty-title">尚无本地私聊分组</h3>
        <p>选择至少两名已入座玩家，即可在当前客户端建立分组。</p>
        <button
          type="button"
          class="panel-button panel-button--primary"
          :disabled="adding || !canStartGroup"
          @click="requestGroupChat()"
        >
          <font-awesome-icon :icon="['fas', 'user-plus']" aria-hidden="true" />
          选择玩家
        </button>
      </section>

      <section
        v-if="adding"
        class="selection-panel"
        aria-labelledby="group-selection-title"
      >
        <header class="selection-panel__header">
          <div>
            <span class="section-kicker">选择席位</span>
            <h3 id="group-selection-title">{{ selectionTitle }}</h3>
            <p>{{ selectionHint }}</p>
          </div>
          <button
            type="button"
            class="panel-button panel-button--icon"
            aria-label="取消选择玩家"
            title="取消"
            @click="cancelGroupChat"
          >
            <font-awesome-icon :icon="['fas', 'times']" aria-hidden="true" />
          </button>
        </header>

        <div v-if="selectablePlayers.length" class="player-options">
          <label
            v-for="(player, index) in selectablePlayers"
            :key="player.id"
            class="player-option"
            :for="'group-player-' + index"
          >
            <input
              :id="'group-player-' + index"
              v-model="selectedPlayersStatus[index]"
              type="checkbox"
            />
            <span class="seat-mark">{{ getPlayerSeat(player) }}</span>
            <span class="player-option__copy">
              <strong>{{ player.name || '未命名玩家' }}</strong>
              <span>玩家 ID：{{ player.id }}</span>
            </span>
            <font-awesome-icon
              class="player-option__check"
              :icon="[
                'fas',
                selectedPlayersStatus[index] ? 'check-square' : 'square',
              ]"
              aria-hidden="true"
            />
          </label>
        </div>

        <div v-else class="selection-empty" role="status">
          当前没有未分组且已入座的玩家。
        </div>

        <p v-if="warningMessage" class="selection-warning" role="alert">
          {{ warningMessage }}
        </p>

        <footer class="selection-panel__footer">
          <span aria-live="polite"
            >已选择 {{ selectedPlayerCount }} 名玩家</span
          >
          <div>
            <button
              type="button"
              class="panel-button panel-button--ghost"
              @click="cancelGroupChat"
            >
              取消
            </button>
            <button
              type="button"
              class="panel-button panel-button--primary"
              :disabled="!canSubmitSelection"
              @click="addGroupChat"
            >
              {{ addingGroup ? '添加成员' : '创建分组' }}
            </button>
          </div>
        </footer>
      </section>
    </div>
  </Modal>
</template>

<script setup lang="js">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { usePlayersStore } from '@/stores/players'
import { useSessionStore } from '@/stores/session'
import Modal from './Modal'

const appStore = useAppStore()
const playersStore = usePlayersStore()
const sessionStore = useSessionStore()

const { modals } = storeToRefs(appStore)
const { players } = storeToRefs(playersStore)
const session = sessionStore.$state

const adding = ref(false)
const addingGroup = ref(null)
const selectedPlayersStatus = ref([])
const warningMessage = ref('')
const actionError = ref('')

const isApiRoom = computed(() =>
  Boolean(session.sessionId && session.gameServerId)
)

const selectablePlayers = computed(() =>
  players.value.filter((player) => Boolean(player.id) && !player.chatGroup)
)

const selectedPlayerCount = computed(
  () => selectedPlayersStatus.value.filter(Boolean).length
)

const canStartGroup = computed(
  () =>
    session.groupChats.length < players.value.length &&
    selectablePlayers.value.length >= 2
)

const canSubmitSelection = computed(() =>
  addingGroup.value
    ? selectedPlayerCount.value >= 1
    : selectedPlayerCount.value >= 2
)

const activeGroup = computed(() =>
  session.groupChats.find((group) => group.id === addingGroup.value)
)

const selectionTitle = computed(() =>
  addingGroup.value ? '向分组添加成员' : '创建本地私聊分组'
)

const selectionHint = computed(() => {
  if (addingGroup.value && activeGroup.value) {
    return '为“' + (activeGroup.value.name || '当前分组') + '”选择新成员。'
  }
  return '至少选择两名尚未加入其他私聊分组的玩家。'
})

function clearActionError() {
  actionError.value = ''
}

function reportLocalError(error, fallback) {
  const detail = error instanceof Error ? error.message.trim() : ''
  const message = detail ? fallback + '：' + detail : fallback
  actionError.value = message

  if (typeof window !== 'undefined') {
    window.$toast?.error(message)
  }
}

function runLocalAction(action, fallback) {
  clearActionError()
  try {
    action()
    return true
  } catch (error) {
    reportLocalError(error, fallback)
    return false
  }
}

function getPlayerSeat(player) {
  const index = players.value.indexOf(player)
  return index >= 0 ? index + 1 : '—'
}

function getGroupTitle(group, index) {
  return group.name?.trim() || '私聊分组 ' + (index + 1)
}

function requestGroupChat(chatId = null) {
  adding.value = true
  addingGroup.value = chatId
  selectedPlayersStatus.value = []
  warningMessage.value = ''
  clearActionError()
}

function cancelGroupChat() {
  adding.value = false
  addingGroup.value = null
  selectedPlayersStatus.value = []
  warningMessage.value = ''
}

function addGroupChat() {
  let chatId = addingGroup.value
  const newGroupMembers = []

  selectablePlayers.value.forEach((player, index) => {
    if (selectedPlayersStatus.value[index]) {
      newGroupMembers.push(player)
    }
  })

  if (!chatId && newGroupMembers.length < 2) {
    warningMessage.value = '请选择至少两名玩家。'
    return
  }

  if (chatId && newGroupMembers.length < 1) {
    warningMessage.value = '请至少选择一名要添加的玩家。'
    return
  }

  if (!chatId) {
    chatId = Math.random().toString(36).slice(2)
    while (session.groupChats.some((group) => group.id === chatId)) {
      chatId = Math.random().toString(36).slice(2)
    }
  }

  const succeeded = runLocalAction(
    () => sessionStore.addGroupChat({ chatId, players: newGroupMembers }),
    addingGroup.value ? '添加分组成员失败' : '创建本地私聊分组失败'
  )

  if (succeeded) {
    cancelGroupChat()
  }
}

function removeGroupChat(chatId) {
  runLocalAction(
    () => sessionStore.removeGroupChat({ chatId }),
    '移除本地私聊分组失败'
  )
}

function removeGroupChatMember(chatId, player) {
  const index = session.groupChats.findIndex((group) => group.id === chatId)
  if (index === -1) return

  const group = session.groupChats[index]
  runLocalAction(() => {
    if (
      group.players.length <= 1 ||
      (group.players.length === 2 && !group.keep)
    ) {
      sessionStore.removeGroupChat({ chatId })
    } else {
      sessionStore.removeGroupChatMember({ chatId, player })
    }
  }, '移除分组成员失败')
}

function toggleGroupKeep(chatId) {
  runLocalAction(
    () => sessionStore.toggleGroupKeep(chatId),
    '更新分组保留设置失败'
  )
}

function close() {
  cancelGroupChat()
  clearActionError()
  appStore.toggleModal('groupChat')
}
</script>

<style scoped lang="scss">
:deep(.modal.group-chat) {
  width: min(940px, 100%);
}

:deep(.modal.group-chat > .slot) {
  padding: var(--ts-space-5, 24px);
}

.group-chat-panel {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ts-space-4, 16px);
  color: var(--ts-text-primary, #f4ebdd);
}

.sync-notice,
.action-error {
  min-height: 58px;
  padding: 10px 12px;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: center;
  gap: 11px;
  border: 1px solid rgba(214, 184, 106, 0.32);
  border-radius: var(--ts-radius-md, 10px);
  background:
    linear-gradient(90deg, rgba(126, 80, 33, 0.2), transparent 70%),
    rgba(13, 9, 12, 0.56);
}

.sync-notice--api {
  border-color: rgba(188, 66, 76, 0.48);
  background:
    linear-gradient(90deg, rgba(132, 35, 44, 0.27), transparent 74%),
    rgba(13, 9, 12, 0.62);
}

.sync-notice__icon {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(214, 184, 106, 0.34);
  border-radius: 50%;
  color: var(--ts-accent-gold-hover, #e7cf86);
  background: rgba(35, 22, 19, 0.82);
}

.sync-notice__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;

  strong {
    color: #f4dfae;
    font-size: 0.84rem;
  }

  > span {
    color: var(--ts-text-muted, #c9bca7);
    font-size: 0.74rem;
    line-height: 1.45;
  }
}

.action-error {
  min-height: 48px;
  grid-template-columns: auto minmax(0, 1fr) 44px;
  border-color: rgba(190, 63, 74, 0.58);
  color: #ffd8d9;
  background: rgba(91, 28, 35, 0.42);
  font-size: 0.8rem;

  > svg {
    color: #ef9299;
  }

  button {
    width: 44px;
    height: 44px;
    padding: 0;
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

.group-toolbar,
.selection-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;

  h3 {
    margin: 3px 0 0;
    color: #f5e8cf;
    font-family: var(--ts-font-heading, serif);
    font-size: 1.1rem;
  }

  p {
    margin: 4px 0 0;
    color: var(--ts-text-subtle, #9d907f);
    font-size: 0.72rem;
  }
}

.section-kicker {
  color: var(--ts-accent-gold, #d6b86a);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}

.panel-button {
  min-width: 44px;
  min-height: 44px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid rgba(214, 184, 106, 0.34);
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
  touch-action: manipulation;
  transition:
    color var(--ts-motion-fast, 160ms) ease,
    border-color var(--ts-motion-fast, 160ms) ease,
    transform var(--ts-motion-fast, 160ms) ease;

  &:hover:not(:disabled) {
    color: #fff5e3;
    border-color: rgba(231, 207, 134, 0.72);
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 3px solid var(--ts-focus-ring, #f0d990);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.42;
    transform: none;
  }

  &--primary {
    border-color: rgba(214, 184, 106, 0.56);
    color: #fff0c6;
    background: linear-gradient(
      180deg,
      rgba(132, 87, 36, 0.94),
      rgba(72, 42, 24, 0.98)
    );
  }

  &--danger {
    border-color: rgba(179, 61, 72, 0.56);
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
  }
}

.groups-list {
  max-height: min(460px, 48dvh);
  padding: 2px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 12px;
  overflow: hidden auto;
  scrollbar-color: var(--ts-border-strong, #8f7443) transparent;
  scrollbar-width: thin;
}

.group-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--ts-border-subtle, rgba(214, 184, 106, 0.22));
  border-radius: var(--ts-radius-md, 10px);
  background:
    linear-gradient(180deg, rgba(214, 184, 106, 0.045), transparent 64px),
    rgba(12, 9, 14, 0.62);
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.025);

  &--editing {
    border-color: rgba(214, 184, 106, 0.64);
    box-shadow:
      0 0 0 3px rgba(214, 184, 106, 0.1),
      inset 3px 0 0 var(--ts-accent-crimson, #8e2f36);
  }
}

.group-card__header {
  min-height: 70px;
  padding: 11px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 9px;
  border-bottom: 1px solid rgba(214, 184, 106, 0.16);
}

.group-card__identity {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 3px 7px;

  h4 {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    color: #f3e5cd;
    font-family: var(--ts-font-heading, serif);
    font-size: 0.94rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  > span:last-child {
    grid-column: 2;
    color: var(--ts-text-subtle, #9d907f);
    font-size: 0.66rem;
  }
}

.local-badge {
  min-height: 22px;
  padding: 0 7px;
  display: inline-flex;
  align-items: center;
  border: 1px solid rgba(214, 184, 106, 0.34);
  border-radius: var(--ts-radius-pill, 999px);
  color: var(--ts-accent-gold, #d6b86a);
  background: rgba(76, 48, 34, 0.38);
  font-size: 0.6rem;
  font-weight: 800;
}

.group-card__actions {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
}

.group-members {
  min-height: 68px;
  padding: 10px;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 7px;
}

.member-chip {
  min-width: 0;
  min-height: 44px;
  max-width: 100%;
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) 44px;
  align-items: center;
  border: 1px solid rgba(214, 184, 106, 0.23);
  border-radius: var(--ts-radius-pill, 999px);
  color: #e9dcc6;
  background: rgba(43, 28, 24, 0.72);
  font-size: 0.75rem;

  button {
    width: 44px;
    height: 44px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    color: #dca2a7;
    background: transparent;
    cursor: pointer;

    &:hover:not(:disabled) {
      color: white;
      background: rgba(142, 47, 54, 0.42);
    }

    &:focus-visible {
      outline: 3px solid var(--ts-focus-ring, #f0d990);
      outline-offset: 1px;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.4;
    }
  }
}

.seat-mark {
  width: 26px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  justify-self: center;
  border: 1px solid rgba(214, 184, 106, 0.4);
  border-radius: 50%;
  color: #f5dda4;
  background: #2b1815;
  font-size: 0.66rem;
  font-weight: 800;
}

.member-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-empty {
  min-height: 68px;
  margin: 0;
  padding: 22px 12px;
  color: var(--ts-text-subtle, #9d907f);
  font-size: 0.74rem;
  text-align: center;
}

.group-card__footer {
  border-top: 1px solid rgba(214, 184, 106, 0.14);
}

.keep-toggle {
  min-height: 58px;
  padding: 8px 10px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  cursor: pointer;

  input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  &:has(input:focus-visible) {
    outline: 3px solid var(--ts-focus-ring, #f0d990);
    outline-offset: -3px;
  }

  &:has(input:disabled) {
    cursor: not-allowed;
    opacity: 0.46;
  }
}

.keep-toggle__control {
  position: relative;
  width: 42px;
  height: 24px;
  border: 1px solid rgba(214, 184, 106, 0.28);
  border-radius: var(--ts-radius-pill, 999px);
  background: rgba(61, 49, 45, 0.74);
  transition: background-color var(--ts-motion-fast, 160ms) ease;

  &::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #a99c88;
    transition:
      background-color var(--ts-motion-fast, 160ms) ease,
      transform var(--ts-motion-fast, 160ms) ease;
  }
}

.keep-toggle input:checked + .keep-toggle__control {
  background: rgba(125, 73, 34, 0.88);

  &::after {
    background: #ffe2a2;
    transform: translateX(18px);
  }
}

.keep-toggle__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;

  strong {
    color: #e9dcc6;
    font-size: 0.74rem;
  }

  span {
    color: var(--ts-text-subtle, #9d907f);
    font-size: 0.63rem;
    line-height: 1.35;
  }
}

.empty-state {
  min-height: 250px;
  padding: 28px 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 9px;
  border: 1px dashed rgba(214, 184, 106, 0.28);
  border-radius: var(--ts-radius-md, 10px);
  color: var(--ts-text-muted, #c9bca7);
  text-align: center;
  background: rgba(12, 9, 14, 0.34);

  h3 {
    margin: 4px 0 0;
    color: #f0e2cb;
    font-family: var(--ts-font-heading, serif);
  }

  p {
    max-width: 42ch;
    margin: 0 0 8px;
    color: var(--ts-text-subtle, #9d907f);
    font-size: 0.76rem;
    line-height: 1.5;
  }
}

.empty-state__seal {
  width: 60px;
  height: 60px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(214, 184, 106, 0.4);
  border-radius: 50%;
  color: var(--ts-accent-gold, #d6b86a);
  background:
    radial-gradient(
      circle at 35% 28%,
      rgba(255, 236, 183, 0.14),
      transparent 38%
    ),
    #281715;
  box-shadow: inset 0 0 0 5px rgba(11, 7, 9, 0.54);
}

.selection-panel {
  overflow: hidden;
  border: 1px solid rgba(214, 184, 106, 0.48);
  border-radius: var(--ts-radius-md, 10px);
  background:
    linear-gradient(115deg, rgba(122, 32, 40, 0.12), transparent 44%),
    rgba(13, 9, 13, 0.88);
  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.28);
}

.selection-panel__header {
  min-height: 72px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(214, 184, 106, 0.18);
}

.player-options {
  max-height: min(310px, 34dvh);
  padding: 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  overflow: hidden auto;
}

.player-option {
  min-width: 0;
  min-height: 58px;
  padding: 7px 10px;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 9px;
  border: 1px solid rgba(214, 184, 106, 0.2);
  border-radius: var(--ts-radius-md, 10px);
  background: rgba(39, 25, 22, 0.46);
  cursor: pointer;
  transition:
    border-color var(--ts-motion-fast, 160ms) ease,
    background-color var(--ts-motion-fast, 160ms) ease;

  input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  &:hover {
    border-color: rgba(214, 184, 106, 0.44);
    background: rgba(78, 41, 36, 0.46);
  }

  &:has(input:checked) {
    border-color: rgba(214, 184, 106, 0.68);
    background:
      linear-gradient(90deg, rgba(132, 35, 44, 0.2), transparent),
      rgba(52, 31, 26, 0.68);
  }

  &:has(input:focus-visible) {
    outline: 3px solid var(--ts-focus-ring, #f0d990);
    outline-offset: 2px;
  }
}

.player-option__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: #f0e3cd;
    font-size: 0.8rem;
  }

  span {
    color: var(--ts-text-subtle, #9d907f);
    font-size: 0.62rem;
  }
}

.player-option__check {
  justify-self: end;
  color: var(--ts-accent-gold, #d6b86a);
}

.selection-empty,
.selection-warning {
  margin: 10px;
  padding: 13px;
  border-radius: var(--ts-radius-md, 10px);
  font-size: 0.76rem;
  line-height: 1.45;
}

.selection-empty {
  color: var(--ts-text-muted, #c9bca7);
  background: rgba(255, 255, 255, 0.035);
  text-align: center;
}

.selection-warning {
  border: 1px solid rgba(190, 63, 74, 0.48);
  color: #f2b8bd;
  background: rgba(126, 39, 47, 0.18);
}

.selection-panel__footer {
  min-height: 68px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid rgba(214, 184, 106, 0.18);

  > span {
    color: var(--ts-text-muted, #c9bca7);
    font-size: 0.72rem;
  }

  > div {
    display: flex;
    gap: 8px;
  }
}

@media (max-width: 700px) {
  :deep(.modal.group-chat > .slot) {
    padding: var(--ts-space-4, 16px);
  }

  .groups-list,
  .player-options {
    grid-template-columns: minmax(0, 1fr);
  }

  .groups-list {
    max-height: min(430px, 45dvh);
  }
}

@media (max-width: 480px) {
  .group-toolbar {
    align-items: stretch;
    flex-direction: column;

    > .panel-button {
      width: 100%;
    }
  }

  .group-card__header {
    align-items: stretch;
    flex-direction: column;
  }

  .group-card__actions {
    justify-content: flex-end;

    .panel-button {
      flex: 1 1 auto;
      width: auto;
    }
  }

  .selection-panel__footer {
    align-items: stretch;
    flex-direction: column;

    > div {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
}

@media (max-height: 620px) {
  .groups-list {
    max-height: 220px;
  }

  .player-options {
    max-height: 180px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .panel-button,
  .keep-toggle__control,
  .keep-toggle__control::after,
  .player-option {
    transition-duration: 0.01ms !important;
  }
}
</style>

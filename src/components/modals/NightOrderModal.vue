<template>
  <Modal
    name="night-order"
    class="night-reference"
    :style="messagePickerOpen ? { display: 'none' } : undefined"
    title="阶段与夜间顺序"
    :description="nightOrderDescription"
    return-focus="#game-phase-tool"
    @close="toggleModal('nightOrder')"
    v-if="modals.nightOrder"
  >
    <GameTableFlowControls visible />

    <div class="night-order-toolbar">
      <span class="night-order-toolbar__hint">
        <font-awesome-icon icon="cloud-moon" aria-hidden="true" />
        按照编号依次唤醒角色
      </span>
      <div
        v-if="canManageNight"
        class="night-progress"
        role="status"
        aria-live="polite"
      >
        <span>{{ nightProgressLabel }}</span>
        <span
          class="night-progress__track"
          role="progressbar"
          aria-label="当前夜晚处理进度"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="nightProgressPercent"
        >
          <span :style="{ width: `${nightProgressPercent}%` }"></span>
        </span>
      </div>
    </div>

    <NightMessageComposer class="night-order-composer"
      v-if="messageComposerTarget"
      :key="messageComposerTarget.player.id"
      :player-name="messageComposerTarget.player.name || '玩家'"
      :candidates="nightActionCandidates"
      :roles="nightMessageRoles"
      :phrases="nightMessagePhrases"
      :player-label="playerLabel"
      :role-label="roleLabel"
      :disabled="Boolean(pendingActionId) || !gameController.isConnected"
      @cancel="messageComposerTarget = null"
      @picker-open="messagePickerOpen = $event"
      @send="sendNightMessage"
    />

    <div class="night-order-grid">
      <section
        class="night-order-section"
        :class="{ 'is-current': currentNightSection === 'first' }"
        aria-labelledby="first-night-title"
      >
        <header class="night-order-section__header">
          <div>
            <span class="night-order-section__mark" aria-hidden="true"></span>
            <h3 id="first-night-title">首夜</h3>
          </div>
          <div class="night-order-section__meta">
            <span v-if="currentNightSection === 'first'" class="night-order-section__current">当前</span>
            <span class="night-order-section__count">{{ rolesFirstNight.length }} 项</span>
          </div>
        </header>
        <ol class="night-order-list">
          <li
            v-for="(role, index) in rolesFirstNight"
            :key="role.alias || role.id || role.name"
            class="night-order-item"
            :class="[
              role.team,
              {
                'is-workbench': canManageNight && currentNightSection === 'first',
                'is-complete': currentNightSection === 'first' && isNightActionComplete(role),
              },
            ]"
          >
            <span class="night-order-item__number" aria-hidden="true">{{
              index + 1
            }}</span>
            <RoleIcon
              v-if="role.id"
              class="night-order-item__icon"
              :role="role"
              :is-image-opt-in="grimoire.isImageOptIn"
              aria-hidden="true"
            />
            <span class="night-order-item__copy">
              <strong>{{ role.name }}</strong>
              <small
                v-if="canManageNight && currentNightSection === 'first' && nightReminder(role, 'first')"
                class="night-order-item__reminder"
              >
                {{ nightReminder(role, 'first') }}
              </small>
              <span
                class="player night-order-item__players"
                v-if="role.players.length && !grimoire.isPublic"
              >
                <template v-if="canManageNight && currentNightSection === 'first'">
                  <button
                    v-for="(player, index) in role.players"
                    :class="{ dead: player.isDead }"
                    :key="player.id || index"
                    type="button"
                    :disabled="Boolean(pendingActionId) || !gameController.isConnected"
                    :data-testid="`night-message-${nightActionId(role)}-${player.id}`"
                    :aria-label="`向 ${player.name || `第 ${index + 1} 位玩家`} 发送私密夜间提示`"
                    @click="sendPrivatePrompt(role, player, 'first')"
                  >
                    <span>{{ player.name || `玩家 ${index + 1}` }}</span>
                    <font-awesome-icon icon="paper-plane" aria-hidden="true" />
                  </button>
                </template>
                <template v-else>
                  <small
                    v-for="(player, index) in role.players"
                    :class="{ dead: player.isDead }"
                    :key="player.id || index"
                  >
                    {{ player.name }}<template v-if="role.players.length > index + 1">、</template>
                  </small>
                </template>
              </span>
              <NightActionEditor
                v-if="canManageNight && currentNightSection === 'first'"
                :action-id="nightActionId(role)"
                :role-name="role.name"
                :candidates="nightActionCandidates"
                :record="nightActionRecord(role)"
                :max-targets="nightActionTargetLimit(role)"
                :excluded-user-ids="nightActionExcludedUserIds(role)"
                :suggested-effect="nightActionSuggestedEffect(role)"
                :disabled="Boolean(pendingActionId) || !gameController.isConnected"
                :save-record="(payload) => saveNightActionRecord(role, payload)"
                :resolve-record="(effects) => resolveNightActionRecord(role, effects)"
              />
            </span>
            <button
              v-if="canManageNight && currentNightSection === 'first'"
              type="button"
              class="night-action-toggle"
              :class="{ 'is-complete': isNightActionComplete(role) }"
              :aria-pressed="isNightActionComplete(role)"
              :disabled="Boolean(pendingActionId) || !gameController.isConnected"
              :data-testid="`night-action-${nightActionId(role)}`"
              @click="toggleNightAction(role)"
            >
              <font-awesome-icon
                :icon="pendingActionId === nightActionId(role) ? 'spinner' : 'check'"
                :spin="pendingActionId === nightActionId(role)"
                aria-hidden="true"
              />
              <span>{{ isNightActionComplete(role) ? '已完成' : '标记完成' }}</span>
            </button>
          </li>
          <li v-if="rolesFirstNight.length === 0" class="night-order-empty">
            本剧本没有首夜行动角色
          </li>
        </ol>
      </section>

      <section
        class="night-order-section"
        :class="{ 'is-current': currentNightSection === 'other' }"
        aria-labelledby="other-night-title"
      >
        <header class="night-order-section__header">
          <div>
            <span class="night-order-section__mark" aria-hidden="true"></span>
            <h3 id="other-night-title">其他夜</h3>
          </div>
          <div class="night-order-section__meta">
            <span v-if="currentNightSection === 'other'" class="night-order-section__current">当前</span>
            <span class="night-order-section__count">{{ rolesOtherNight.length }} 项</span>
          </div>
        </header>
        <ol class="night-order-list">
          <li
            v-for="(role, index) in rolesOtherNight"
            :key="role.alias || role.id || role.name"
            class="night-order-item"
            :class="[
              role.team,
              {
                'is-workbench': canManageNight && currentNightSection === 'other',
                'is-complete': currentNightSection === 'other' && isNightActionComplete(role),
              },
            ]"
          >
            <span class="night-order-item__number" aria-hidden="true">{{
              index + 1
            }}</span>
            <RoleIcon
              v-if="role.id"
              class="night-order-item__icon"
              :role="role"
              :is-image-opt-in="grimoire.isImageOptIn"
              aria-hidden="true"
            />
            <span class="night-order-item__copy">
              <strong>{{ role.name }}</strong>
              <small
                v-if="canManageNight && currentNightSection === 'other' && nightReminder(role, 'other')"
                class="night-order-item__reminder"
              >
                {{ nightReminder(role, 'other') }}
              </small>
              <span
                class="player night-order-item__players"
                v-if="role.players.length && !grimoire.isPublic"
              >
                <template v-if="canManageNight && currentNightSection === 'other'">
                  <button
                    v-for="(player, index) in role.players"
                    :class="{ dead: player.isDead }"
                    :key="player.id || index"
                    type="button"
                    :disabled="Boolean(pendingActionId) || !gameController.isConnected"
                    :data-testid="`night-message-${nightActionId(role)}-${player.id}`"
                    :aria-label="`向 ${player.name || `第 ${index + 1} 位玩家`} 发送私密夜间提示`"
                    @click="sendPrivatePrompt(role, player, 'other')"
                  >
                    <span>{{ player.name || `玩家 ${index + 1}` }}</span>
                    <font-awesome-icon icon="paper-plane" aria-hidden="true" />
                  </button>
                </template>
                <template v-else>
                  <small
                    v-for="(player, index) in role.players"
                    :class="{ dead: player.isDead }"
                    :key="player.id || index"
                  >
                    {{ player.name }}<template v-if="role.players.length > index + 1">、</template>
                  </small>
                </template>
              </span>
              <NightActionEditor
                v-if="canManageNight && currentNightSection === 'other'"
                :action-id="nightActionId(role)"
                :role-name="role.name"
                :candidates="nightActionCandidates"
                :record="nightActionRecord(role)"
                :max-targets="nightActionTargetLimit(role)"
                :excluded-user-ids="nightActionExcludedUserIds(role)"
                :suggested-effect="nightActionSuggestedEffect(role)"
                :disabled="Boolean(pendingActionId) || !gameController.isConnected"
                :save-record="(payload) => saveNightActionRecord(role, payload)"
                :resolve-record="(effects) => resolveNightActionRecord(role, effects)"
              />
            </span>
            <button
              v-if="canManageNight && currentNightSection === 'other'"
              type="button"
              class="night-action-toggle"
              :class="{ 'is-complete': isNightActionComplete(role) }"
              :aria-pressed="isNightActionComplete(role)"
              :disabled="Boolean(pendingActionId) || !gameController.isConnected"
              :data-testid="`night-action-${nightActionId(role)}`"
              @click="toggleNightAction(role)"
            >
              <font-awesome-icon
                :icon="pendingActionId === nightActionId(role) ? 'spinner' : 'check'"
                :spin="pendingActionId === nightActionId(role)"
                aria-hidden="true"
              />
              <span>{{ isNightActionComplete(role) ? '已完成' : '标记完成' }}</span>
            </button>
          </li>
          <li v-if="rolesOtherNight.length === 0" class="night-order-empty">
            本剧本没有其他夜行动角色
          </li>
        </ol>
      </section>
    </div>
  </Modal>
</template>

<script setup lang="js">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useNightOrderRoles } from '@/composables/useNightOrderRoles'
import { useGameController } from '@/controllers/GameController'
import { useAppStore } from '@/stores/app'
import { useGameStore } from '@/stores/game'
import { useGameScriptStore } from '@/stores/gameScript'
import { usePlayersStore } from '@/stores/players'
import GameTableFlowControls from '@/components/GameTableFlowControls.vue'
import NightActionEditor from '@/components/NightActionEditor.vue'
import NightMessageComposer from '@/components/NightMessageComposer.vue'
import { SocketClientEvent } from '@/types/socket'
import Modal from './Modal'
import RoleIcon from '@/components/RoleIcon.vue'

const appStore = useAppStore()
const gameStore = useGameStore()
const gameScriptStore = useGameScriptStore()
const playersStore = usePlayersStore()
const gameController = useGameController()
const { modals, edition, grimoire } = storeToRefs(appStore)
const { players } = storeToRefs(playersStore)
const {
  isApiRoom,
  currentNightSection,
  rolesFirstNight,
  rolesOtherNight,
} = useNightOrderRoles()
const pendingActionId = ref('')
const messageComposerTarget = ref(null)
const messagePickerOpen = ref(false)
const DEFAULT_CUSTOM_TARGET_LIMIT = 3
const nightActionTargetLimits = new Map([
  ['washerwoman', 2],
  ['librarian', 2],
  ['investigator', 2],
  ['chef', 0],
  ['empath', 0],
  ['fortuneteller', 2],
  ['undertaker', 1],
  ['monk', 1],
  ['ravenkeeper', 1],
  ['butler', 1],
  ['poisoner', 1],
  ['spy', 0],
  ['scarletwoman', 0],
  ['imp', 1],
])
const nightActionExcludeActorRoleIds = new Set(['monk', 'butler'])
const nightActionSuggestedEffects = new Map([
  ['poisoner', 'poisoned'],
  ['monk', 'protected'],
  ['imp', 'dead'],
])

const nightOrderDescription = computed(() => {
  const scriptName = isApiRoom.value
    ? gameScriptStore.title || '尚未选择剧本'
    : edition.value.name || '自定义剧本'
  return `当前剧本：${scriptName}`
})
const canManageNight = computed(() => (
  isApiRoom.value
  && gameStore.currentIsDm
  && gameStore.level === 'night'
))
const completedNightActionIds = computed(() => {
  const progress = gameStore.nightActionProgress
  if (!progress || progress.levelDays !== gameStore.levelDays) return new Set()
  return new Set(progress.completedActionIds)
})
const nightActionRecordsById = computed(() => {
  const progress = gameStore.nightActionProgress
  if (!progress || progress.levelDays !== gameStore.levelDays) return new Map()
  return new Map((progress.actionRecords ?? []).map((record) => [record.actionId, record]))
})
const nightActionCandidates = computed(() => players.value
  .filter((player) => {
    const state = gameStore.players[player.id]
    return Boolean(player.id && Number(player.seat) > 0 && state && !state.isDM)
  })
  .map((player) => {
    const state = gameStore.players[player.id]
    return {
      id: player.id,
      name: player.name || `第 ${Number(player.seat)} 席玩家`,
      seat: Number(player.seat),
      isDead: Boolean(player.isDead),
      connected: Boolean(state?.connected),
    }
  })
  .sort((left, right) => left.seat - right.seat))
const nightMessageRoles = computed(() => gameScriptStore.characters
  .filter((role) => role.id && role.name)
  .map((role) => ({ ...role, id: role.id, name: role.name })))
const nightMessagePhrases = [
  '你得知',
  '你的信息是',
  '请确认你的选择',
  '今晚无需行动',
]

function playerLabel(userId) {
  const player = players.value.find((item) => item.id === userId)
  return player?.name || userId
}

function roleLabel(roleId) {
  return nightMessageRoles.value.find((role) => role.id === roleId)?.name || roleId
}

const currentNightRoles = computed(() => (
  currentNightSection.value === 'first'
    ? rolesFirstNight.value
    : currentNightSection.value === 'other'
      ? rolesOtherNight.value
      : []
))
const completedNightActionCount = computed(() => currentNightRoles.value
  .filter((role) => completedNightActionIds.value.has(nightActionId(role)))
  .length)
const nightProgressPercent = computed(() => currentNightRoles.value.length > 0
  ? Math.round((completedNightActionCount.value / currentNightRoles.value.length) * 100)
  : 0)
const nightProgressLabel = computed(() => currentNightRoles.value.length > 0
  ? `已完成 ${completedNightActionCount.value} / ${currentNightRoles.value.length}`
  : '当前夜晚没有待处理角色')

function nightActionId(role) {
  if (role.alias === 'minioninfo') return 'system:minion-info'
  if (role.alias === 'demoninfo') return 'system:demon-info'
  return `character:${role.id}`
}

function isNightActionComplete(role) {
  return completedNightActionIds.value.has(nightActionId(role))
}

function nightActionRecord(role) {
  return nightActionRecordsById.value.get(nightActionId(role)) || null
}

function nightActionTargetLimit(role) {
  if (role.alias || !role.id || role.id === 'evil') return 0
  return nightActionTargetLimits.get(role.id) ?? DEFAULT_CUSTOM_TARGET_LIMIT
}

function nightActionExcludedUserIds(role) {
  if (!nightActionExcludeActorRoleIds.has(role.id)) return []
  return role.players.map((player) => player.id).filter(Boolean)
}

function nightActionSuggestedEffect(role) {
  return nightActionSuggestedEffects.get(role.id) ?? null
}

function nightReminder(role, section) {
  return section === 'first'
    ? role.firstNightReminder || role.ability || ''
    : role.otherNightReminder || role.ability || ''
}

async function toggleNightAction(role) {
  if (!canManageNight.value || pendingActionId.value || !gameController.isConnected) return
  const actionId = nightActionId(role)
  const completed = !isNightActionComplete(role)
  pendingActionId.value = actionId
  try {
    const response = await gameController.updateNightAction({
      levelDays: gameStore.levelDays,
      actionId,
      completed,
    })
    if (response.data) gameStore.applyNightActionProgress(response.data)
  } catch (error) {
    window.$toast.error(
      error instanceof Error ? error.message : '夜间处理进度同步失败',
    )
  } finally {
    pendingActionId.value = ''
  }
}

async function saveNightActionRecord(role, payload) {
  if (!canManageNight.value || pendingActionId.value || !gameController.isConnected) return false
  const actionId = nightActionId(role)
  pendingActionId.value = `record:${actionId}`
  try {
    const response = await gameController.updateNightAction({
      levelDays: gameStore.levelDays,
      actionId,
      targetUserIds: payload.targetUserIds,
      result: payload.result,
    })
    if (response.data) gameStore.applyNightActionProgress(response.data)
    window.$toast.success(`${role.name}的行动记录已保存。`)
    return true
  } catch (error) {
    window.$toast.error(
      error instanceof Error ? error.message : '夜间行动记录保存失败',
    )
    return false
  } finally {
    pendingActionId.value = ''
  }
}

async function resolveNightActionRecord(role, effects) {
  if (!canManageNight.value || pendingActionId.value || !gameController.isConnected) return false
  const actionId = nightActionId(role)
  pendingActionId.value = `resolution:${actionId}`
  try {
    const response = await gameController.updateNightAction({
      levelDays: gameStore.levelDays,
      actionId,
      resolution: { effects },
    })
    if (response.data) gameStore.applyNightActionProgress(response.data)
    const effectLabel = effects[0]?.type === 'dead'
      ? '死亡'
      : effects[0]?.type === 'protected'
        ? '保护'
        : '中毒'
    window.$toast.success(`${role.name}的${effectLabel}影响已结算。`)
    return true
  } catch (error) {
    window.$toast.error(
      error instanceof Error ? error.message : '夜间影响结算失败',
    )
    return false
  } finally {
    pendingActionId.value = ''
  }
}

function sendPrivatePrompt(role, player, section) {
  if (
    !canManageNight.value
    || currentNightSection.value !== section
    || pendingActionId.value
    || !player?.id
  ) return
  messageComposerTarget.value = { role, player, section }
}

async function sendNightMessage(content) {
  const target = messageComposerTarget.value
  if (!target || !canManageNight.value || pendingActionId.value || !target.player?.id) return
  const playerName = target.player.name || `第 ${Number(target.player.seat) || '?'} 席玩家`
  pendingActionId.value = `message:${nightActionId(target.role)}:${target.player.id}`
  try {
    await gameController.request(SocketClientEvent.SendDMMessage, {
      playerUserId: target.player.id,
      channel: 'skill',
      content,
      context: {
        kind: 'night-info',
        levelDays: gameStore.levelDays,
        actionId: nightActionId(target.role),
        section: target.section,
      },
    })
    window.$toast.success(`已向 ${playerName} 发送夜间信息。`)
    messageComposerTarget.value = null
  } catch (error) {
    window.$toast.error(error instanceof Error ? error.message : '夜间信息发送失败。')
  } finally {
    pendingActionId.value = ''
  }
}

function toggleModal(name) {
  appStore.toggleModal(name)
}
</script>

<style lang="scss" scoped>
.night-order-composer { padding: 16px; margin-bottom: 16px; background: #101015; border: 1px solid #ffffff40; border-radius: 6px; }
:global(.modal-backdrop--night-order .modal) {
  width: min(1080px, 100%);
}

:global(.modal-backdrop--night-order .modal > .slot) {
  padding-top: var(--ts-space-4, 16px);
}

.night-order-toolbar {
  min-height: 48px;
  margin-bottom: var(--ts-space-4, 16px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ts-space-3, 12px);
}

.night-order-toolbar__hint {
  display: inline-flex;
  align-items: center;
  gap: var(--ts-space-2, 8px);
  color: var(--ts-text-muted, #c9bca7);
  font-size: 0.9rem;
  line-height: 1.4;

  svg {
    color: var(--ts-accent-gold, #d6b86a);
  }
}

.night-order-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ts-space-4, 16px);
  align-items: start;
}

.night-order-section {
  min-width: 0;
  overflow: hidden;
  background:
    linear-gradient(145deg, rgba(33, 24, 43, 0.96), rgba(11, 9, 16, 0.96)),
    var(--ts-noise-stone);
  border: 1px solid var(--ts-border-subtle, rgba(214, 184, 106, 0.22));
  border-radius: var(--ts-radius-md, 10px);
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.04);

  &.is-current {
    border-color: rgba(231, 207, 134, 0.72);
    box-shadow:
      inset 0 1px rgba(255, 255, 255, 0.04),
      var(--ts-shadow-gold-ring, 0 0 0 2px rgba(214, 184, 106, 0.12)),
      0 0 20px var(--ts-glow-candle-soft, rgba(247, 208, 120, 0.16));
  }
}

.night-order-section__header {
  min-height: 54px;
  padding: 8px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ts-space-3, 12px);
  color: var(--ts-text-on-parchment, #2a1b18);
  background:
    linear-gradient(90deg, rgba(142, 47, 54, 0.11), transparent 58%),
    var(--ts-noise-parchment), var(--ts-surface-parchment-aged, #d7c29c);
  border-bottom: 1px solid rgba(42, 27, 24, 0.34);

  > div {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--ts-space-2, 8px);
  }

  h3 {
    margin: 0;
    font-family: var(--ts-font-heading, serif);
    font-size: 1.1rem;
    line-height: 1.2;
  }
}

.night-order-section__mark {
  width: 10px;
  height: 10px;
  flex: 0 0 auto;
  background: var(--ts-accent-crimson, #8e2f36);
  border: 1px solid #4d151b;
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(142, 47, 54, 0.55);
}

.night-order-section__count {
  flex: 0 0 auto;
  padding: 4px 9px;
  background: rgba(255, 255, 255, 0.28);
  border: 1px solid rgba(42, 27, 24, 0.25);
  border-radius: var(--ts-radius-pill, 999px);
  font-size: 0.8rem;
  font-weight: 800;
}

.night-order-section.is-current {
  order: -1;
}

.night-progress {
  min-width: min(220px, 100%);
  display: grid;
  gap: 5px;
  color: var(--ts-text-primary, #f4ebdd);
  font-size: 0.82rem;
  font-weight: 800;
}

.night-progress__track {
  width: 100%;
  height: 8px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(214, 184, 106, 0.24);
  border-radius: var(--ts-radius-pill, 999px);

  > span {
    height: 100%;
    display: block;
    background: linear-gradient(90deg, #4f9c6c, var(--ts-success, #8fe3b0));
    border-radius: inherit;
    transition: width var(--ts-motion-fast, 160ms) var(--ts-ease-out, ease-out);
  }
}

.night-order-section__meta {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: var(--ts-space-2, 8px);
}

.night-order-section__current {
  padding: 4px 8px;
  color: #fff7df;
  background: var(--ts-accent-crimson, #8e2f36);
  border-radius: var(--ts-radius-pill, 999px);
  font-size: 0.74rem;
  font-weight: 900;
}

.night-order-list {
  margin: 0;
  padding: var(--ts-space-3, 12px);
  display: grid;
  gap: var(--ts-space-2, 8px);
  list-style: none;
}

.night-order-item {
  --night-team-color: var(--ts-accent-gold, #d6b86a);
  min-width: 0;
  min-height: 66px;
  padding: 7px 10px 7px 8px;
  display: grid;
  grid-template-columns: 30px 52px minmax(0, 1fr);
  align-items: center;
  gap: var(--ts-space-2, 8px);
  color: var(--ts-text-on-parchment, #2a1b18);
  background:
    linear-gradient(90deg, rgba(142, 47, 54, 0.06), transparent 52%),
    var(--ts-noise-parchment), var(--ts-surface-parchment, #f1e3c7);
  border: 1px solid rgba(143, 116, 67, 0.78);
  border-radius: var(--ts-radius-md, 10px);
  box-shadow:
    inset 4px 0 var(--night-team-color),
    0 4px 12px rgba(0, 0, 0, 0.18);

  &.is-workbench {
    grid-template-columns: 30px 52px minmax(0, 1fr) 112px;
  }

  &.is-complete {
    border-color: rgba(60, 128, 86, 0.78);
    box-shadow:
      inset 4px 0 var(--ts-success, #62b780),
      0 4px 12px rgba(0, 0, 0, 0.14);
  }

  &.townsfolk {
    --night-team-color: var(--ts-role-townsfolk, #6ea0ff);
  }
  &.outsider {
    --night-team-color: var(--ts-role-outsider, #6eddf7);
  }
  &.minion {
    --night-team-color: var(--ts-role-minion, #ff9658);
  }
  &.demon {
    --night-team-color: var(--ts-role-demon, #ff6b6b);
  }
  &.traveler {
    --night-team-color: var(--ts-role-traveler, #e38aff);
  }
  &.fabled {
    --night-team-color: var(--ts-role-fabled, #f4dc65);
  }
}

.night-order-item__number {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ts-text-primary, #f4ebdd);
  background: linear-gradient(
    180deg,
    var(--ts-accent-crimson-hover, #a63c45),
    var(--ts-focus-ring-on-parchment, #65242c)
  );
  border: 1px solid rgba(79, 22, 29, 0.7);
  border-radius: 50%;
  box-shadow:
    inset 0 1px rgba(255, 255, 255, 0.14),
    0 0 10px var(--ts-glow-crimson, rgba(166, 60, 69, 0.42));
  font-family: var(--ts-font-heading, serif);
  font-size: 0.82rem;
  font-weight: 800;
}

.night-order-item__icon {
  width: 52px;
  height: 52px;
  background-position: center;
  background-size: contain;
  filter: drop-shadow(0 2px 4px rgba(42, 27, 24, 0.28));
}

.night-order-item__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  line-height: 1.25;

  strong {
    overflow-wrap: anywhere;
    font-family: var(--ts-font-heading, serif);
    font-size: 1rem;
  }
}

.night-order-item__reminder {
  color: #6a5549;
  font-size: 0.78rem;
  line-height: 1.4;
}

.night-order-item__players {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: #655145;
  font-size: 0.82rem;
  line-height: 1.35;

  small {
    font-size: inherit;
  }

  button {
    min-height: 44px;
    max-width: 100%;
    padding: 6px 10px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: #513b33;
    background: rgba(255, 255, 255, 0.38);
    border: 1px solid rgba(109, 77, 59, 0.32);
    border-radius: var(--ts-radius-pill, 999px);
    cursor: pointer;
    font: inherit;
    font-weight: 800;
    touch-action: manipulation;

    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.68);
      border-color: rgba(109, 77, 59, 0.58);
    }

    &:focus-visible {
      outline: 3px solid var(--ts-focus-ring, #8e652d);
      outline-offset: 2px;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.52;
    }
  }

  .dead {
    color: #765d58;
    text-decoration: line-through;
  }
}

.night-action-toggle {
  min-height: 48px;
  padding: 7px 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: #5c292d;
  background: rgba(142, 47, 54, 0.08);
  border: 1px solid rgba(142, 47, 54, 0.38);
  border-radius: var(--ts-radius-md, 10px);
  cursor: pointer;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 900;
  touch-action: manipulation;

  &.is-complete {
    color: #27563a;
    background: rgba(66, 151, 103, 0.13);
    border-color: rgba(52, 125, 80, 0.52);
  }

  &:hover:not(:disabled) {
    background: rgba(142, 47, 54, 0.15);
  }

  &:focus-visible {
    outline: 3px solid var(--ts-focus-ring, #8e652d);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.52;
  }
}

.night-order-empty {
  min-height: 72px;
  padding: var(--ts-space-4, 16px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ts-text-muted, #c9bca7);
  border: 1px dashed var(--ts-border-subtle, rgba(214, 184, 106, 0.22));
  border-radius: var(--ts-radius-md, 10px);
  text-align: center;
}

@media (max-width: 900px) {
  .night-order-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .night-order-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .night-progress {
    width: 100%;
  }
}

@media (max-width: 420px) {
  .night-order-toolbar__hint {
    font-size: 0.84rem;
  }

  .night-order-list {
    padding: var(--ts-space-2, 8px);
  }

  .night-order-item {
    grid-template-columns: 28px 44px minmax(0, 1fr);
    min-height: 60px;
    padding-right: 8px;
  }

  .night-order-item.is-workbench {
    grid-template-columns: 28px 44px minmax(0, 1fr);
  }

  .night-action-toggle {
    grid-column: 2 / -1;
    width: 100%;
  }

  .night-order-item__icon {
    width: 44px;
    height: 44px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .night-progress__track > span {
    transition-duration: 0.01ms !important;
  }
}
</style>

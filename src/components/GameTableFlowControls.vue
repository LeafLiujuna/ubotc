<template>
  <section
    v-if="props.visible"
    class="phase-control-panel"
    :class="{ 'is-compact': props.compact }"
    :aria-labelledby="props.compact ? undefined : 'phase-control-title'"
    :aria-label="props.compact ? '阶段推进' : undefined"
  >
    <!-- 紧凑模式只保留推进按钮，完整卡片显示阶段与同步状态。 -->
    <template v-if="!props.compact">
      <header class="phase-control-panel__header">
        <div>
          <span>权威阶段</span>
          <strong id="phase-control-title">{{ currentPhaseLabel }}</strong>
        </div>
        <span class="phase-control-panel__status" :class="phaseStatusClass">
          {{ phaseStatusLabel }}
        </span>
      </header>

      <p class="phase-control-panel__guidance">{{ phaseGuidance }}</p>
    </template>

    <button
      v-if="canOfferPhaseAction"
      type="button"
      class="phase-control-panel__action"
      :class="{ 'is-pending': phaseChangePending }"
      :disabled="phaseChangePending || !phaseActionReady"
      @click="goNight"
    >
      <span>{{ phaseChangePending ? '等待服务器确认…' : phaseActionLabel }}</span>
      <small v-if="!phaseChangePending">切换后将同步所有玩家</small>
    </button>
    <p v-else class="phase-control-panel__notice" role="status">
      {{ phaseActionNotice }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { useDemoStore } from '@/stores/demo'
import { computed, ref } from 'vue'
import {
  buildReturnCue,
  usePhaseTransition,
} from '@/composables/usePhaseTransition'
import { SocketClientEvent } from '@/types/socket'
import { useGameController } from '@/controllers/GameController'
import { requestInputModal } from '@/services/inputModalService'
import { useAppStore } from '@/stores/app'
import { useGameStore } from '@/stores/game'
import { usePlayersStore } from '@/stores/players'
import { usePlayerViewStore } from '@/stores/playerView'
import { useSessionStore } from '@/stores/session'

const demo = useDemoStore()
const appStore = useAppStore()
const gameController = useGameController()
const gameStore = useGameStore()
const playersStore = usePlayersStore()
const session = useSessionStore()
const props = withDefaults(
  defineProps<{ visible?: boolean; compact?: boolean }>(),
  {
    visible: false,
    compact: false,
  }
)

const isApiRoom = computed(() =>
  Boolean(session.sessionId && session.gameServerId)
)
const claimedSeatVote = computed(() => {
  if (session.claimedSeat < 0) return 0
  return Number(session.votes[session.claimedSeat] || 0)
})
const phaseChangePending = ref(false)

const currentPhaseLabel = computed(() => {
  if (demo.active) return demo.level === 'prepare' ? '准备首夜' : demo.level === 'end' ? '终局揭晓' : `第 ${demo.levelDays} ${demo.level === 'night' ? '夜' : '天'}`
  if (!isApiRoom.value) return appStore.grimoire.isNight ? '夜晚阶段' : '白天阶段'
  if (gameStore.level === 'prepare') return '准备阶段'
  if (gameStore.level === 'night') return `第 ${Math.max(1, gameStore.levelDays)} 夜`
  if (gameStore.level === 'day') return `第 ${Math.max(1, gameStore.levelDays)} 天`
  if (gameStore.level === 'end') return '游戏已结束'
  return gameStore.level || '等待同步'
})
const nextApiLevel = computed<'day' | 'night'>(() => (
  gameStore.level === 'night' ? 'day' : 'night'
))
const nextApiDay = computed(() => gameStore.level === 'prepare'
  ? 1
  : Math.max(1, gameStore.levelDays) + (
      (nextApiLevel.value === 'night' && !gameStore.levelStartFromDaytime) ||
      (nextApiLevel.value === 'day' && gameStore.levelStartFromDaytime)
        ? 1
        : 0
    ))
const nextApiPhaseLabel = computed(() => nextApiLevel.value === 'night'
  ? `第 ${nextApiDay.value} 夜`
  : `第 ${nextApiDay.value} 天`)
/* 准备阶段只有一个去处——首夜，所以这里用固定的中文序数说法，而不是
   「第 1 夜」这种带阿拉伯数字的通用格式：开局按钮是整局里最显眼的一次
   点击，读起来该像一句话。之后的阶段仍走通用格式。 */
const phaseActionLabel = computed(() => {
  if (demo.active && demo.level === 'prepare') return '开启游戏并进入第一夜'
  if (!isApiRoom.value) {
    return appStore.grimoire.isNight ? '返回白天阶段' : '进入夜晚阶段'
  }
  return gameStore.level === 'prepare'
    ? '开启游戏并进入第一夜'
    : `切换到${nextApiPhaseLabel.value}`
})
const canOfferPhaseAction = computed(() => demo.active ? demo.level !== 'end' : (
  !isApiRoom.value
    ? !session.isSpectator
    : gameStore.currentIsDm && gameStore.level !== 'end'
))
const phaseActionReady = computed(() => {
  if (demo.active) return true
  if (!isApiRoom.value) return true
  return gameController.isConnected
})
const phaseStatusLabel = computed(() => {
  if (!isApiRoom.value) return '本地状态'
  if (!gameController.isConnected) return '正在重连'
  return '服务器已同步'
})
const phaseStatusClass = computed(() => ({
  'is-reconnecting': isApiRoom.value && !gameController.isConnected,
}))
const phaseGuidance = computed(() => {
  if (gameStore.level === 'prepare' && isApiRoom.value) {
    return gameStore.currentIsDm
      ? '可直接进入首夜。'
      : '等待说书人进入首夜。'
  }
  if (gameStore.level === 'night' || (!isApiRoom.value && appStore.grimoire.isNight)) {
    return '按下方当前夜晚顺序依次处理角色，完成后返回白天。'
  }
  if (gameStore.level === 'end') return '本局已经结束，可在更多菜单中查看或重新开始。'
  return '白天可进行讨论、提名与裁定，完成后由说书人进入夜晚。'
})
const phaseActionNotice = computed(() => {
  if (isApiRoom.value && !gameStore.currentIsDm) return '只有说书人可以切换房间阶段。'
  if (gameStore.level === 'end') return '本局已经结束，无法继续切换昼夜。'
  return '当前视角不能切换阶段。'
})

function toggleNight(): void {
  appStore.toggleNight()
  if (appStore.grimoire.isNight) {
    session.setMarkedPlayer({ val: -1, force: true })
  }
}

async function goNight(): Promise<void> {
  if (demo.active) {
    try { demo.advance() } catch (error) { window.$toast.warning(error instanceof Error ? error.message : '切换失败') }
    return
  }
  if (isApiRoom.value) {
    if (!gameStore.currentIsDm) {
      window.$toast.warning('只有说书人可以切换昼夜阶段。')
      return
    }
    if (!gameController.isConnected) {
      window.$toast.warning('房间正在重连，暂时无法切换阶段。')
      return
    }
    if (phaseChangePending.value) return

    const nextLevel = nextApiLevel.value
    const nextLabel = nextApiPhaseLabel.value

    phaseChangePending.value = true
    try {
      await gameController.changeLevel({
        nextLevel,
      })
      await gameController.refreshGameState()
      window.$toast.success(`已切换到${nextLabel}。`)
    } catch (error) {
      window.$toast.error(
        error instanceof Error ? error.message : '切换阶段失败'
      )
    } finally {
      phaseChangePending.value = false
      appStore.toggleMenu(false)
    }
    return
  }

  toggleNight()
  appStore.toggleMenu(false)
}

function showTownSquare(): void {
  if (!appStore.grimoire.isPublic) appStore.toggleGrimoire()
  if (appStore.grimoire.isMenuOpen) appStore.toggleMenu()
}

async function returnEveryoneToTown(): Promise<void> {
  if (isApiRoom.value && !gameStore.currentIsDm) return
  // Recalling everyone at night ends the night, and the "第 N 天" banner that
  // phase change produces is the better announcement — firing a second cue on
  // top of it would just make the two fight for the same 2.8 seconds. By day
  // the recall has no other visible signal, so it earns its own banner.
  if (!appStore.grimoire.isNight) {
    usePhaseTransition().announce(buildReturnCue())
  }

  if (isApiRoom.value && appStore.grimoire.isNight) {
    if (!gameStore.currentIsDm || !gameController.isConnected) {
      window.$toast.warning('当前无法同步返回白天阶段。')
      return
    }
    try {
      await gameController.changeLevel({ nextLevel: 'day' })
      await gameController.refreshGameState()
    } catch (error) {
      window.$toast.error(
        error instanceof Error ? error.message : '返回白天失败'
      )
      return
    }
  }

  if (isApiRoom.value) {
    if (!gameStore.currentIsDm) return
    try {
      await gameController.request(SocketClientEvent.DMVoiceRoomReturnToPublic, {})
    } catch (error) {
      window.$toast.error(error instanceof Error ? error.message : '召回语音失败')
      return
    }
  }
  if (appStore.grimoire.isPublic) appStore.toggleGrimoire()
  if (!isApiRoom.value && appStore.grimoire.isNight) toggleNight()
  if (appStore.grimoire.isMenuOpen) appStore.toggleMenu()
}

async function toggleIsReview(): Promise<void> {
  if (session.isSpectator) return

  const confirm = session.isReview
    ? false
    : await requestInputModal({
        inputType: 'confirm',
        inputModal: 'confirm',
        inputData: { name: ['是否开启复盘视角？（所有玩家将看到角色）'] },
      }).catch(() => null)
  if (confirm === null) return

  if (!session.isReview && confirm === true) {
    session.setIsReview(true)
    playersStore.realivePlayers()
  } else if (session.isReview) {
    session.setIsReview(false)
  }
}

function toggleRaiseHand(): void {
  if (isApiRoom.value) {
    void usePlayerViewStore().toggleHand()
    return
  }
  if (session.claimedSeat >= 0) {
    session.voteSync([session.claimedSeat, claimedSeatVote.value > 0 ? 0 : 1])
  }
}

defineExpose({
  toggleNight,
  goNight,
  showTownSquare,
  returnEveryoneToTown,
  toggleIsReview,
  toggleRaiseHand,
})
</script>

<style scoped lang="scss">
.phase-control-panel {
  display: grid;
  gap: var(--ts-space-3, 12px);
  margin-bottom: var(--ts-space-4, 16px);
  padding: var(--ts-space-4, 16px);
  color: var(--ts-text-primary, #f4ebdd);
  background:
    linear-gradient(145deg, rgba(33, 24, 43, 0.96), rgba(11, 9, 16, 0.98)),
    var(--ts-noise-stone);
  border: 1px solid var(--ts-border-subtle, rgba(214, 184, 106, 0.22));
  border-radius: var(--ts-radius-md, 10px);
}

/* 紧凑模式下这一节只剩一个按钮，卡片的边框、底纹和内边距会把它包成
   "卡中卡"。去掉外壳，让按钮直接坐在侧栏的羊皮纸上。 */
.phase-control-panel.is-compact {
  gap: 0;
  margin-bottom: 0;
  padding: 0;
  background: none;
  border: 0;
  border-radius: 0;
}

.phase-control-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ts-space-3, 12px);

  > div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  span:first-child {
    color: var(--ts-text-muted, #c9bca7);
    font-size: 0.78rem;
  }

  strong {
    font-family: var(--ts-font-heading, serif);
    font-size: clamp(1.25rem, 4vw, 1.65rem);
  }
}

.phase-control-panel__status {
  flex: 0 0 auto;
  padding: 5px 9px;
  /* Brass, not SaaS-green: "synced" is the calm default state, and this pill
     was the only green element on an otherwise crimson-and-gold table. */
  color: var(--ts-accent-gold-hover, #e7cf86);
  background: rgba(214, 184, 106, 0.1);
  border: 1px solid var(--ts-border-subtle, rgba(214, 184, 106, 0.22));
  border-radius: var(--ts-radius-pill, 999px);
  font-size: 0.76rem;
  font-weight: 800;

  &.is-reconnecting {
    color: var(--ts-warning, #f2c46d);
    background: rgba(242, 196, 109, 0.1);
    border-color: rgba(242, 196, 109, 0.38);
  }
}

.phase-control-panel__guidance,
.phase-control-panel__notice {
  margin: 0;
  color: var(--ts-text-muted, #c9bca7);
  line-height: 1.5;
}

.phase-control-panel__action {
  min-height: 52px;
  width: 100%;
  display: grid;
  gap: 2px;
  place-items: center;
  padding: 8px 14px;
  color: var(--ts-text-on-parchment, #2a1b18);
  background:
    linear-gradient(90deg, rgba(142, 47, 54, 0.11), transparent 58%),
    var(--ts-noise-parchment), var(--ts-surface-parchment-aged, #d7c29c);
  border: 1px solid var(--ts-border-strong, #8f7443);
  border-radius: var(--ts-radius-md, 10px);
  box-shadow:
    0 4px 12px rgba(20, 12, 6, 0.24),
    inset 0 1px rgba(255, 250, 233, 0.5);
  cursor: pointer;
  font: inherit;
  font-weight: 900;
  text-shadow: 0 1px 0 rgba(255, 250, 233, 0.4);
  touch-action: manipulation;
  transition:
    border-color var(--ts-motion-fast, 160ms) ease,
    box-shadow var(--ts-motion-fast, 160ms) ease,
    transform var(--ts-motion-fast, 160ms) var(--ts-ease-out, ease-out);

  small {
    font-size: 0.76rem;
    font-weight: 600;
  }

  &:hover:not(:disabled) {
    border-color: var(--ts-accent-gold-hover, #e7cf86);
    box-shadow:
      0 6px 16px rgba(20, 12, 6, 0.32),
      0 0 18px var(--ts-glow-candle, rgba(247, 208, 120, 0.4)),
      inset 0 1px rgba(255, 250, 233, 0.6);
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
    box-shadow:
      inset 0 2px 6px rgba(20, 12, 6, 0.3),
      inset 0 1px rgba(255, 250, 233, 0.4);
  }

  &:focus-visible {
    outline: 3px solid var(--ts-focus-ring, #f0d990);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.52;
  }
}

@media (prefers-reduced-motion: reduce) {
  .phase-control-panel__action {
    transition: none;
  }

  .phase-control-panel__action:hover:not(:disabled),
  .phase-control-panel__action:active:not(:disabled) {
    transform: none;
  }
}

@media (max-width: 420px) {
  .phase-control-panel {
    padding: var(--ts-space-3, 12px);
  }

  .phase-control-panel__header {
    align-items: stretch;
    flex-direction: column;
  }

  .phase-control-panel__status {
    align-self: flex-start;
  }
}
</style>

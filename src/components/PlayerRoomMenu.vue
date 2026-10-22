<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePlayerMenuActions } from '@/composables/usePlayerMenuActions'
import { useAppStore } from '@/stores/app'
import { useGameStore } from '@/stores/game'
import { useUserStore } from '@/stores/user'
import { usePlayerViewStore, HAND_ICONS } from '@/stores/playerView'
import { requestInputModal } from '@/services/inputModalService'
import { AuthHelper } from '@/helpers/auth'
import { useVoiceController } from '@/controllers/VoiceController'
import { useGameController } from '@/controllers/GameController'
import Modal from './modals/Modal.vue'
import RoleIcon from './RoleIcon.vue'
import SendRolesControl from './SendRolesControl.vue'
const props = defineProps<{ pending?: boolean }>()
const emit = defineEmits<{ become: []; leave: []; command: [action: string] }>()
const app = useAppStore()
const game = useGameStore()
const view = usePlayerViewStore()
const tab = ref<'play' | 'game' | 'app'>('play')
const picker = ref(false)
const rulesOpen = ref(false)
const loggingOut = ref(false)
const leavingSeat = ref(false)
const tabs = computed(
  () =>
    [
      {
        id: 'play',
        name: game.currentIsDm ? '新游戏' : '游玩中',
        icon: 'plus-circle',
      },
      { id: 'game', name: '游戏中', icon: 'keyboard' },
      { id: 'app', name: 'APP', icon: 'sliders-h' },
    ] as const
)
const raised = computed(() =>
  Boolean(game.handSignals[useUserStore().userId || ''])
)
const canRaise = computed(() =>
  Boolean(
    game.currentPlayer && (game.currentIsDm || game.currentPlayer.seat > 0)
  )
)
const roleIcons = computed(() =>
  [...app.roles.values()]
    .filter(
      (role) =>
        role.id &&
        ['townsfolk', 'outsider', 'minion', 'demon'].includes(role.team || '')
    )
    .slice(0, 30)
)
function command(action: string) {
  if (!game.currentIsDm) return
  close()
  emit('command', action)
}
function runStorytellerAction(action: string) {
  if (!game.currentIsDm) return
  if (action === 'rules') openRules()
  else command(action)
}
defineExpose({ runStorytellerAction })
const { close, modal, openRoles, requestChat, town, fullscreen } =
  usePlayerMenuActions()
async function clearRoles() {
  close()
  const yes = await requestInputModal({
    inputType: 'confirm',
    inputModal: 'confirm',
    inputData: {
      name: ['清空本机魔典中的角色和提示标记？其他玩家不受影响。'],
    },
  }).catch(() => false)
  if (yes !== true) return
  view.clearRoles()
}
async function leaveSeat() {
  if (leavingSeat.value || props.pending || !game.currentPlayer || game.currentPlayer.seat < 1 || game.currentIsDm) return
  leavingSeat.value = true
  try {
    const controller = useGameController()
    await controller.leaveSeat()
    await controller.refreshGameState()
    close()
  } catch (error) {
    window.$toast.error(error instanceof Error ? error.message : '离开坐席失败，请重试')
  } finally {
    leavingSeat.value = false
  }
}
function openRules() {
  rulesOpen.value = true
  close()
}
function chooseHand(icon: string) {
  void view.toggleHand(icon)
  picker.value = false
}
function reload() {
  window.location.reload()
}
async function logout() {
  if (loggingOut.value) return
  loggingOut.value = true
  try {
    await useVoiceController().disconnect()
    const url = await AuthHelper.logout()
    window.location.assign(url || '/')
  } catch {
    window.$toast.error('本机已退出，远程退出失败，请刷新后重试。')
  } finally {
    loggingOut.value = false
  }
}
function tabKey(event: KeyboardEvent, index: number) {
  const next =
    event.key === 'ArrowRight'
      ? (index + 1) % 3
      : event.key === 'ArrowLeft'
        ? (index + 2) % 3
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? 2
            : -1
  if (next < 0) return
  event.preventDefault()
  tab.value = tabs.value[next].id
  document.getElementById(`player-menu-tab-${tabs.value[next].id}`)?.focus()
}
</script>

<template>
  <section
    v-if="app.grimoire.isMenuOpen"
    id="room-command-drawer"
    class="player-room-menu"
    :class="{ 'storyteller-room-menu': game.currentIsDm }"
    :aria-label="game.currentIsDm ? '说书人菜单' : '玩家菜单'"
    @keydown.esc.stop="close"
  >
    <header>{{ tabs.find((item) => item.id === tab)?.name }}</header>
    <div
      :id="`player-menu-panel-${tab}`"
      class="player-menu-body"
      role="tabpanel"
      :aria-labelledby="`player-menu-tab-${tab}`"
    >
      <template v-if="tab === 'play' && game.currentIsDm">
        <button
          type="button"
          @click="command('seats')"
        >
          <span>添加玩家</span><kbd>1</kbd>
        </button>
        <button
          type="button"
          @click="command('script')"
        >
          <span>选择剧本</span><kbd>2</kbd>
        </button>
        <button type="button" @click="openRules">
          <span>阅读游戏规则</span><kbd>3</kbd>
        </button>
        <button
          type="button"
          @click="command('npc')"
        >
          <span>添加 NPC</span><kbd>4</kbd>
        </button>
        <button
          type="button"
          @click="command('roles')"
        >
          <span>选择角色</span><kbd>5</kbd>
        </button>
        <SendRolesControl />
        <button
          type="button"
          @click="command('reveal')"
        >
          <span>{{ game.grimoireReveal ? '继续揭晓魔典' : '揭晓魔典' }}</span
          ><kbd>G</kbd>
        </button>
        <button
          type="button"
          :disabled="game.level !== 'prepare'"
          @click="command('clear')"
        >
          <span>清空魔典</span><font-awesome-icon icon="trash-alt" />
        </button>
        <button
          type="button"
          :disabled="props.pending"
          @click="command('resign')"
        >
          <span>卸任说书人</span><font-awesome-icon icon="user" />
        </button>
        <button type="button" @click="emit('leave')">
          <span>离开游戏</span><kbd>L</kbd>
        </button>
      </template>
      <template v-else-if="tab === 'play'">
        <button type="button" @click="openRules">
          <span>阅读游戏规则</span><font-awesome-icon icon="book" />
        </button>
        <button type="button" @click="clearRoles">
          <span>清空魔典</span><font-awesome-icon icon="trash-alt" />
        </button>
        <button
          v-if="!game.currentPlayer || game.currentPlayer.seat < 1"
          type="button"
          :disabled="props.pending"
          @click="emit('become')"
        >
          <span>{{ pending ? '正在申请…' : '成为说书人' }}</span
          ><span aria-hidden="true">♛</span>
        </button>
        <button type="button" :disabled="!game.currentPlayer || game.currentPlayer.seat < 1 || leavingSeat || props.pending" @click="leaveSeat">
          <span>离开坐席</span><font-awesome-icon icon="chair" />
        </button>
        <button type="button" @click="emit('leave')">
          <span>离开游戏</span><kbd>L</kbd>
        </button>
      </template>
      <template v-else-if="tab === 'game'">
        <button type="button" @click="requestChat">
          <span>请求私聊</span><kbd>ENTER</kbd>
        </button>
        <div class="hand-row">
          <button
            type="button"
            :disabled="!canRaise || view.handPending"
            :aria-pressed="raised"
            @click="view.toggleHand()"
          >
            {{ raised ? '放下手' : '举手' }}
          </button>
          <button
            type="button"
            class="hand-choice"
            aria-label="选择举手图标"
            :aria-expanded="picker"
            @click="picker = !picker"
          >
            <RoleIcon
              v-if="view.handIcon.startsWith('role:')"
              :role="app.roles.get(view.handIcon.slice(5)) || { id: '' }"
            /><span v-else>{{ view.handIcon }}</span>
          </button>
          <kbd title="短按举手或放下手，按住连续挥手">SPACE</kbd>
        </div>
        <div v-if="picker" class="hand-picker" aria-label="举手图标">
          <button
            v-for="icon in HAND_ICONS"
            :key="icon"
            type="button"
            :disabled="!canRaise || view.handPending"
            :aria-label="`举手图标 ${icon}`"
            @click="chooseHand(icon)"
          >
            {{ icon }}
          </button>
          <button
            v-for="role in roleIcons"
            :key="role.id"
            type="button"
            :disabled="!canRaise || view.handPending"
            :aria-label="`举手图标 ${role.name}`"
            @click="chooseHand(`role:${role.id}`)"
          >
            <RoleIcon :role="role" />
          </button>
        </div>
        <button type="button" @click="town">
          <span>显示城镇广场</span><kbd>T</kbd>
        </button>
        <button
          v-if="game.currentIsDm"
          type="button"
          :disabled="game.level === 'end'"
          @click="command('phase')"
        >
          <span>{{
            game.level === 'night' ? '前往白天阶段' : '前往夜晚阶段'
          }}</span
          ><kbd>N</kbd>
        </button>
        <button type="button" @click="openRoles">
          <span>角色列表</span><kbd>C</kbd>
        </button>
        <template v-if="game.currentIsDm">
          <button type="button" @click="modal('nightOrder')">
            <span>夜晚顺序表</span><kbd>O</kbd>
          </button>
          <button type="button" @click="command('votes')">
            <span>投票历史记录</span><kbd>V</kbd>
          </button>
          <button type="button" @click="command('recall')">
            <span>让大家回到城镇广场</span><kbd>R</kbd>
          </button>
          <button type="button" @click="command('timer')">
            <span>设定计时器</span><kbd>Z</kbd>
          </button>
        </template>
        <button type="button" @click="modal('roomInfo')">
          <span>用户列表</span><kbd>U</kbd>
        </button>
      </template>
      <template v-else>
        <button type="button" @click="fullscreen">
          <span>全屏模式</span><kbd>F</kbd>
        </button>
        <button type="button" @click="modal('settings')">
          <span>设置</span><kbd>Q</kbd>
        </button>
        <button type="button" @click="reload">
          <span>重新启动App</span><font-awesome-icon icon="rotate-right" />
        </button>
        <button type="button" :disabled="loggingOut" @click="logout">
          <span>退出登录</span><font-awesome-icon icon="door-open" />
        </button>
      </template>
    </div>
    <nav role="tablist" aria-label="菜单分页">
      <button
        v-for="(item, index) in tabs"
        :id="`player-menu-tab-${item.id}`"
        :key="item.id"
        type="button"
        role="tab"
        :aria-label="item.name"
        :aria-selected="tab === item.id"
        :aria-controls="`player-menu-panel-${item.id}`"
        :tabindex="tab === item.id ? 0 : -1"
        @click="tab = item.id"
        @keydown="tabKey($event, index)"
      >
        <font-awesome-icon :icon="item.icon" />
      </button>
    </nav>
  </section>
  <Modal
    v-if="rulesOpen"
    name="player-rules"
    title="游戏规则"
    @close="rulesOpen = false"
  >
    <div class="player-rules">
      <p>
        善良阵营需要找出并处决恶魔；邪恶阵营需要保护恶魔，直至存活玩家只剩两人。
      </p>
      <p>
        白天讨论、提名与投票，夜晚由说书人依次唤醒角色处理能力。死亡玩家仍可讨论，并保留一次幽灵投票。
      </p>
      <p>具体角色能力以当前剧本为准，有疑问时请询问说书人。</p>
      <template v-if="game.customRules?.length"
        ><h3>本房间规则</h3>
        <p v-for="(rule, index) in game.customRules" :key="index">
          {{ rule }}
        </p></template
      >
    </div>
  </Modal>
</template>

<style scoped>
.player-room-menu {
  position: absolute;
  right: 0;
  top: 58px;
  z-index: 160;
  width: 280px;
  max-width: calc(100vw - 24px);
  color: #fff;
  background: rgba(12, 10, 15, 0.91);
  border: 2px solid #080709;
  border-radius: 7px;
  box-shadow: 0 4px 10px #0009;
  font-family: Georgia, 'Noto Serif SC', serif;
  overflow: hidden;
}
.player-room-menu header {
  text-align: center;
  padding: 5px;
  font-size: 17px;
  background: linear-gradient(
    100deg,
    #e8aa0b,
    #26201e 25%,
    #211925 72%,
    #7900bc
  );
  border-bottom: 1px solid #000;
}
.player-menu-body {
  max-height: calc(100dvh - 155px);
  overflow-y: auto;
}
.player-room-menu button {
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: 0;
  cursor: pointer;
  font: inherit;
}
.player-menu-body > button {
  width: 100%;
  min-height: 33px;
  padding: 4px 7px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid #000;
  font-size: 18px;
  text-align: left;
}
.player-room-menu button:hover:not(:disabled),
.player-room-menu button[aria-pressed='true'] {
  color: #ffc44d;
  background: #ffffff0c;
}
.player-room-menu button:focus-visible {
  outline: 2px solid #edc462;
  outline-offset: -2px;
}
.player-room-menu button:disabled {
  opacity: 0.45;
  cursor: default;
}
kbd {
  color: #222;
  background: #fff;
  padding: 1px 3px;
  font:
    12px Georgia,
    serif;
  border-radius: 1px;
  white-space: nowrap;
}
.hand-row {
  display: flex;
  align-items: center;
  min-height: 33px;
  border-bottom: 1px solid #000;
  padding-right: 7px;
  gap: 8px;
}
.hand-row > button:first-child {
  padding: 4px 7px;
  font-size: 18px;
  flex: 1;
  text-align: left;
}
.hand-choice {
  width: 28px;
  height: 27px;
  display: grid;
  place-items: center;
  font-size: 23px !important;
}
.hand-choice :deep(.icon),
.hand-picker :deep(.icon) {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.hand-picker {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 3px;
  padding: 5px;
}
.hand-picker button {
  aspect-ratio: 1;
  min-width: 0;
  padding: 0;
  font-size: 22px;
  background: #eee;
  color: #111;
}
.player-room-menu nav {
  display: flex;
  height: 33px;
  border-top: 1px solid #000;
}
.player-room-menu nav button {
  flex: 1;
  border-right: 2px solid #000;
}
.player-room-menu nav button:last-child {
  border: 0;
}
.player-room-menu nav button[aria-selected='true'] {
  background: linear-gradient(#8806c8, #34044c);
}
.player-rules {
  line-height: 1.9;
}
.storyteller-room-menu {
  width: 230px;
}
.storyteller-room-menu .player-menu-body > button,
.storyteller-room-menu .hand-row {
  min-height: 27px;
}
.storyteller-room-menu .player-menu-body > button {
  padding: 2px 5px;
  font-size: 17px;
}
.storyteller-room-menu nav {
  height: 29px;
}
@media (max-width: 600px) {
  .player-room-menu,
  .storyteller-room-menu {
    width: 260px;
  }
  .player-menu-body > button,
  .storyteller-room-menu .player-menu-body > button,
  .storyteller-room-menu .hand-row,
  .hand-row > button:first-child {
    min-height: 40px;
  }
  .player-room-menu nav,
  .storyteller-room-menu nav {
    height: 40px;
  }
}
</style>

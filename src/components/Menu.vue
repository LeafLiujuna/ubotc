<template>
  <div id="controls">
    <div
      v-if="session.sessionId"
      class="room-topbar"
      aria-label="房间状态与命令"
    >
      <RoomVoiceControls />
      <button
        type="button"
        class="hud-icon connection"
        :class="{ reconnecting: session.isReconnecting }"
        title="查看房间信息"
        :aria-label="`房间连接状态，${roomOnlineCount} 人在线${
          session.ping ? `，延迟 ${session.ping} 毫秒` : ''
        }`"
        aria-haspopup="dialog"
        aria-controls="room-info-modal"
        @click="toggleModal('roomInfo')"
      >
        <font-awesome-icon :icon="['fas', 'wifi']" />
        <span aria-hidden="true">{{ roomOnlineCount }}</span>
      </button>
      <RoomNotifications />
      <button
        class="hud-cog"
        :class="{ active: grimoire.isMenuOpen }"
        type="button"
        title="房间设置"
        aria-label="房间命令"
        aria-controls="room-command-drawer"
        :aria-expanded="grimoire.isMenuOpen"
        @click="toggleMenu()"
      >
        <font-awesome-icon :icon="['fas', 'cog']" />
      </button>
    </div>

    <PlayerRoomMenu v-if="isApiRoom" ref="roomMenu" :pending="storytellerPending" @become="becomeStoryteller" @leave="leaveSession" @command="runStorytellerAction" />
    <transition name="room-menu">
      <div
        v-if="session.sessionId && grimoire.isMenuOpen && !isApiRoom"
        id="room-command-drawer"
        class="room-menu-panel"
        role="region"
        aria-labelledby="room-command-title"
        @keydown.esc="toggleMenu(false)"
      >
        <header class="room-menu-header">
          <div>
            <span class="room-menu-kicker">
              <font-awesome-icon :icon="['fas', 'chess-rook']" aria-hidden="true" />
              局内指令
            </span>
            <strong id="room-command-title">房间控制台</strong>
          </div>
          <span
            class="room-phase"
            :class="{ 'room-phase--night': grimoire.isNight }"
          >
            <font-awesome-icon
              :icon="['fas', grimoire.isNight ? 'moon' : 'sun']"
              aria-hidden="true"
            />
            {{ grimoire.isNight ? "夜晚" : "白天" }}
          </span>
        </header>

        <div class="room-menu-scroll">
          <section class="room-menu-group" aria-labelledby="room-menu-social">
            <h2 id="room-menu-social">交流与视野</h2>
            <button
              v-if="!isApiRoom"
              type="button"
              class="room-menu-item"
              @click="toggleModal('groupChat')"
            >
              <span class="room-menu-item__lead">
                <span class="room-menu-item__icon" aria-hidden="true">
                  <font-awesome-icon :icon="['fas', 'comments']" />
                </span>
                <span>请求私聊</span>
              </span>
              <kbd>Enter</kbd>
            </button>
            <button
              v-if="!isApiRoom"
              type="button"
              class="room-menu-item"
              @click="toggleRaiseHand"
            >
              <span class="room-menu-item__lead">
                <span class="room-menu-item__icon" aria-hidden="true">
                  <font-awesome-icon :icon="['fas', 'hand-paper']" />
                </span>
                <span>举手</span>
              </span>
              <kbd>Space</kbd>
            </button>
            <button type="button" class="room-menu-item" @click="showTownSquare">
              <span class="room-menu-item__lead">
                <span class="room-menu-item__icon" aria-hidden="true">
                  <font-awesome-icon :icon="['fas', 'city']" />
                </span>
                <span>显示城镇广场</span>
              </span>
              <kbd>T</kbd>
            </button>
          </section>

          <section class="room-menu-group" aria-labelledby="room-menu-flow">
            <h2 id="room-menu-flow">剧本与进程</h2>
            <button
              v-if="!session.isSpectator && !isApiRoom"
              type="button"
              class="room-menu-item"
              @click="goNight"
            >
              <span class="room-menu-item__lead">
                <span class="room-menu-item__icon" aria-hidden="true">
                  <font-awesome-icon
                    :icon="['fas', grimoire.isNight ? 'sun' : 'moon']"
                  />
                </span>
                <span>{{ grimoire.isNight ? "返回白天阶段" : "前往夜晚阶段" }}</span>
              </span>
              <kbd>N</kbd>
            </button>
            <button
              v-if="!isApiRoom"
              type="button"
              class="room-menu-item"
              @click="toggleModal('roles')"
            >
              <span class="room-menu-item__lead">
                <span class="room-menu-item__icon" aria-hidden="true">
                  <font-awesome-icon :icon="['fas', 'theater-masks']" />
                </span>
                <span>角色列表</span>
              </span>
              <kbd>C</kbd>
            </button>
            <button
              v-if="!session.isSpectator"
              type="button"
              class="room-menu-item"
              @click="toggleModal('nightOrder')"
            >
              <span class="room-menu-item__lead">
                <span class="room-menu-item__icon" aria-hidden="true">
                  <font-awesome-icon :icon="['fas', 'list-ol']" />
                </span>
                <span>夜晚顺序表</span>
              </span>
              <kbd>O</kbd>
            </button>
            <button
              type="button"
              class="room-menu-item"
              @click="openVoteSurface"
            >
              <span class="room-menu-item__lead">
                <span class="room-menu-item__icon" aria-hidden="true">
                  <font-awesome-icon :icon="['fas', isApiRoom ? 'vote-yea' : 'book-dead']" />
                </span>
                <span>{{ isApiRoom ? "提名投票" : "投票历史记录" }}</span>
              </span>
              <kbd>V</kbd>
            </button>
          </section>

          <section
            v-if="!session.isSpectator"
            class="room-menu-group"
            aria-labelledby="room-menu-host"
          >
            <h2 id="room-menu-host">说书人命令</h2>
            <StorytellerControls
              v-if="isApiRoom && gameStore.currentIsDm"
              class="room-menu-storyteller-controls"
            />
            <button
              type="button"
              class="room-menu-item room-menu-item--danger"
              @click="returnEveryoneToTown"
            >
              <span class="room-menu-item__lead">
                <span class="room-menu-item__icon" aria-hidden="true">
                  <font-awesome-icon :icon="['fas', 'home']" />
                </span>
                <span>让大家回到城镇广场</span>
              </span>
              <kbd>R</kbd>
            </button>
            <button
              type="button"
              class="room-menu-item"
              @click="openLocalTimerSettings"
            >
              <span class="room-menu-item__lead">
                <span class="room-menu-item__icon" aria-hidden="true">
                  <font-awesome-icon :icon="['fas', 'clock']" />
                </span>
                <span>设定本地计时器</span>
              </span>
              <kbd>Z</kbd>
            </button>
          </section>

          <section class="room-menu-group" aria-labelledby="room-menu-settings">
            <h2 id="room-menu-settings">房间</h2>
            <button v-if="isApiRoom && !gameStore.currentIsDm" type="button" class="room-menu-item"
              :disabled="storytellerPending || !!gameStore.dmElection" @click="becomeStoryteller">
              <span class="room-menu-item__lead">
                <span class="room-menu-item__icon" aria-hidden="true"><font-awesome-icon icon="theater-masks" /></span>
                <span>{{ storytellerPending ? '正在申请…' : gameStore.dmElection ? '说书人申请进行中' : '成为说书人' }}</span>
              </span>
            </button>
            <button
              type="button"
              class="room-menu-item room-menu-item--accent"
              @click="toggleModal('settings')"
            >
              <span class="room-menu-item__lead">
                <span class="room-menu-item__icon" aria-hidden="true">
                  <font-awesome-icon :icon="['fas', 'sliders-h']" />
                </span>
                <span>详细设置</span>
              </span>
              <kbd>U</kbd>
            </button>
          </section>
        </div>

        <div class="room-menu-footer" role="toolbar" aria-label="快捷命令">
          <button
            type="button"
            title="添加座位"
            aria-label="添加座位"
            :disabled="session.isSpectator"
            @click="openSeatEditor()"
          >
            <font-awesome-icon :icon="['fas', 'plus']" />
          </button>
          <button
            type="button"
            title="快捷键"
            aria-label="查看快捷键"
            @click="toggleModal('settings')"
          >
            <font-awesome-icon :icon="['fas', 'keyboard']" />
          </button>
          <button
            type="button"
            title="详细设置"
            aria-label="打开详细设置"
            @click="toggleModal('settings')"
          >
            <font-awesome-icon :icon="['fas', 'sliders-h']" />
          </button>
        </div>
      </div>
    </transition>

    <LocalTimerControls ref="localTimerControls" />

    <span
      class="nomlog-summary"
      v-show="!isApiRoom && session.voteHistory.length && session.sessionId"
      @click="openVoteSurface"
      :title="`最近 ${session.voteHistory.length} 次提名`"
    >
      <font-awesome-icon :icon="['fas', 'book-dead']" />
      {{ session.voteHistory.length }}
    </span>
    <span
      class="session"
      :class="{
        spectator: session.isSpectator,
        reconnecting: session.isReconnecting,
      }"
      v-if="
        !!session.sessionId &&
        (!session.isSpectator ||
          !!session.isHostAllowed ||
          !!session.isJoinAllowed)
      "
      @click="leaveSession"
      :title="`${session.playerCount} other players in this session${
        session.ping ? ' (' + session.ping + 'ms latency)' : ''
      }`"
    >
      <!-- <font-awesome-icon :icon="['fas', 'broadcast-tower']" />
      {{ session.playerCount }} -->
    </span>
    <div v-if="!isApiRoom" class="menu" :class="{ open: grimoire.isMenuOpen }">
      <font-awesome-icon
        v-if="session.sessionId"
        :icon="['fas', 'cog']"
        @click="toggleMenu"
      />
      <ul v-if="session.sessionId">
        <li class="tabs" :class="tab">
          <font-awesome-icon
            :icon="['fas', 'book-open']"
            @click="tab = 'grimoire'"
          />
          <font-awesome-icon
            :icon="['fas', 'broadcast-tower']"
            @click="tab = 'session'"
          />
          <font-awesome-icon
            :icon="['fas', 'users']"
            v-if="!session.isSpectator"
            @click="tab = 'players'"
          />
          <font-awesome-icon
            :icon="['fas', 'chess-rook']"
            v-if="!session.isSpectator"
            @click="tab = 'game'"
          />
          <font-awesome-icon
            :icon="['fas', 'theater-masks']"
            @click="tab = 'characters'"
          />
          <font-awesome-icon
            :icon="['fas', 'question']"
            @click="tab = 'help'"
          />
        </li>

        <template v-if="tab === 'grimoire'">
          <!-- Grimoire -->
          <li class="headline">魔典</li>
          <div class="options">
            <li @click="toggleGrimoire()" v-if="players.length">
              <template v-if="!grimoire.isPublic">隐藏</template>
              <template v-if="grimoire.isPublic">显示</template>
              [G]
            </li>
            <li @click="toggleNight" v-if="!session.isSpectator">
              <template v-if="!grimoire.isNight">切换至夜晚</template>
              <template v-if="grimoire.isNight">切换至白天</template>
              [S]
            </li>
            <li v-if="!session.isSpectator" class="menu-action-row">
              <button
                type="button"
                class="menu-action-button"
                aria-haspopup="dialog"
                @click="openRoleDistribution"
              >
                <span>发送角色</span>
                <font-awesome-icon :icon="['fas', 'theater-masks']" />
              </button>
            </li>
            <li v-if="!session.isSpectator" class="menu-action-row">
              <button
                type="button"
                class="menu-action-button"
                @click="openTypeDistribution"
              >
                <span>发送角色类型</span>
              </button>
            </li>
            <li v-if="!session.isSpectator" class="menu-action-row">
              <button
                type="button"
                class="menu-action-button"
                aria-haspopup="dialog"
                @click="openBluffDistribution"
              >
                <span>发送伪装身份</span>
                <font-awesome-icon :icon="['fas', 'hat-wizard']" />
              </button>
            </li>
            <li v-if="!session.isSpectator" class="menu-action-row">
              <button
                type="button"
                class="menu-action-button"
                aria-haspopup="dialog"
                @click="openGrimoireDistribution"
              >
                <span>发送魔典</span>
                <font-awesome-icon :icon="['fas', 'book']" />
              </button>
            </li>
            <li
              @click="openSeatEditor()"
              v-if="!session.isSpectator"
            >
              添加座位
            </li>
            <li
              @click="randomizeSeatings"
              v-if="!session.isSpectator && players.length > 2"
            >
              随机座位
              <font-awesome-icon :icon="['fas', 'dice']" />
            </li>
            <li v-if="!session.isSpectator" @click="toggleModal('edition')">
              选择剧本 [P]
            </li>
            <li class="menu-action-row">
              <button
                type="button"
                class="menu-action-button"
                @click="toggleModal('settings')"
              >
                <small>在设置中调整角色合集范围</small>
              </button>
            </li>
            <li
              @click="toggleModal('roles')"
              v-if="!session.isSpectator && players.length > 4"
            >
              配置角色 [C]
            </li>
            <li v-if="!session.isSpectator" @click="toggleModal('fabled')">
              添加传奇角色 [F]
            </li>
            <li v-if="!session.isSpectator" class="menu-action-row">
              <button
                type="button"
                class="menu-action-button"
                @click="toggleModal('settings')"
              >
                <small>在设置中编辑私货商人</small>
              </button>
            </li>
            <li @click="clearRoles" v-if="players.length">
              移除全部
              <font-awesome-icon icon="trash-alt" />
            </li>
            <li @click="toggleModal('nightOrder')" v-if="!session.isSpectator">
              夜晚顺序表
              <font-awesome-icon icon="cloud-moon" />
            </li>

            <li @click="toggleRaiseHand" v-if="!session.isSpectator">
              <template
                v-if="
                  session.claimedSeat >= 0 &&
                  claimedSeatVote > 0
                "
                >放下手</template
              >
              <template v-else>举手</template>
              [空格]
            </li>

            <li @click="toggleIsReview" v-if="!session.isSpectator">
              复盘视角
              <font-awesome-icon
                :icon="['fas', session.isReview ? 'check-square' : 'square']"
              />
            </li>
            <li v-if="players.length">
              缩放
              <font-awesome-icon
                @click="setZoom(grimoire.zoom - 1)"
                icon="search-minus"
              />
              {{ Math.round(100 + grimoire.zoom * 10) }}%
              <font-awesome-icon
                @click="setZoom(grimoire.zoom + 1)"
                icon="search-plus"
              />
            </li>

            <li @click="toggleModal('settings')">
              设置
              <font-awesome-icon icon="cog" />
            </li>
          </div>
        </template>

        <template v-if="tab === 'session'">
          <!-- Session -->
          <li class="headline" v-if="session.sessionId">
            {{ session.isSpectator ? "玩家" : "说书人" }}
          </li>
          <li class="headline" v-else>联机</li>
          <div class="options">
            <template v-if="!session.sessionId">
              <li @click="hostSession">创建房间 [H]</li>
              <li @click="joinSession">加入房间 [J]</li>
            </template>
            <template v-else>
              <li v-if="session.ping">
                与{{ session.isSpectator ? "说书人" : "玩家" }}延迟
                {{ session.ping }}ms
              </li>
              <li @click="copySessionUrl">
                复制链接
                <font-awesome-icon icon="copy" />
              </li>
              <li
                v-if="isApiRoom || session.voteHistory.length || !session.isSpectator"
                @click="openVoteSurface"
              >
                {{ isApiRoom ? "提名投票[V]" : "投票记录[V]" }}
              </li>
              <li @click="leaveSession">
                <span v-if="session.isSpectator">退出房间</span>
                <span v-if="!session.isSpectator">解散房间</span>
                {{ session.sessionId }}
              </li>
              <li @click="backToLobby">
                <font-awesome-icon icon="door-open" /> 返回大厅
              </li>
            </template>
          </div>
        </template>

        <template v-if="tab === 'players' && !session.isSpectator">
          <!-- Users -->
          <li class="headline">玩家</li>
          <div class="options">
            <li @click="openSeatEditor()">
              添加座位<!--<em>[A]</em>-->
            </li>
            <li @click="randomizeSeatings" v-if="players.length > 2">
              随机座位
              <font-awesome-icon icon="dice" />
            </li>
            <li @click="clearPlayers" v-if="players.length">
              移除全部
              <font-awesome-icon icon="trash-alt" />
            </li>
          </div>
        </template>

        <template v-if="tab === 'game' && !session.isSpectator">
          <!-- Game -->
          <li class="headline">游戏</li>
          <div class="options"></div>
        </template>

        <template v-if="tab === 'characters'">
          <!-- Characters -->
          <li class="headline">角色</li>
          <div class="options"></div>
        </template>

        <template v-if="tab === 'help'">
          <!-- Help -->
          <li class="headline">帮助</li>
          <div>
            <li>
              <a href="https://botcgrimoire.top/manual" target="_blank"
                >使用说明参考</a
              >
            </li>
            <li @click="toggleModal('version')">更新日志</li>
            <li @click="toggleModal('gameState')">
              游戏状态JSON
              <font-awesome-icon icon="file-code" />
            </li>
            <!-- <li>
              <a href="https://discord.gg/Gd7ybwWbFk" target="_blank">
                Join Discord
              </a>
              <em>
                <a href="https://discord.gg/Gd7ybwWbFk" target="_blank">
                  <font-awesome-icon :icon="['fab', 'discord']" />
                </a>
              </em>
            </li> -->
            <li>
              <a href="https://github.com/limpy01/townsquare" target="_blank">
                源代码
              </a>
              <a href="https://github.com/limpy01/townsquare" target="_blank">
                <font-awesome-icon :icon="['fab', 'github']" />
              </a>
            </li>
          </div>
        </template>
      </ul>
    </div>

    <RoleDistributionControls ref="roleDistributionControls" />
    <PlayerSeatControls ref="playerSeatControls" />
    <RoomSessionControls ref="roomSessionControls" />
    <GameTableFlowControls ref="gameTableFlowControls" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { requestInputModal } from "@/services/inputModalService";
import { useStorytellerUiStore } from '@/composables/useStoryteller';
import { useAppStore } from "@/stores/app";
import { useSeatEditorStore } from "@/stores/seatEditor";
import { useSessionStore } from "@/stores/session";
import { usePlayersStore } from "@/stores/players";
import { useGameStore } from "@/stores/game";
import { useUserStore } from "@/stores/user";
import { useGameController } from "@/controllers/GameController";
import { SocketClientEvent } from "@/types/socket";
import { useRealtimeVoteStore } from "@/stores/realtimeVote";
import { useVoiceController } from "@/controllers/VoiceController";
import RoomVoiceControls from "@/components/RoomVoiceControls.vue";
import RoomNotifications from "@/components/RoomNotifications.vue";
import GameTableFlowControls from "@/components/GameTableFlowControls.vue";
import PlayerRoomMenu from "@/components/PlayerRoomMenu.vue";
import StorytellerControls from "@/components/StorytellerControls.vue";
import LocalTimerControls from "@/components/LocalTimerControls.vue";
import PlayerSeatControls from "@/components/PlayerSeatControls.vue";
import RoleDistributionControls from "@/components/RoleDistributionControls.vue";
import RoomSessionControls from "@/components/RoomSessionControls.vue";

type RoleDistributionControlsHandle = {
  openRoles: () => void;
  openTypes: () => Promise<void>;
  openBluffs: () => void;
  openGrimoire: () => void;
};
type PlayerSeatControlsHandle = {
  addPlayer: (stImage?: unknown, stName?: string | null) => Promise<void>;
  randomizeSeatings: () => Promise<void>;
  clearPlayers: () => Promise<void>;
  clearRoles: () => Promise<void>;
};
type RoomSessionControlsHandle = {
  hostSession: () => Promise<void>;
  joinSession: () => Promise<void>;
  copySessionUrl: () => void;
  leaveSession: () => Promise<void>;
  backToLobby: () => Promise<void>;
};
type GameTableFlowControlsHandle = {
  toggleNight: () => void;
  goNight: () => Promise<void>;
  showTownSquare: () => void;
  returnEveryoneToTown: () => Promise<void>;
  toggleIsReview: () => Promise<void>;
  toggleRaiseHand: () => void;
};
type MenuData = {
  tab: string;
  storytellerPending: boolean;
};

export default defineComponent({
  components: {
    RoomVoiceControls,
    RoomNotifications,
    PlayerRoomMenu,
    GameTableFlowControls,
    LocalTimerControls,
    PlayerSeatControls,
    RoleDistributionControls,
    RoomSessionControls,
    StorytellerControls,
  },
  emits: ["open-table-vote"],
  computed: {
    grimoire() {
      return useAppStore().grimoire;
    },
    session() {
      return useSessionStore().$state;
    },
    gameStore() {
      return useGameStore();
    },
    realtimeVoteStore() {
      return useRealtimeVoteStore();
    },
    isApiRoom() {
      return Boolean(this.session.sessionId && this.session.gameServerId);
    },
    players() {
      return usePlayersStore().players;
    },
    roomOnlineCount() {
      return this.session.playerCount || 0;
    },
    claimedSeatVote() {
      if (this.session.claimedSeat < 0) return 0;
      return Number(this.session.votes[this.session.claimedSeat] || 0);
    },

    isHandHeld() {
      const deviceType = navigator.userAgent.toLocaleLowerCase();
      console.log(deviceType);
      if (/mobile|android|touch|webos|iphone|ipod/i.test(deviceType))
        return true;
      return false;
    },
  },
  data(): MenuData {
    return {
      tab: "grimoire",
      storytellerPending: false,
    };
  },

  mounted() {
    // Tapping outside the room drawer dismisses it. This is deliberately a
    // document listener rather than a full-viewport backdrop element: the drawer
    // sits over the live game table, and a backdrop — even a transparent one —
    // swallows every click on the seats behind it for as long as the drawer is
    // open. Commands like 添加座位 don't close the drawer, so that left the whole
    // table unreachable. Listening instead keeps the seats clickable while still
    // dismissing on an outside tap.
    document.addEventListener("pointerdown", this.dismissMenuOnOutsidePointer, true);
  },

  beforeUnmount() {
    document.removeEventListener("pointerdown", this.dismissMenuOnOutsidePointer, true);
  },

  methods: {
    runStorytellerShortcut(action: string) {
      const menu = this.$refs.roomMenu as { runStorytellerAction: (action: string) => void };
      menu?.runStorytellerAction(action);
    },
    async runStorytellerAction(action: string) {
      if (!this.isApiRoom || !this.gameStore.currentIsDm) return;
      if (action === 'clear' && this.gameStore.level !== 'prepare') return;
      this.toggleMenu(false);
      if (action === 'seats') this.openSeatEditor();
      else if (action === 'script') this.toggleModal('edition');
      else if (action === 'npc') this.toggleModal('fabled');
      else if (action === 'roles') this.toggleModal('roles');
      else if (action === 'clear') await this.clearRoles();
      else if (action === 'phase') await this.goNight();
      else if (action === 'votes') this.openVoteSurface();
      else if (action === 'recall') await this.returnEveryoneToTown();
      else if (action === 'timer') this.openLocalTimerSettings();
      else if (action === 'reveal') {
        const ui = useStorytellerUiStore();
        if (this.gameStore.grimoireReveal) ui.revealOpen = true;
        else ui.endOpen = true;
      }
      else if (action === 'resign') {
        if (this.storytellerPending) return;
        const reveal = !this.gameStore.grimoireRevealed;
        const confirmed = await requestInputModal({ inputType: 'confirm', inputModal: 'confirm', inputData: { name: [action === 'resign' ? '确定要卸任说书人并回到旁观席吗？' : reveal ? '揭晓所有玩家的真实角色？所有房间成员都将看到角色。' : '确定要隐藏魔典吗？已经看过的角色无法收回。'] } }).catch(() => false);
        if (confirmed !== true || !this.gameStore.currentIsDm) return;
        this.storytellerPending = true;
        try {
          const controller = useGameController();
          if (action === 'resign') await controller.request(SocketClientEvent.DMLeave);
          else await controller.request(SocketClientEvent.DMRevealGrimoire, { revealed: reveal });
          await controller.refreshGameState();
        } catch (error) {
          window.$toast.error(error instanceof Error ? error.message : '操作失败，请重试');
        } finally { this.storytellerPending = false; }
      }
    },
    async becomeStoryteller() {
      if (!this.isApiRoom || this.gameStore.currentIsDm || this.storytellerPending || this.gameStore.dmElection) return;
      if ((this.gameStore.currentPlayer?.seat ?? 0) > 0) {
        window.$toast.info('请先离座，再申请成为说书人。');
        return;
      }
      this.storytellerPending = true;
      const controller = useGameController();
      const userId = useUserStore().userId;
      const isOwner = userId ? this.gameStore.roomUsers[userId]?.isRoomOwner : false;
      const election = this.gameStore.gameConfig.dmElectionMode && !isOwner;
      try {
        await controller.request(election ? SocketClientEvent.ApplyDM : SocketClientEvent.DMEnter);
        await controller.refreshGameState();
        this.toggleMenu(false);
        if (election) window.$toast.info('已申请成为说书人，等待玩家投票。');
      } catch (error) {
        window.$toast.error(error instanceof Error ? error.message : '成为说书人失败，请重试');
      } finally {
        this.storytellerPending = false;
      }
    },
    dismissMenuOnOutsidePointer(event: PointerEvent) {
      if (!this.grimoire.isMenuOpen) return;
      // A dialog opened *from* the drawer is a child of the drawer's own
      // components but not of its DOM subtree — Modal.vue teleports to <body>.
      // Dismissing here would unmount StorytellerControls and take the dialog
      // with it, so the click that opened a confirm button would destroy the
      // button before its submit ran (随机分配角色 silently did nothing this way).
      // Any open modal keeps its own scroll lock counted on <body>, so that flag
      // is the reliable "an overlay owns this click" test, whatever its markup.
      if (document.body.dataset.tsModalLockCount) return;
      const target = event.target as HTMLElement | null;
      if (!target || typeof target.closest !== "function") return;
      // The drawer itself, the legacy grimoire menu, and either cog: those own
      // their own toggling, so leave them alone or we'd close then re-open.
      // `.modal-backdrop` and `[role="dialog"]` cover overlays that open without
      // a scroll lock, plus the toast layer, which outlives the click.
      if (target.closest(
        "#room-command-drawer, .menu, .hud-cog, .modal-backdrop, [role=\"dialog\"], .toast-container",
      )) return;
      this.toggleMenu(false);
    },
    openVoteSurface() {
      if (this.isApiRoom) {
        this.toggleMenu(false);
        this.$emit("open-table-vote");
        return;
      }
      this.toggleModal("voteHistory");
    },
    openLocalTimerSettings() {
      const timerControls = this.$refs.localTimerControls as unknown as {
        setTimer: () => Promise<void>;
      };
      void timerControls.setTimer();
    },
    openRoleDistribution() {
      const controls = this.$refs
        .roleDistributionControls as unknown as RoleDistributionControlsHandle;
      controls.openRoles();
    },
    openTypeDistribution() {
      const controls = this.$refs
        .roleDistributionControls as unknown as RoleDistributionControlsHandle;
      void controls.openTypes();
    },
    openBluffDistribution() {
      const controls = this.$refs
        .roleDistributionControls as unknown as RoleDistributionControlsHandle;
      controls.openBluffs();
    },
    openGrimoireDistribution() {
      const controls = this.$refs
        .roleDistributionControls as unknown as RoleDistributionControlsHandle;
      controls.openGrimoire();
    },
    toggleGrimoire(val?: boolean) {
      useAppStore().toggleGrimoire(val);
    },
    toggleMenu(val?: boolean) {
      const willOpen = typeof val === "boolean" ? val : !this.grimoire.isMenuOpen;
      if (willOpen && this.session.isChatOpen) {
        useSessionStore().setChatOpen(false);
      }
      useAppStore().toggleMenu(val);
    },
    toggleForwardEvilInfo(val?: boolean) {
      useAppStore().toggleForwardEvilInfo(val);
    },
    toggleMuted(val?: boolean) {
      useAppStore().toggleMuted(val);
    },
    toggleNightOrder(val?: boolean) {
      useAppStore().toggleNightOrder(val);
    },
    toggleStatic(val?: boolean) {
      useAppStore().toggleStatic(val);
    },
    setZoom(val: number) {
      useAppStore().setZoom(val);
    },
    toggleModal(name: string) {
      if (this.grimoire.isMenuOpen) {
        this.toggleMenu(false);
      }
      useAppStore().toggleModal(name);
    },
    hostSession() {
      const controls = this.$refs
        .roomSessionControls as unknown as RoomSessionControlsHandle;
      return controls.hostSession();
    },
    joinSession() {
      const controls = this.$refs
        .roomSessionControls as unknown as RoomSessionControlsHandle;
      return controls.joinSession();
    },
    copySessionUrl() {
      const controls = this.$refs
        .roomSessionControls as unknown as RoomSessionControlsHandle;
      controls.copySessionUrl();
    },
    async leaveSession() {
      if (this.isApiRoom) {
        useAppStore().toggleMenu(false);
        const confirmed = await requestInputModal({ inputType: "confirm", inputModal: "confirm", inputData: { name: ["确定要离开游戏吗？"] } }).catch(() => false);
        if (confirmed !== true) return;
        const controller = useGameController();
        if (controller.isConnected) {
          try {
            await controller.request(SocketClientEvent.LeaveRoom);
          } catch (error) {
            window.$toast.error(error instanceof Error ? error.message : "退出房间失败，请重试");
            return;
          }
        }
        controller.disconnect();
        await useVoiceController().disconnect();
        await this.$router.replace({ name: "RoomList" });
        return;
      }
      const controls = this.$refs
        .roomSessionControls as unknown as RoomSessionControlsHandle;
      return controls.leaveSession();
    },
    openSeatEditor() {
      useSeatEditorStore().show();
    },
    addPlayer(stImage: unknown = null, stName: string | null = null) {
      const controls = this.$refs
        .playerSeatControls as unknown as PlayerSeatControlsHandle;
      return controls.addPlayer(stImage, stName);
    },
    randomizeSeatings() {
      const controls = this.$refs
        .playerSeatControls as unknown as PlayerSeatControlsHandle;
      return controls.randomizeSeatings();
    },
    clearPlayers() {
      const controls = this.$refs
        .playerSeatControls as unknown as PlayerSeatControlsHandle;
      return controls.clearPlayers();
    },
    clearRoles() {
      const controls = this.$refs
        .playerSeatControls as unknown as PlayerSeatControlsHandle;
      return controls.clearRoles();
    },
    toggleNight() {
      const controls = this.$refs
        .gameTableFlowControls as unknown as GameTableFlowControlsHandle;
      controls.toggleNight();
    },
    goNight() {
      const controls = this.$refs
        .gameTableFlowControls as unknown as GameTableFlowControlsHandle;
      return controls.goNight();
    },
    showTownSquare() {
      const controls = this.$refs
        .gameTableFlowControls as unknown as GameTableFlowControlsHandle;
      controls.showTownSquare();
    },
    returnEveryoneToTown() {
      const controls = this.$refs
        .gameTableFlowControls as unknown as GameTableFlowControlsHandle;
      return controls.returnEveryoneToTown();
    },
    toggleIsReview() {
      const controls = this.$refs
        .gameTableFlowControls as unknown as GameTableFlowControlsHandle;
      return controls.toggleIsReview();
    },
    backToLobby() {
      const controls = this.$refs
        .roomSessionControls as unknown as RoomSessionControlsHandle;
      return controls.backToLobby();
    },
    toggleRaiseHand() {
      const controls = this.$refs
        .gameTableFlowControls as unknown as GameTableFlowControlsHandle;
      controls.toggleRaiseHand();
    },
  },
});
</script>

<style scoped lang="scss">
@use "../vars.scss" as *;

// success animation
@keyframes greenToWhite {
  from {
    color: green;
  }
  to {
    color: white;
  }
}

/* width */
::-webkit-scrollbar {
  width: 5px;
}
/* Handle */
::-webkit-scrollbar-thumb {
  background: rgb(54, 54, 54);
  border-radius: 10px;
}

/* Handle on hover */
::-webkit-scrollbar-thumb:hover {
  background: rgb(97, 97, 97);
}

// Controls
#controls {
  position: absolute;
  right: 14px;
  top: 12px;
  text-align: right;
  padding-right: 0;
  z-index: 110;
  color: white;

  svg {
    filter: drop-shadow(0 0 5px rgba(0, 0, 0, 1));
    &.success {
      animation: greenToWhite 1s normal forwards;
      animation-iteration-count: 1;
    }
  }

  > span {
    display: inline-block;
    cursor: pointer;
    z-index: 5;
    margin-top: 7px;
    margin-left: 10px;
  }

  span.nomlog-summary {
    color: $townsfolk;
  }

  span.session {
    color: $demon;
    &.spectator {
      color: $townsfolk;
    }
    &.reconnecting {
      animation: blink 1s infinite;
    }
  }

  > span,
  > .menu {
    display: none;
  }
}

@keyframes blink {
  50% {
    opacity: 0.5;
    color: gray;
  }
}

.room-topbar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-height: 52px;
}

:deep(.hud-icon),
.hud-cog {
  appearance: none;
  min-width: 44px;
  min-height: 44px;
  border: 1px solid rgba(192, 146, 74, 0.42);
  border-radius: 9px;
  background:
    linear-gradient(145deg, rgba(62, 37, 23, 0.92), rgba(24, 14, 12, 0.96)),
    #21130e;
  color: #f4e4bd;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 0;
  touch-action: manipulation;
  text-shadow: 0 2px 6px #050201;
  box-shadow:
    inset 0 1px 0 rgba(255, 230, 176, 0.1),
    0 3px 10px rgba(0, 0, 0, 0.38);
  transition:
    color 180ms ease,
    border-color 180ms ease,
    background-color 180ms ease,
    box-shadow 180ms ease;

  &:hover {
    border-color: rgba(226, 183, 102, 0.82);
    color: #fff0bf;
  }

  &:active {
    background: #160b08;
    box-shadow:
      inset 0 2px 7px rgba(0, 0, 0, 0.58),
      0 1px 4px rgba(0, 0, 0, 0.42);
  }
}

:deep(.hud-icon) {
  width: 44px;
  height: 44px;
  font-size: 20px;

  &.muted {
    color: #c794db;
  }

  &.connection {
    gap: 6px;
    width: auto;
    min-width: 58px;
    padding: 0 9px;
    font-size: 19px;

    span {
      color: #f7e9c8;
      font-size: 16px;
      font-weight: 700;
      line-height: 1;
    }

    &.reconnecting {
      animation: blink 1s infinite;
    }
  }
}

.hud-cog {
  width: 50px;
  height: 48px;
  border-color: rgba(196, 145, 64, 0.72);
  font-size: 24px;

  &:hover,
  &.active {
    border-color: #d3a04e;
    background:
      linear-gradient(145deg, rgba(91, 24, 31, 0.96), rgba(35, 12, 13, 0.98)),
      #3a1117;
    color: #ffe8b0;
    box-shadow:
      inset 0 0 0 1px rgba(255, 215, 135, 0.16),
      0 0 16px rgba(104, 14, 27, 0.34);
  }
}

.room-menu-panel {
  position: absolute;
  right: 0;
  top: 58px;
  z-index: 3;
  width: min(348px, calc(100vw - 28px));
  max-height: min(720px, calc(100dvh - 82px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #7d582d;
  border-radius: 12px 4px 12px 12px;
  background:
    radial-gradient(circle at 18% 0, rgba(139, 77, 36, 0.22), transparent 38%),
    repeating-linear-gradient(
      96deg,
      rgba(48, 27, 17, 0.98) 0 12px,
      rgba(34, 19, 14, 0.99) 12px 26px,
      rgba(25, 13, 11, 0.99) 26px 40px
    );
  box-shadow:
    0 18px 42px rgba(0, 0, 0, 0.68),
    0 0 0 2px #160b08,
    0 0 0 3px rgba(190, 140, 61, 0.35),
    inset 4px 0 0 #65141d,
    inset -1px 0 0 rgba(222, 177, 93, 0.24);
  color: #f7e8c7;
  isolation: isolate;
  backdrop-filter: blur(4px);
}

.room-menu-header {
  flex: 0 0 auto;
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 14px 10px 17px;
  border-bottom: 1px solid rgba(218, 171, 86, 0.36);
  background:
    linear-gradient(90deg, rgba(101, 20, 29, 0.58), transparent 38%),
    rgba(13, 7, 6, 0.58);
  text-align: left;
  text-shadow: 0 2px 6px #030101;

  > div {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  strong {
    color: #ffe8b3;
    font-family: var(--ts-font-heading, "Songti SC", "Noto Serif SC", serif);
    font-size: 21px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: 0.08em;
  }
}

.room-menu-kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #c9ad78;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.18em;
}

.room-phase {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  padding: 0 9px;
  border: 1px solid rgba(218, 171, 86, 0.45);
  border-radius: 999px;
  background: rgba(122, 83, 25, 0.28);
  color: #ffe4a1;
  font-size: 13px;
  font-weight: 700;

  &--night {
    border-color: rgba(171, 137, 207, 0.55);
    background: rgba(51, 35, 82, 0.5);
    color: #e2cef7;
  }
}

.room-menu-scroll {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 10px;
  scrollbar-width: thin;
  scrollbar-color: #8a602e rgba(12, 7, 5, 0.42);
}

.room-menu-group {
  overflow: hidden;
  border: 1px solid rgba(117, 75, 37, 0.72);
  border-radius: 8px;
  background:
    linear-gradient(rgba(255, 248, 220, 0.09), rgba(80, 43, 24, 0.06)),
    #d8c397;
  color: #21120e;
  box-shadow:
    inset 0 0 18px rgba(91, 48, 22, 0.16),
    0 4px 12px rgba(0, 0, 0, 0.28);

  + .room-menu-group {
    margin-top: 10px;
  }

  h2 {
    min-height: 30px;
    margin: 0;
    display: flex;
    align-items: center;
    padding: 0 12px;
    border-bottom: 1px solid rgba(83, 45, 24, 0.45);
    background:
      linear-gradient(90deg, rgba(101, 20, 29, 0.18), transparent 70%),
      rgba(95, 56, 31, 0.11);
    color: #5a1720;
    font-family: var(--ts-font-heading);
    font-size: 12px;
    font-weight: 800;
    line-height: 1.2;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
}

.room-menu-item {
  width: 100%;
  min-height: 52px;
  appearance: none;
  border: 0;
  border-bottom: 1px solid rgba(82, 44, 24, 0.28);
  background: rgba(255, 250, 226, 0.12);
  color: #271510;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 10px 0 5px;
  font-family: var(--ts-font-heading);
  font-size: 16px;
  font-weight: 650;
  line-height: 1.25;
  text-align: left;
  touch-action: manipulation;
  transition:
    color 160ms ease,
    background-color 160ms ease,
    box-shadow 160ms ease;

  &:last-child {
    border-bottom: 0;
  }

  &:hover {
    background: rgba(111, 19, 30, 0.13);
    color: #51131b;
    box-shadow: inset 0 0 18px rgba(247, 208, 120, 0.16);
  }

  &:active {
    background: rgba(111, 19, 30, 0.22);
  }

  &--danger {
    box-shadow: inset 4px 0 0 #7a1822;
  }

  &--danger:hover {
    box-shadow:
      inset 4px 0 0 #7a1822,
      inset 0 0 18px rgba(166, 60, 69, 0.18);
  }

  &--accent {
    box-shadow: inset 4px 0 0 #9c722d;
  }

  &--accent:hover {
    box-shadow:
      inset 4px 0 0 #9c722d,
      inset 0 0 18px rgba(247, 208, 120, 0.18);
  }

  &__lead {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 auto;

    > span:last-child {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__icon {
    width: 44px;
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 44px;
    color: #6d1b25;
    font-size: 17px;

    svg {
      filter: none;
    }
  }

  kbd {
    min-width: 34px;
    min-height: 26px;
    border-radius: 4px;
    border: 1px solid #805a2e;
    background: #2b1811;
    color: #f6dfaa;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    padding: 0 6px;
    font-family: var(--ts-font-heading);
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    text-shadow: none;
    box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.35);
  }
}

.room-menu-footer {
  min-height: 56px;
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-top: 1px solid rgba(218, 171, 86, 0.34);
  background:
    linear-gradient(180deg, rgba(104, 25, 32, 0.12), rgba(0, 0, 0, 0.18)),
    rgba(13, 7, 6, 0.66);

  button {
    min-width: 44px;
    min-height: 52px;
    appearance: none;
    border: 0;
    border-right: 1px solid rgba(218, 171, 86, 0.24);
    background: transparent;
    color: #eed49d;
    cursor: pointer;
    font-size: 20px;
    touch-action: manipulation;
    transition:
      color 160ms ease,
      background-color 160ms ease;

    &:last-child {
      border-right: 0;
    }

    &:hover {
      background: rgba(111, 19, 30, 0.38);
      color: #ffe9b2;
    }

    &:active {
      background: rgba(111, 19, 30, 0.58);
    }

    &:disabled {
      cursor: not-allowed;
      color: rgba(238, 212, 157, 0.3);
      background: transparent;
    }
  }
}

:deep(.hud-icon:focus-visible),
.hud-cog:focus-visible,
.room-menu-item:focus-visible,
.room-menu-footer button:focus-visible {
  position: relative;
  z-index: 2;
  outline: 2px solid #f7d98f;
  outline-offset: 2px;
  box-shadow:
    0 0 0 4px rgba(37, 14, 10, 0.9),
    0 0 0 6px rgba(247, 217, 143, 0.56);
}

.room-menu-enter-active,
.room-menu-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.room-menu-enter-from,
.room-menu-enter,
.room-menu-leave-to {
  opacity: 0;
  transform: translate3d(8px, -6px, 0) scale(0.985);
}

@media (max-width: 900px) {
  #controls {
    top: calc(max(8px, env(safe-area-inset-top)) + 58px);
    left: max(8px, env(safe-area-inset-left));
    right: max(8px, env(safe-area-inset-right));
    max-width: none;
  }

  .room-topbar {
    gap: 4px;
  }

  .room-menu-panel {
    top: 56px;
    width: min(304px, calc(100vw - 64px));
    max-height: min(64dvh, 520px);
  }

  .room-menu-header {
    min-height: 64px;
    padding: 8px 10px 8px 14px;

    strong {
      font-size: 18px;
    }
  }

  .room-menu-scroll {
    padding: 8px;
  }

  .room-menu-item {
    min-height: 48px;
    font-size: 15px;
  }

  .room-menu-footer {
    min-height: 52px;
  }
}

@media (max-width: 360px) {
  .room-menu-item kbd {
    display: none;
  }

  .room-phase {
    padding: 0 7px;
  }
}

@media (max-height: 560px) {
  .room-menu-panel {
    max-height: calc(100dvh - 72px);
  }

  .room-menu-header {
    min-height: 56px;
  }
}

/* StorytellerControls ships a dark-surface theme, but here it lives inside the
   light parchment room-menu group. Re-skin its buttons to read as parchment
   rows — dark ink on aged paper — so they match the R/Z rows below and clear
   the 4.5:1 contrast bar (the dark theme's pale text was washed out on paper). */
.room-menu-storyteller-controls {
  :deep(.storyteller-controls) {
    gap: 0;
  }

  :deep(.storyteller-action),
  :deep(.share-link) {
    min-height: 52px;
    padding: 0 10px 0 5px;
    gap: 8px;
    border: 0;
    border-bottom: 1px solid rgba(82, 44, 24, 0.28);
    border-radius: 0;
    background: rgba(255, 250, 226, 0.12);
    color: #271510;
    box-shadow: none;
    font-family: var(--ts-font-heading);
    font-size: 16px;
    font-weight: 650;
  }

  :deep(.storyteller-action:hover:not(:disabled)),
  :deep(.share-link:hover) {
    border-color: rgba(82, 44, 24, 0.28);
    background: rgba(111, 19, 30, 0.13);
    color: #51131b;
    box-shadow: inset 0 0 18px rgba(247, 208, 120, 0.16);
    transform: none;
  }

  :deep(.storyteller-action__icon) {
    width: 44px;
    height: 44px;
    flex-basis: 44px;
    color: #6d1b25;
    font-size: 17px;
    filter: none;
  }

  :deep(.storyteller-action--danger) {
    color: #6d1b25;
    border-color: rgba(82, 44, 24, 0.28);
    box-shadow: inset 4px 0 0 #7a1822;
  }

  :deep(.storyteller-action--danger:hover:not(:disabled)) {
    border-color: rgba(82, 44, 24, 0.28);
    background: rgba(111, 19, 30, 0.16);
    box-shadow:
      inset 4px 0 0 #7a1822,
      inset 0 0 18px rgba(166, 60, 69, 0.18);
  }

  :deep(.storyteller-action--danger .storyteller-action__icon) {
    color: #7a1822;
  }

  :deep(.storyteller-feedback) {
    padding: 6px 12px 0;
    color: #4a2f22;
  }
}

@media (prefers-reduced-motion: reduce) {
  :deep(.hud-icon),
  .hud-cog,
  .room-menu-item,
  .room-menu-footer button,
  .room-menu-enter-active,
  .room-menu-leave-active {
    transition: none;
  }

  :deep(.hud-icon.connection.reconnecting) {
    animation: none;
    border-color: #d5a04c;
  }
}

.menu {
  width: 220px;
  transform-origin: 200px 22px;
  transition: transform 500ms cubic-bezier(0.68, -0.55, 0.27, 1.55);
  transform: rotate(-90deg);
  position: absolute;
  right: 0;
  top: 0;

  &.open {
    transform: rotate(0deg);
  }

  > svg {
    cursor: pointer;
    background: rgba(0, 0, 0, 0.5);
    border: 3px solid black;
    width: 40px;
    height: 50px;
    margin-bottom: -8px;
    border-bottom: 0;
    border-radius: 10px 10px 0 0;
    padding: 5px 5px 15px;
  }

  a {
    color: white;
    text-decoration: none;
    &:hover {
      color: red;
    }
  }

  ul {
    display: flex;
    list-style-type: none;
    padding: 0;
    margin: 0;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 0 10px black;
    border: 3px solid black;
    border-radius: 10px 0 10px 10px;

    .options {
      overflow-y: auto;
      max-height: calc(85vh - 100px); /* Adjust this value as needed */
    }

    li {
      padding: 2px 5px;
      color: white;
      text-align: left;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 30px;

      .wrap {
        display: flex;
        flex-direction: column;
        flex-grow: 1;
      }

      .input {
        width: 45px; // Shrink the width significantly
        right: 0px;
        padding: 2px 3px; // Reduce padding
        border: 1px solid rgba(255, 255, 255, 0.3);
        // background: rgba(0, 0, 0, 0.5);
        background: white;
        color: black;
        text-align: right; // Ensure the number input content is right-aligned
        font-size: inherit; // Make it match the surrounding text font size
        line-height: inherit; // Make it match the surrounding text line height

        // Hide arrows for different browsers
        appearance: textfield; // Firefox
        &::-webkit-outer-spin-button,
        &::-webkit-inner-spin-button {
          -webkit-appearance: none; // Chrome, Safari, Edge
          margin: 0; // Remove margin that might be added by default
        }
      }

      &.menu-action-row {
        min-height: 44px;
        padding: 0;
      }

      .menu-action-button {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        width: 100%;
        min-height: 44px;
        padding: 6px 5px;
        border: 0;
        color: inherit;
        background: transparent;
        font: inherit;
        text-align: left;
        cursor: pointer;

        &:focus-visible {
          outline: 2px solid #f5d980;
          outline-offset: -3px;
        }
      }

      &.tabs {
        display: flex;
        padding: 0;
        svg {
          flex-grow: 1;
          flex-shrink: 0;
          height: 35px;
          border-bottom: 3px solid black;
          border-right: 3px solid black;
          padding: 5px 0;
          cursor: pointer;
          transition: color 250ms;
          &:hover {
            color: red;
          }
          &:last-child {
            border-right: 0;
          }
        }
        &.grimoire .fa-book-open,
        &.players .fa-users,
        &.game .fa-game,
        &.characters .fa-theater-masks,
        &.session .fa-broadcast-tower,
        &.help .fa-question {
          background: linear-gradient(
            to bottom,
            $townsfolk 0%,
            rgba(0, 0, 0, 0.5) 100%
          );
        }
      }

      &:not(.headline):not(.tabs):hover {
        cursor: pointer;
        color: red;
      }

      em {
        flex-grow: 0;
        font-style: normal;
        margin-left: 10px;
        font-size: 80%;
      }
    }

    .headline {
      font-family: var(--ts-font-display);
      letter-spacing: 1px;
      padding: 0 10px;
      text-align: center;
      justify-content: center;
      background: linear-gradient(
        to right,
        $townsfolk 0%,
        rgba(0, 0, 0, 0.5) 20%,
        rgba(0, 0, 0, 0.5) 80%,
        $demon 100%
      );
    }
  }
}
</style>

import type {
  GameConfig,
  GameRoomMetaInfo,
  GameState,
  LimitedRoomPlayerState,
} from "@/types";
import { defineStore } from "pinia";
import type {
  ServerDMElectionUpdateMessage,
  ServerGameEndMessage,
  ServerNightActionProgressMessage,
  ServerUserEnterMessage,
} from "@/types/socket";
import { useUserStore } from "./user";

export const useGameStore = defineStore("game", {
  state: () => ({
    // 游戏状态
    level: "prepare",
    levelDays: 0,
    levelStartFromDaytime: false,
    fabledRoleIds: [] as string[],
    roomTimer: null as import("@/types/storyteller").RoomTimerState | null,
    grimoireReveal: null as import("@/types/storyteller").GrimoireRevealState | null,
    grimoireRevealed: false,
    customRules: [] as string[],
    players: {} as Record<string, LimitedRoomPlayerState>,
    dms: {} as Record<string, LimitedRoomPlayerState>,
    seatCount: 0,
    seatRoles: {} as Record<number, { characterId: string; alignment?: 'good' | 'evil' }>,
    roomMeta: null as GameRoomMetaInfo | null,
    gameConfig: {} as GameConfig,
    roomUsers: {} as Record<string, ServerUserEnterMessage>,
    gameEnd: null as ServerGameEndMessage | null,
    dmElection: null as ServerDMElectionUpdateMessage | null,
    nightActionProgress: null as ServerNightActionProgressMessage | null,

    handSignals: {} as Record<string, string>,
    currentPlayer: null as LimitedRoomPlayerState | null,
  }),
  getters: {
    currentIsPlayer(state): boolean {
      return !!state.currentPlayer
    },
    currentIsDm(state): boolean {
      return state.currentPlayer?.isDM ?? false;
    },
    currentIsAlive(state): boolean {
      return state.currentPlayer?.isAlive ?? true;
    }
  },
  actions: {
    applyRoomMeta(roomMeta: GameRoomMetaInfo) {
      this.roomMeta = { ...roomMeta };
    },
    applyGameState(gameState: GameState) {
      this.roomTimer = gameState.roomTimer ? { ...gameState.roomTimer } : null;
      this.grimoireReveal = gameState.grimoireReveal ? { ...gameState.grimoireReveal, revealedUserIds: [...gameState.grimoireReveal.revealedUserIds] } : null;
      this.grimoireRevealed = gameState.grimoireRevealed ?? false;
      this.level = gameState.level;
      this.levelDays = gameState.levelDays;
      this.levelStartFromDaytime = gameState.levelStartFromDaytime;
      this.seatCount = gameState.seatCount;
      this.fabledRoleIds = [...(gameState.fabledRoleIds || [])];
      this.customRules = [...(gameState.customRules || [])];
      if (gameState.level !== "end") this.gameEnd = null;
      if (
        gameState.level !== "night"
        || this.nightActionProgress?.levelDays !== gameState.levelDays
      ) {
        this.nightActionProgress = null;
      }
    },
    applyGameEnd(gameEnd: ServerGameEndMessage) {
      this.gameEnd = {
        ...gameEnd,
        ...(gameEnd.winningPlayerIds
          ? { winningPlayerIds: [...gameEnd.winningPlayerIds] }
          : {}),
      };
    },
    applyGameConfig(gameConfig: GameConfig) {
      this.gameConfig = { ...gameConfig };
    },
    applyNightActionProgress(progress: ServerNightActionProgressMessage) {
      if (this.level !== "night" || progress.levelDays !== this.levelDays) return;
      if (
        this.nightActionProgress?.levelDays === progress.levelDays
        && this.nightActionProgress.updatedAt > progress.updatedAt
      ) return;
      this.nightActionProgress = {
        ...progress,
        completedActionIds: [...progress.completedActionIds],
        actionRecords: (progress.actionRecords ?? []).map((record) => ({
          ...record,
          targetUserIds: [...record.targetUserIds],
          ...(record.resolution
            ? {
                resolution: {
                  ...record.resolution,
                  effects: record.resolution.effects.map((effect) => ({ ...effect })),
                },
              }
            : {}),
        })),
      };
    },
    updateRoomUser(user: ServerUserEnterMessage) {
      this.roomUsers[user.userId] = { ...user };
    },
    deleteRoomUser(userId: string) {
      delete this.roomUsers[userId];
    },
    updatePlayer(userId: string, player: LimitedRoomPlayerState) {
      const currentUserId = useUserStore().userId;
      if (player.isDM) {
        this.dms[userId] = player;
        delete this.players[userId];
      } else {
        this.players[userId] = player;
        delete this.dms[userId];
      }
      if (userId === currentUserId) {
        this.currentPlayer = player;
      }
    },
    updatePlayers(playerList: LimitedRoomPlayerState[]) {
      for (const player of playerList) {
        this.updatePlayer(player.userId, player);
      }
    },
    replacePlayers(playerList: LimitedRoomPlayerState[]) {
      this.players = {};
      this.dms = {};
      this.currentPlayer = null;
      this.updatePlayers(playerList);
    },
    deletePlayer(userId: string) {
      delete this.players[userId];
      delete this.dms[userId];
      if (this.currentPlayer?.userId === userId) {
        this.currentPlayer = null;
      }
    },
    deletePlayers(userIds: string[]) {
      for (const userId of userIds) {
        delete this.players[userId];
        delete this.dms[userId];
      }
      if (this.currentPlayer && userIds.includes(this.currentPlayer.userId)) {
        this.currentPlayer = null;
      }
    },
    resetRoomState() {
      this.roomTimer = null;
      this.grimoireReveal = null;
      this.grimoireRevealed = false;
      this.handSignals = {};
      this.level = "prepare";
      this.levelDays = 0;
      this.levelStartFromDaytime = false;
      this.fabledRoleIds = [];
      this.customRules = [];
      this.players = {};
      this.dms = {};
      this.seatCount = 0;
      this.seatRoles = {};
      this.roomMeta = null;
      this.gameConfig = {};
      this.roomUsers = {};
      this.gameEnd = null;
      this.dmElection = null;
      this.nightActionProgress = null;
      this.currentPlayer = null;
    },
  },
});

import { useVoiceController } from "@/controllers/VoiceController";
import type { GameSocket } from "@/api/socket/game";
import { useAppStore } from "@/stores/app";
import { useGameStore } from "@/stores/game";
import { useGameScriptStore } from "@/stores/gameScript";
import { usePlayersStore } from "@/stores/players";
import { useRealtimeVoteStore } from "@/stores/realtimeVote";
import { useTableNominationStore } from "@/stores/tableNomination";
import { useRoomChatStore } from "@/stores/roomChat";
import { useRoomNotificationsStore } from "@/stores/roomNotifications";
import { useSessionStore } from "@/stores/session";
import { useUserStore } from "@/stores/user";
import type {
  GameConfig,
  GameRoomMetaInfo,
  GameState,
  LimitedRoomPlayerState,
  Player,
} from "@/types";
import {
  SocketClientEvent,
  SocketServerEvent,
  type LevelChangeClearMessage,
  type ServerDeleteMessageNotification,
  type ServerDayNominationStateMessage,
  type ServerApplyDoneMessage,
  type ServerDMMessage,
  type ServerDMElectionUpdateMessage,
  type ServerErrorMessage,
  type ServerGameEndMessage,
  type ServerGameScriptMessage,
  type ServerKickedMessage,
  type ServerNightActionProgressMessage,
  type ServerPlayerListMessage,
  type ServerPublicMessage,
  type ServerPlayerVoteResultMessage,
  type ServerPlayerVoteStartMessage,
  type ServerRoomCloseMessage,
  type ServerRoomWillCloseMessage,
  type ServerReceiveApplyMessage,
  type ServerStartVoteMessage,
  type ServerUserEnterMessage,
  type ServerUserLeaveMessage,
  type ServerVoteResultMessage,
  type ServerWhisperMessage,
} from "@/types/socket";

export type GameStateBridgeCallbacks = {
  onRoomWillClose?: (payload: ServerRoomWillCloseMessage) => void;
  onRoomClose?: (payload: ServerRoomCloseMessage) => void;
  onKicked?: (payload: ServerKickedMessage) => void;
  onServerError?: (payload: ServerErrorMessage) => void;
  onReceiveApply?: (payload: ServerReceiveApplyMessage) => void;
  onApplyDone?: (payload: ServerApplyDoneMessage) => void;
};

const createEmptyPlayer = (): Player => ({
  name: "",
  id: "",
  image: "",
  role: { id: "" },
  isAllowRole: true,
  isWraith: false,
  isUsingWraith: false,
  reminders: [],
  stReminders: [],
  isVoteless: false,
  isSecretVoteless: false,
  isDead: false,
  votes: 1,
  pronouns: "",
  newMessages: 0,
  chatGroup: "",
  isTalking: false,
});

export function bindGameStateBridge(
  socket: GameSocket,
  callbacks: GameStateBridgeCallbacks = {},
): () => void {
  const appStore = useAppStore();
  const gameStore = useGameStore();
  const gameScriptStore = useGameScriptStore();
  const playersStore = usePlayersStore();
  const realtimeVoteStore = useRealtimeVoteStore();
  const roomChatStore = useRoomChatStore();
  const sessionStore = useSessionStore();
  const userStore = useUserStore();
  const notifications = useRoomNotificationsStore();
  notifications.enterRoom(JSON.stringify([sessionStore.gameServerId, sessionStore.sessionId]));
  notifications.add({ key: 'room-joined', message: `已加入房间 ${sessionStore.sessionId}` });

  const onHandSignals = (payload: { signals: Record<string, string> }) => { gameStore.handSignals = { ...payload.signals }; };
  const onSeatRoles = (payload: { roles: Record<number, { characterId: string; alignment?: 'good' | 'evil' }> }) => {
    gameStore.seatRoles = { ...payload.roles };
    syncLegacyPlayers();
  };
  const onVoiceOverview = (payload: import("@/types/socket").ServerVoiceRoomOverviewMessage) => { useVoiceController().applyRoomOverview(payload); };
  const liveUsers = new Map<string, ServerUserEnterMessage>();
  const requestedProfiles = new Set<string>();
  let active = true;
  let publicHistoryGeneration = 0;
  const onRoomWillClose = (payload: ServerRoomWillCloseMessage) => {
    const closesAt = new Date(Date.now() + Math.max(0, payload.countdown) * 1000)
      .toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    notifications.add({ key: 'room-will-close', tone: 'warning', sticky: true,
      message: `${payload.reason ? `${payload.reason}。` : ''}房间将在 ${closesAt} 关闭。` });
    callbacks.onRoomWillClose?.(payload);
  };
  const onRoomClose = callbacks.onRoomClose || (() => {});
  const onKicked = callbacks.onKicked || (() => {});
  const onServerError = (payload: ServerErrorMessage) => {
    notifications.add({ key: 'server-error', tone: 'error', message: payload.message || '游戏服务器返回了错误' });
    callbacks.onServerError?.(payload);
  };
  const onReceiveApply = callbacks.onReceiveApply || (() => {});
  const onApplyDone = callbacks.onApplyDone || (() => {});

  const playerDisplayName = (userId: string): string =>
    liveUsers.get(userId)?.displayName ||
    userStore.getUserById(userId)?.displayName ||
    userId;

  const playerAvatar = (userId: string): string =>
    userStore.getUserById(userId)?.avatarUrl || "";

  const toLegacyPlayer = (player: LimitedRoomPlayerState): Player => {
    const remainingGhostVotes = player.voteChancesAfterDeath ?? (player.ghostVoteUsed ? 0 : 1);
    const roleId = player.characterId || "";
    const normalizedRoleId = roleId
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const role = roleId
      ? appStore.roles.get(roleId) ||
        appStore.roles.get(normalizedRoleId) ||
        appStore.rolesJSONbyId.get(roleId) ||
        { id: roleId }
      : { id: "" };

    return {
      ...createEmptyPlayer(),
      ...player,
      id: player.userId,
      name: player.extras?.isTestPlayer === true
        ? String(player.extras.testPlayerName || `虚拟玩家 ${player.seat}`)
        : playerDisplayName(player.userId),
      image: playerAvatar(player.userId),
      role: player.privateExtras?.alignment === 'good' || player.privateExtras?.alignment === 'evil'
        ? { ...role, alignment: player.privateExtras.alignment }
        : role,
      isDead: !player.isAlive,
      isVoteless:
        !player.isAlive && remainingGhostVotes <= 0,
      votes: player.isAlive ? 1 : remainingGhostVotes,
      reminders: [...(player.marks || [])],
    };
  };

  const syncLegacyPlayers = (): void => {
    const serverPlayers = Object.values(gameStore.players);
    const maxOccupiedSeat = serverPlayers.reduce(
      (max, player) => Math.max(max, Number(player.seat) || 0),
      0,
    );
    const seatCount = Math.max(0, gameStore.seatCount, maxOccupiedSeat);
    const seats = Array.from({ length: seatCount }, createEmptyPlayer);
    for (const [seat, reserved] of Object.entries(gameStore.seatRoles)) {
      if (!seats[Number(seat) - 1]) continue;
      const role = appStore.roles.get(reserved.characterId) || appStore.rolesJSONbyId.get(reserved.characterId) || { id: reserved.characterId };
      seats[Number(seat) - 1].role = { ...role, ...(reserved.alignment ? { alignment: reserved.alignment } : {}) };
    }

    for (const player of serverPlayers) {
      const seatIndex = Number(player.seat) - 1;
      if (seatIndex >= 0 && seatIndex < seats.length) {
        seats[seatIndex] = toLegacyPlayer(player);
      }
    }

    playersStore.set(seats);
    sessionStore.setPlayerCount(
      [...serverPlayers, ...Object.values(gameStore.dms)]
        .filter((player) => player.connected).length,
    );

    const currentPlayer = gameStore.currentPlayer;
    if (!currentPlayer?.isDM && gameStore.grimoireReveal && !gameStore.grimoireReveal.resultPublished) gameStore.gameEnd = null;
    if (currentPlayer?.isDM) {
      sessionStore.setSpectator(false);
      sessionStore.claimSeat(-1);
    } else if (currentPlayer && currentPlayer.seat > 0) {
      sessionStore.setSpectator(true);
      sessionStore.claimSeat(currentPlayer.seat - 1);
    } else {
      sessionStore.setSpectator(true);
      sessionStore.claimSeat(-1);
    }
    sessionStore.setPing(currentPlayer?.ping ?? 0);
  };

  const syncLegacyFabled = (): void => {
    const roles = gameStore.fabledRoleIds.map(
      (roleId) => appStore.fabled.get(roleId) || { id: roleId },
    );
    // API 房间的传奇角色由服务端维护，不注入本地模式使用的 storyteller 占位角色。
    playersStore.setFabled({ fabled: roles, emptyFabled: true });
  };

  const hydrateProfiles = (players: LimitedRoomPlayerState[]): void => {
    const userIds = players
      .filter((player) => player.extras?.isTestPlayer !== true)
      .map((player) => player.userId)
      .filter((userId) => {
        if (requestedProfiles.has(userId) || userStore.getUserById(userId)) {
          return false;
        }
        requestedProfiles.add(userId);
        return true;
      });

    if (userIds.length === 0) return;
    void userStore.getUsersInfo(userIds).then(() => {
      if (active) syncLegacyPlayers();
    });
  };

  const onRoomMeta = (roomMeta: GameRoomMetaInfo): void => {
    gameStore.applyRoomMeta(roomMeta);
    sessionStore.setRoomMeta(roomMeta);
  };

  const onGameState = (gameState: GameState): void => {
    if (gameState.level === 'prepare' && gameStore.level !== 'prepare') {
      realtimeVoteStore.reset();
      useTableNominationStore().$reset();
      sessionStore.resetGameRoundState();
      playersStore.bluffs = [];
    }
    gameStore.applyGameState(gameState);
    sessionStore.applyServerGameState(gameState);
    appStore.toggleNight(gameState.level === "night");
    syncLegacyFabled();
    syncLegacyPlayers();
  };

  const onGameConfig = (gameConfig: GameConfig): void => {
    gameStore.applyGameConfig(gameConfig);
  };

  const onNightActionProgress = (payload: ServerNightActionProgressMessage): void => {
    gameStore.applyNightActionProgress(payload);
  };

  const onGameEnd = (payload: ServerGameEndMessage): void => {
    gameStore.applyGameEnd(payload);
    realtimeVoteStore.reset();
  };

  const onGameScript = (payload: ServerGameScriptMessage): void => {
    gameScriptStore.applyGameScript(payload.scriptId, payload.script);
    if (!payload.script) return;

    appStore.setCustomRoles(
      payload.script.characters as unknown as Array<Record<string, unknown>>,
    );
    appStore.setTeamsNames({
      ...appStore.teamsNames,
      ...(payload.script.customLabels || {}),
    });
    appStore.setEdition({
      id: `api-${payload.scriptId || "custom"}`,
      name: payload.script.name,
      author: payload.script.author || "",
      logo: payload.script.logo || "",
      roles: payload.script.characters.map((character) => character.id),
    });
    syncLegacyFabled();
    syncLegacyPlayers();
  };

  const onPlayerList = (payload: ServerPlayerListMessage): void => {
    const wasDm = gameStore.currentIsDm;
    if (payload.isUpdate) {
      gameStore.updatePlayers(payload.players);
      gameStore.deletePlayers(payload.removed || []);
    } else {
      gameStore.replacePlayers(payload.players);
    }
    if (wasDm && !gameStore.currentIsDm) gameStore.seatRoles = {};
    syncLegacyPlayers();
    hydrateProfiles(payload.players);
  };

  const onUserEnter = (payload: ServerUserEnterMessage): void => {
    liveUsers.set(payload.userId, payload);
    gameStore.updateRoomUser(payload);
    syncLegacyPlayers();
  };

  const onUserLeave = (payload: ServerUserLeaveMessage): void => {
    liveUsers.delete(payload.userId);
    gameStore.deleteRoomUser(payload.userId);
    syncLegacyPlayers();
  };

  const onPublicMessage = (payload: ServerPublicMessage): void => {
    sessionStore.addPublicMessage(payload);
  };

  const onWhisperMessage = (payload: ServerWhisperMessage): void => {
    const targetUserId = payload.senderUserId === userStore.userId
      ? payload.toUserId
      : payload.senderUserId;
    roomChatStore.addMessage("whisper", targetUserId, payload);
  };

  const onDMMessage = (payload: ServerDMMessage): void => {
    roomChatStore.addMessage(
      payload.channel === "skill" ? "dm_skill" : "dm_chat",
      payload.playerUserId,
      payload,
    );
  };

  const onStartVote = (payload: ServerStartVoteMessage): void => {
    realtimeVoteStore.startVote(payload);
  };

  const onPlayerVoteStart = (payload: ServerPlayerVoteStartMessage): void => {
    realtimeVoteStore.startPlayerTurn(payload);
  };

  const onPlayerVoteResult = (payload: ServerPlayerVoteResultMessage): void => {
    realtimeVoteStore.recordPlayerVote(payload);
  };

  const onVoteResult = (payload: ServerVoteResultMessage): void => {
    realtimeVoteStore.completeVote(payload);
  };

  const onDayNominationState = (payload: ServerDayNominationStateMessage): void => {
    realtimeVoteStore.syncDayNominationState(payload);
  };

  const onDeleteMessage = (payload: ServerDeleteMessageNotification): void => {
    if (payload.channel === "public") {
      sessionStore.removePublicMessage(payload.messageId);
    } else {
      roomChatStore.removeMessage(payload.messageId);
    }
  };

  const onLevelChangeClearMessage = (payload: LevelChangeClearMessage): void => {
    if (payload.types.includes("public")) {
      sessionStore.clearPublicMessages();
    }
    if (payload.types.includes("whisper")) {
      roomChatStore.clearChannel("whisper");
    }
    if (payload.types.includes("dm_chat")) {
      roomChatStore.clearChannel("dm_chat");
    }
    if (payload.types.includes("dm_skill")) {
      roomChatStore.clearChannel("dm_skill");
    }
  };

  const loadPublicMessageHistory = (): void => {
    const generation = ++publicHistoryGeneration;
    void (async () => {
      const knownMessageIds = new Set(
        sessionStore.publicMessages.map((message) => message.messageId),
      );
      const history = [] as ServerPublicMessage[];
      let untilMessageId: number | undefined;

      // The server returns 20 messages per page. Fetch at most five pages so
      // a longer reconnect can heal gaps while the client remains bounded.
      for (let page = 0; page < 5; page += 1) {
        const response = await socket.request(SocketClientEvent.GetMessageHistory, {
          channel: "public",
          ...(untilMessageId === undefined ? {} : { untilMessageId }),
        });
        if (!active || generation !== publicHistoryGeneration) return;

        const messages = response.data?.messages || [];
        history.unshift(...messages);
        if (
          messages.length < 20 ||
          messages.some((message) => knownMessageIds.has(message.messageId))
        ) {
          break;
        }

        const numericIds = messages
          .map((message) => Number(message.messageId))
          .filter((messageId) => Number.isFinite(messageId));
        if (numericIds.length === 0) break;
        untilMessageId = Math.min(...numericIds);
      }

      if (!active || generation !== publicHistoryGeneration) return;
      sessionStore.setPublicMessages([
        ...history,
        ...sessionStore.publicMessages,
      ]);
    })()
      .catch((error) => {
        if (!active || generation !== publicHistoryGeneration) return;
        onServerError({
          code: 0,
          event: SocketClientEvent.GetMessageHistory,
          message: error instanceof Error ? error.message : "无法加载公聊记录",
        });
      });
  };

  const refreshAuthoritativeState = (): void => {
    void socket.request(SocketClientEvent.RefreshGameState).catch((error) => {
      if (!active) return;
      onServerError({
        code: 0,
        event: SocketClientEvent.RefreshGameState,
        message: error instanceof Error ? error.message : "无法重新同步房间状态",
      });
    });
  };

  const onSocketConnected = (): void => {
    notifications.add({ key: 'room-connection', message: '房间连接已恢复' });
    refreshAuthoritativeState();
    loadPublicMessageHistory();
  };
  const onSocketDisconnected = (): void => {
    notifications.add({ key: 'room-connection', tone: 'warning', message: '房间连接已断开，正在重新连接…' });
  };

  const onDMElectionUpdate = (payload: ServerDMElectionUpdateMessage): void => {
    gameStore.dmElection = payload.applicantUserId ? { ...payload } : null;
  };
  socket.on(SocketServerEvent.DMElectionUpdate, onDMElectionUpdate);
  socket.on(SocketServerEvent.HandSignals, onHandSignals);
  socket.on(SocketServerEvent.SeatRoles, onSeatRoles);
  socket.on(SocketServerEvent.VoiceRoomOverview, onVoiceOverview);
  socket.on(SocketServerEvent.RoomMeta, onRoomMeta);
  socket.on(SocketServerEvent.ReceiveApply, onReceiveApply);
  socket.on(SocketServerEvent.ApplyDone, onApplyDone);
  socket.on(SocketServerEvent.GameState, onGameState);
  socket.on(SocketServerEvent.GameConfig, onGameConfig);
  socket.on(SocketServerEvent.NightActionProgress, onNightActionProgress);
  socket.on(SocketServerEvent.GameEnd, onGameEnd);
  socket.on(SocketServerEvent.GameScript, onGameScript);
  socket.on(SocketServerEvent.PlayerList, onPlayerList);
  socket.on(SocketServerEvent.UserEnter, onUserEnter);
  socket.on(SocketServerEvent.UserLeave, onUserLeave);
  socket.on(SocketServerEvent.PublicMessage, onPublicMessage);
  socket.on(SocketServerEvent.WhisperMessage, onWhisperMessage);
  socket.on(SocketServerEvent.DMMessage, onDMMessage);
  socket.on(SocketServerEvent.StartVote, onStartVote);
  socket.on(SocketServerEvent.PlayerVoteStart, onPlayerVoteStart);
  socket.on(SocketServerEvent.PlayerVoteResult, onPlayerVoteResult);
  socket.on(SocketServerEvent.VoteResult, onVoteResult);
  socket.on(SocketServerEvent.DayNominationState, onDayNominationState);
  socket.on(SocketServerEvent.DeleteMessage, onDeleteMessage);
  socket.on(SocketServerEvent.LevelChangeClearMessage, onLevelChangeClearMessage);
  socket.on(SocketServerEvent.RoomWillClose, onRoomWillClose);
  socket.on(SocketServerEvent.RoomClose, onRoomClose);
  socket.on(SocketServerEvent.Kicked, onKicked);
  socket.on(SocketServerEvent.Error, onServerError);
  socket.on("socket:connected", onSocketConnected);
  socket.on("socket:disconnected", onSocketDisconnected);

  return () => {
    active = false;
    socket.off(SocketServerEvent.DMElectionUpdate, onDMElectionUpdate);
    gameStore.dmElection = null;
    socket.off(SocketServerEvent.HandSignals, onHandSignals);
    socket.off(SocketServerEvent.SeatRoles, onSeatRoles);
    socket.off(SocketServerEvent.VoiceRoomOverview, onVoiceOverview);
    gameStore.handSignals = {};
    socket.off(SocketServerEvent.RoomMeta, onRoomMeta);
    socket.off(SocketServerEvent.ReceiveApply, onReceiveApply);
    socket.off(SocketServerEvent.ApplyDone, onApplyDone);
    socket.off(SocketServerEvent.GameState, onGameState);
    socket.off(SocketServerEvent.GameConfig, onGameConfig);
    socket.off(SocketServerEvent.NightActionProgress, onNightActionProgress);
    socket.off(SocketServerEvent.GameEnd, onGameEnd);
    socket.off(SocketServerEvent.GameScript, onGameScript);
    socket.off(SocketServerEvent.PlayerList, onPlayerList);
    socket.off(SocketServerEvent.UserEnter, onUserEnter);
    socket.off(SocketServerEvent.UserLeave, onUserLeave);
    socket.off(SocketServerEvent.PublicMessage, onPublicMessage);
    socket.off(SocketServerEvent.WhisperMessage, onWhisperMessage);
    socket.off(SocketServerEvent.DMMessage, onDMMessage);
    socket.off(SocketServerEvent.StartVote, onStartVote);
    socket.off(SocketServerEvent.PlayerVoteStart, onPlayerVoteStart);
    socket.off(SocketServerEvent.PlayerVoteResult, onPlayerVoteResult);
    socket.off(SocketServerEvent.VoteResult, onVoteResult);
    socket.off(SocketServerEvent.DayNominationState, onDayNominationState);
    socket.off(SocketServerEvent.DeleteMessage, onDeleteMessage);
    socket.off(SocketServerEvent.LevelChangeClearMessage, onLevelChangeClearMessage);

    socket.off(SocketServerEvent.RoomWillClose, onRoomWillClose);
    socket.off(SocketServerEvent.RoomClose, onRoomClose);
    socket.off(SocketServerEvent.Kicked, onKicked);
    socket.off(SocketServerEvent.Error, onServerError);
    socket.off("socket:connected", onSocketConnected);
    socket.off("socket:disconnected", onSocketDisconnected);
  };
}

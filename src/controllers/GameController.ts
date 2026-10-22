import { GameSocket } from "@/api/socket/game";
import {
  SocketClientEvent,
  type ClientDMAssignRandomCharacterMessage,
  type ClientDMChangeLevelMessage,
  type ClientDMUpdateNightActionMessage,
  type ClientDMEndGameMessage,
  type ClientDMForceLeaveSitMessage,
  type ClientDMFinalizeDayMessage,
  type ClientDMSetExecutionMarkerMessage,
  type ClientDMKickUserMessage,
  type ClientDMSetSeatCountMessage,
  type ClientDMStartVoteMessage,
  type ClientDMSwapPlayerMessage,
  type ClientDMUpdateConfigMessage,
  type ClientDMSetFabledMessage,
  type ClientDMUpdateScriptMessage,
  type ClientDMUpdatePlayerMessage,
  type ClientDMVoteControlMessage,
  type ClientSubmitVoteMessage,
  type DMInvitePlayerMessage,
  type SocketRequestEvent,
  type SocketRequestPayloadMap,
  type SocketRequestResponseMap,
} from "@/types/socket";
import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";

export type GameConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export type GameServerConnectionOptions = {
  roomId: string;
  gameServerId: string;
  gameServerUrl: string;
  token: string;
};

type LegacyConnectionMetadata = {
  roomId?: string;
  gameServerId?: string;
};

type RequestOptions = {
  timeout?: number;
};

type ControllerRequestArgs<E extends SocketRequestEvent> =
  SocketRequestPayloadMap[E] extends undefined
    ? [event: E, opts?: RequestOptions]
    : [event: E, data: SocketRequestPayloadMap[E], opts?: RequestOptions];

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export const useGameController = defineStore("gameController", () => {
  const gameSocket = shallowRef<GameSocket | null>(null);
  const connectionStatus = ref<GameConnectionStatus>("idle");
  const roomId = ref<string | null>(null);
  const gameServerId = ref<string | null>(null);
  const gameServerUrl = ref<string | null>(null);
  const errorMessage = ref<string | null>(null);
  const disconnectReason = ref<string | null>(null);
  const reconnectAttempt = ref(0);
  const isConnected = computed(() => (
    connectionStatus.value === "connected" && gameSocket.value !== null
  ));

  // Every replacement or explicit close advances this id. Event handlers from
  // an older socket can therefore never mutate the state of the new session.
  let connectionId = 0;

  function isCurrentConnection(socket: GameSocket, id: number): boolean {
    return connectionId === id && gameSocket.value === socket;
  }

  function bindSocketEvents(socket: GameSocket, id: number): void {
    socket.on("socket:connected", () => {
      if (!isCurrentConnection(socket, id)) return;

      connectionStatus.value = "connected";
      errorMessage.value = null;
      disconnectReason.value = null;
      reconnectAttempt.value = 0;
    });

    socket.on("socket:disconnected", (reason) => {
      if (!isCurrentConnection(socket, id)) return;

      connectionStatus.value = "disconnected";
      disconnectReason.value = reason;
      reconnectAttempt.value = 0;
    });

    socket.on("socket:reconnecting", (attempt) => {
      if (!isCurrentConnection(socket, id)) return;

      connectionStatus.value = "reconnecting";
      disconnectReason.value = null;
      reconnectAttempt.value = attempt;
    });

    socket.on("socket:error", (error) => {
      if (!isCurrentConnection(socket, id)) return;

      connectionStatus.value = "error";
      errorMessage.value = getErrorMessage(error);
    });
  }

  function closeCurrentSocket(): number {
    const socket = gameSocket.value;
    const nextConnectionId = ++connectionId;

    // Clear the identity before close(), because socket.io may synchronously
    // emit a disconnect event while closing.
    gameSocket.value = null;
    socket?.close();

    return nextConnectionId;
  }

  function normalizeConnectionOptions(
    options: GameServerConnectionOptions | string,
    token?: string,
    metadata: LegacyConnectionMetadata = {},
  ): GameServerConnectionOptions {
    if (typeof options !== "string") {
      return options;
    }

    return {
      roomId: metadata.roomId ?? "",
      gameServerId: metadata.gameServerId ?? "",
      gameServerUrl: options,
      token: token ?? "",
    };
  }

  function connectToGameServer(options: GameServerConnectionOptions): GameSocket;
  function connectToGameServer(
    gameServerUrl: string,
    token: string,
    metadata?: LegacyConnectionMetadata,
  ): GameSocket;
  function connectToGameServer(
    optionsOrUrl: GameServerConnectionOptions | string,
    legacyToken?: string,
    legacyMetadata?: LegacyConnectionMetadata,
  ): GameSocket {
    const options = normalizeConnectionOptions(optionsOrUrl, legacyToken, legacyMetadata);
    const id = closeCurrentSocket();

    roomId.value = options.roomId || null;
    gameServerId.value = options.gameServerId || null;
    gameServerUrl.value = options.gameServerUrl || null;
    connectionStatus.value = "connecting";
    errorMessage.value = null;
    disconnectReason.value = null;
    reconnectAttempt.value = 0;

    if (!options.gameServerUrl || !options.token) {
      const error = new Error("Missing game server URL or connection token");
      connectionStatus.value = "error";
      errorMessage.value = error.message;
      throw error;
    }

    try {
      // The token is deliberately passed directly to GameSocket and is never
      // copied into reactive state or persisted in browser storage.
      const socket = new GameSocket(options.gameServerUrl, options.token);
      gameSocket.value = socket;
      bindSocketEvents(socket, id);
      return socket;
    } catch (error) {
      connectionStatus.value = "error";
      errorMessage.value = getErrorMessage(error);
      gameSocket.value = null;
      throw error;
    }
  }

  function disconnect(): void {
    closeCurrentSocket();
    connectionStatus.value = "disconnected";
    errorMessage.value = null;
    disconnectReason.value = "client disconnect";
    reconnectAttempt.value = 0;
  }

  function request<E extends SocketRequestEvent>(
    ...args: ControllerRequestArgs<E>
  ): Promise<SocketRequestResponseMap[E]> {
    const socket = gameSocket.value;
    if (!socket || connectionStatus.value !== "connected") {
      return Promise.reject(new Error("Not connected to a game server"));
    }

    return socket.request(...args);
  }

  function refreshGameState() {
    return request(SocketClientEvent.RefreshGameState);
  }

  function enterSeat(seat: number) {
    return request(SocketClientEvent.EnterSit, { seat });
  }

  function leaveSeat() {
    return request(SocketClientEvent.LeaveSit);
  }

  function updatePlayer(payload: ClientDMUpdatePlayerMessage) {
    return request(SocketClientEvent.DMUpdatePlayer, payload);
  }

  function swapPlayers(payload: ClientDMSwapPlayerMessage) {
    return request(SocketClientEvent.DMSwapPlayer, payload);
  }

  function forceLeaveSeat(payload: ClientDMForceLeaveSitMessage) {
    return request(SocketClientEvent.DMForceLeaveSit, payload);
  }

  function kickUser(payload: ClientDMKickUserMessage) {
    return request(SocketClientEvent.DMKickUser, payload);
  }

  function changeLevel(payload: ClientDMChangeLevelMessage) {
    return request(SocketClientEvent.DMChangeLevel, payload);
  }

  function updateNightAction(payload: ClientDMUpdateNightActionMessage) {
    return request(SocketClientEvent.DMUpdateNightAction, payload);
  }

  function updateScript(payload: ClientDMUpdateScriptMessage) {
    return request(SocketClientEvent.DMUpdateScript, payload);
  }

  function assignRandomCharacters(payload: ClientDMAssignRandomCharacterMessage) {
    return request(SocketClientEvent.DMAssignRandomCharacter, payload);
  }

  function updateConfig(payload: ClientDMUpdateConfigMessage) {
    return request(SocketClientEvent.DMUpdateConfig, payload);
  }

  function setFabled(payload: ClientDMSetFabledMessage) {
    return request(SocketClientEvent.DMSetFabled, payload);
  }

  function endGame(payload: ClientDMEndGameMessage) {
    return request(SocketClientEvent.DMEndGame, payload);
  }

  function invitePlayer(payload: DMInvitePlayerMessage) {
    return request(SocketClientEvent.DMInvitePlayer, payload);
  }

  function setSeatCount(payload: ClientDMSetSeatCountMessage) {
    return request(SocketClientEvent.DMSetSeatCount, payload);
  }

  function startVote(payload: ClientDMStartVoteMessage) {
    return request(SocketClientEvent.DMStartVote, payload);
  }

  function skipVoter(payload: ClientDMVoteControlMessage = {}) {
    return request(SocketClientEvent.DMSkipVoter, payload);
  }

  function pauseVote(payload: ClientDMVoteControlMessage = {}) {
    return request(SocketClientEvent.DMPauseVote, payload);
  }

  function resumeVote(payload: ClientDMVoteControlMessage = {}) {
    return request(SocketClientEvent.DMResumeVote, payload);
  }

  function cancelVote(payload: ClientDMVoteControlMessage = {}) {
    return request(SocketClientEvent.DMCancelVote, payload);
  }

  function finalizeDay(payload: ClientDMFinalizeDayMessage) {
    return request(SocketClientEvent.DMFinalizeDay, payload);
  }

  function setExecutionMarker(payload: ClientDMSetExecutionMarkerMessage) {
    return request(SocketClientEvent.DMSetExecutionMarker, payload);
  }

  function submitVote(payload: ClientSubmitVoteMessage) {
    return request(SocketClientEvent.SubmitVote, payload);
  }

  function reset(): void {
    closeCurrentSocket();
    connectionStatus.value = "idle";
    roomId.value = null;
    gameServerId.value = null;
    gameServerUrl.value = null;
    errorMessage.value = null;
    disconnectReason.value = null;
    reconnectAttempt.value = 0;
  }

  return {
    gameSocket,
    connectionStatus,
    roomId,
    gameServerId,
    gameServerUrl,
    errorMessage,
    disconnectReason,
    reconnectAttempt,
    isConnected,
    connectToGameServer,
    disconnect,
    reset,
    request,
    refreshGameState,
    enterSeat,
    leaveSeat,
    updatePlayer,
    swapPlayers,
    forceLeaveSeat,
    kickUser,
    changeLevel,
    updateNightAction,
    updateScript,
    assignRandomCharacters,
    updateConfig,
    setFabled,
    endGame,
    invitePlayer,
    setSeatCount,
    startVote,
    skipVoter,
    pauseVote,
    resumeVote,
    cancelVote,
    finalizeDay,
    setExecutionMarker,
    submitVote,
  };
});

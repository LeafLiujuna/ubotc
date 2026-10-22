import { defineStore } from "pinia";
import { computed, ref, shallowRef, watch } from "vue";
import { readSettings, writeSettings } from "@/utils/settingsStorage";
import type { AudioInputSettings } from "@/services/voice/mediaSettings";
import { checkVoicePreflight } from "@/services/voice/preflight";
import { useGameController } from "./GameController";
import { useGameStore } from "@/stores/game";
import { useAppStore } from "@/stores/app";
import { useUserStore } from "@/stores/user";
import { useRoomNotificationsStore } from "@/stores/roomNotifications";
import { playChime, type ChimeVoice } from "@/utils/chime";
import { useSessionStore } from "@/stores/session";
import { VoiceService } from "@/services/voice";
import {
  SocketClientEvent,
  SocketServerEvent,
  type ServerVoiceRoomJoinMessage,
  type ServerVoiceRoomInviteResultMessage,
  type ServerVoiceRoomOverviewMessage,
  type ServerVoiceRoomUserStateMessage,
  type ServerReceiveApplyMessage,
  type ServerVoiceWillReturnToPublicRoomMessage,
  type VoicePublicRoomJoinResData,
  type VoiceRoomUserInfo,
} from "@/types/socket";
import type { ConnectParams, RoomType, VoiceRole, VoiceState } from "@/services/voice/types";
import { GameSocket } from "@/api/socket/game";

type ConnectOptions = {
  role?: VoiceRole;
  liveKitEndpoint?: string;
};

type RemoteVoiceState = {
  userId: string;
  roomId: string;
  isRemoteSelfMuted: boolean;
  isRemoteAdminMuted: boolean;
  isRemoteSpeakerMuted: boolean;
  isLocallyMutedByMe: boolean;
  isSpeaking: boolean;
  isMicMuted: boolean;
  effectiveVolume: number;
  effectivePlaybackMuted: boolean;
};

export const useVoiceController = defineStore("voiceController", () => {
  const saved = readSettings("ts-voice-settings:v1", {
    microphoneVolume: 100, speakerVolume: 100, speakingMode: "open-mic",
    microphoneDeviceId: "", autoGainControl: true,
    noiseSuppression: true, echoCancellation: true,
  });
  const microphoneDeviceId = ref(saved.microphoneDeviceId);
  const autoGainControl = ref(saved.autoGainControl);
  const noiseSuppression = ref(saved.noiseSuppression);
  const echoCancellation = ref(saved.echoCancellation);
  const service = shallowRef<VoiceService | null>(null);
  const boundSocket = shallowRef<GameSocket | null>(null);
  const socketBound = ref(false);
  let detachSocketEvents: (() => void) | null = null;
  let connecting: Promise<void> | null = null;
  let disconnecting: Promise<void> | null = null;
  let mediaGeneration = 0;
  let roomTransition: Promise<void> = Promise.resolve();
  const returnTimer = ref<ReturnType<typeof setTimeout> | null>(null);

  const publicRoomId = ref("");
  const broadcastRoomId = ref("");
  const currentActiveRoomId = ref("");
  const liveKitEndpoint = ref<string>((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_LIVEKIT_ENDPOINT
    ?? (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_LIVEKIT_URL
    ?? "");
  let advertisedEndpoint = "";

  /** 语音频道 */
  const voiceChannels = {
    main: null as VoiceService | null,
    broadcast: null as VoiceService | null,
  };

  const roomDirectory = ref<Record<string, { scene: string; users: VoiceRoomUserInfo[]; access?: "open" | "invite"; allowedUserIds?: string[] }>>({});
  const outgoingInvites = ref<Array<{ chatRoomId: string; userId: string; status: "pending" | ServerVoiceRoomInviteResultMessage["status"] }>>([]);
  const waitingForInvite = computed(() => outgoingInvites.value.some(invite => invite.status === "pending"));
  const selectingInvitee = ref(false);
  const inviteSending = ref(false);
  const inviteError = ref("");
  const incomingInvites = ref<ServerReceiveApplyMessage[]>([]);
  const respondingInviteId = ref("");
  function startInviteSelection() {
    const game = useGameStore();
    if ((!game.currentPlayer && !game.currentIsDm) || game.level === "night" || waitingForInvite.value || inviteSending.value) return;
    inviteError.value = "";
    selectingInvitee.value = !selectingInvitee.value;
  }
  async function selectInvitee(userId: string) {
    if (!selectingInvitee.value || inviteSending.value) return;
    const game = useGameStore();
    if (!userId || userId === useUserStore().userId || game.roomUsers[userId]?.disconnectedAt || (!game.players[userId] && !game.dms[userId])) return;
    inviteSending.value = true;
    inviteError.value = "";
    try {
      await createVoiceRoom([userId], "聊天");
      selectingInvitee.value = false;
    } catch (error) {
      inviteError.value = error instanceof Error ? error.message : "发送私聊请求失败，请重试";
    } finally { inviteSending.value = false; }
  }
  function receiveInvite(apply: ServerReceiveApplyMessage) {
    if (!incomingInvites.value.some(item => item.applyId === apply.applyId)) incomingInvites.value.push(apply);
    selectingInvitee.value = false;
  }
  function finishInvite(applyId: string) {
    incomingInvites.value = incomingInvites.value.filter(item => item.applyId !== applyId);
  }
  async function respondToInvite(applyId: string, accept: boolean) {
    if (respondingInviteId.value || !incomingInvites.value.some(item => item.applyId === applyId)) return;
    respondingInviteId.value = applyId;
    inviteError.value = "";
    try {
      if (accept) await ensureConnected();
      await getGameSocket()!.request(SocketClientEvent.RespondApply, { applyId, accept });
      finishInvite(applyId);
      if (!accept) voiceChime("decline");
    } catch (error) {
      inviteError.value = error instanceof Error ? error.message : "处理私聊请求失败，请重试";
    } finally { respondingInviteId.value = ""; }
  }
  async function cancelInvite(chatRoomId: string) {
    await getGameSocket()?.request(SocketClientEvent.VoiceRoomLeave, { chatRoomId });
    for (const invite of outgoingInvites.value) {
      if (invite.chatRoomId === chatRoomId && invite.status === "pending") invite.status = "cancelled";
    }
  }
  watch(() => useGameStore().level, (level) => {
    if (level === "night") selectingInvitee.value = false;
  });
  function voiceChime(cue: ChimeVoice) {
    const settings = useAppStore().grimoire;
    playChime(cue, { muted: settings.isMuted, volume: settings.soundVolume });
  }
  const remoteVoiceStates = ref<Record<string, RemoteVoiceState>>({});
  const speakingByRoom: Record<RoomType, Map<string, boolean>> = {
    active: new Map(), broadcast: new Map(),
  };
  const localMutedUsers = ref<Record<string, boolean>>({});

  /** 扬声器静音 */
  const speakerMuted = ref(false);
  /** 麦克风静音 */
  const microphoneMuted = ref(true);
  const canUseMicrophone = computed(() => {
    const game = useGameStore();
    const session = useSessionStore();
    return session.gameServerId || useGameController().gameSocket
      ? game.currentIsDm || Boolean(game.currentPlayer && game.currentPlayer.seat > 0)
      : !session.isSpectator || session.claimedSeat >= 0;
  });
  const currentVoiceRole = computed<VoiceRole>(() => !canUseMicrophone.value
    ? 'guest' : useGameStore().currentIsDm ? 'dm' : 'player');
  /** 是否允许发言 */
  const allowSpeaking = ref(false);
  /** 是否允许在广播频道发言 */
  const allowBroadcastSpeaking = ref(false);

  /** 麦克风音量，范围 0-200 */
  const microphoneVolume = ref(clamp(saved.microphoneVolume, 0, 200));
  /** 扬声器音量，范围 0-200 */
  const speakerVolume = ref(clamp(saved.speakerVolume, 0, 200));

  /** 配置其他用户的音量 */
  const userVolumeSettings = ref<Record<string, number>>({});

  /** 说话模式 */
  const speakingMode = ref<"push-to-talk" | "vad" | "open-mic">(
    saved.speakingMode === "vad" || saved.speakingMode === "push-to-talk" ? saved.speakingMode : "open-mic",
  );
  watch([microphoneVolume, speakerVolume, speakingMode, microphoneDeviceId,
    autoGainControl, noiseSuppression, echoCancellation], () => {
    writeSettings("ts-voice-settings:v1", { microphoneVolume: microphoneVolume.value, speakerVolume: speakerVolume.value,
      speakingMode: speakingMode.value, microphoneDeviceId: microphoneDeviceId.value,
      autoGainControl: autoGainControl.value, noiseSuppression: noiseSuppression.value, echoCancellation: echoCancellation.value });
  });

  /** 正在发言的频道 */
  const speakingChannel = ref<string>("main");

  /** 麦克风权限是否已授予 */
  const microphonePermissionGranted = ref(false);

  const connectionStatus = ref<Record<string, string>>({
    active: "idle",
    broadcast: "idle",
  });

  function dispatchVoiceEvent(name: string, detail?: unknown) {
    window.dispatchEvent(new CustomEvent(`voice:${name}`, { detail }));
  }

  function reportVoiceRequestError(stage: string, error: unknown) {
    dispatchVoiceEvent("error", {
      stage,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function getGameSocket(): GameSocket | null {
    const gameController = useGameController();
    return gameController.gameSocket as GameSocket | null;
  }

  function ensureRemoteState(userId: string, roomId = currentActiveRoomId.value || publicRoomId.value): RemoteVoiceState {
    const current = remoteVoiceStates.value[userId];
    if (current) {
      return current;
    }

    const created: RemoteVoiceState = {
      userId,
      roomId,
      isRemoteSelfMuted: false,
      isRemoteAdminMuted: false,
      isRemoteSpeakerMuted: false,
      isLocallyMutedByMe: false,
      isSpeaking: false,
      isMicMuted: false,
      effectiveVolume: userVolumeSettings.value[userId] ?? 100,
      effectivePlaybackMuted: false,
    };

    remoteVoiceStates.value[userId] = created;
    return created;
  }

  function applyPlaybackForUser(userId: string) {
    const currentService = service.value;
    if (!currentService) {
      return;
    }

    const state = ensureRemoteState(userId);
    state.isLocallyMutedByMe = localMutedUsers.value[userId] ?? false;
    state.effectiveVolume = userVolumeSettings.value[userId] ?? 100;

    const forceMuted = speakerMuted.value
      || state.isRemoteSelfMuted
      || state.isRemoteAdminMuted
      || state.isLocallyMutedByMe;

    state.effectivePlaybackMuted = forceMuted;
    currentService.setRemoteParticipantMuted(userId, forceMuted);

    const userGain = clamp(state.effectiveVolume / 100, 0, 2);
    const masterGain = clamp(speakerVolume.value / 100, 0, 2);
    currentService.setRemoteParticipantVolume(userId, forceMuted ? 0 : userGain * masterGain);
  }

  function applyPlaybackForAllUsers() {
    for (const userId of Object.keys(remoteVoiceStates.value)) {
      applyPlaybackForUser(userId);
    }
  }

  function applySocketMuteState(roomId: string, payload: VoiceRoomUserInfo) {
    const state = ensureRemoteState(payload.userId, roomId);
    state.roomId = roomId;
    state.isRemoteSelfMuted = payload.muted;
    state.isRemoteAdminMuted = payload.mutedByAdmin;
    state.isRemoteSpeakerMuted = payload.speakerMuted;

    applyPlaybackForUser(payload.userId);
    dispatchVoiceEvent("remoteMuteStateUpdated", {
      roomId,
      userId: payload.userId,
      muted: payload.muted,
      mutedByAdmin: payload.mutedByAdmin,
      speakerMuted: payload.speakerMuted,
    });
  }

  function updateByVoiceState(state: VoiceState) {
    microphoneMuted.value = state.isMicMuted;
    speakerMuted.value = state.isSpeakerMuted;
    allowBroadcastSpeaking.value = state.role === "dm" || state.role === "admin";

    if (state.isDMMutedByServer && allowBroadcastSpeaking.value) {
      allowSpeaking.value = false;
      return;
    }

    allowSpeaking.value = canUseMicrophone.value && state.role !== 'guest' && !state.isMicMuted;
  }

  // Losing a seat immediately stops publishing, including an already-open mic.
  watch(currentVoiceRole, (role, previousRole) => {
    if (role === 'guest') {
      microphoneMuted.value = true;
      allowSpeaking.value = false;
    }
    void service.value?.setRole(role).catch(error => reportVoiceRequestError('voiceRole', error));
    if (previousRole === 'guest' && role !== 'guest' && connectionStatus.value.active === 'connected') {
      void connect().catch(error => reportVoiceRequestError('voiceRoleReconnect', error));
    }
  });

  function bindVoiceServiceEvents(currentService: VoiceService) {
    currentService.on("state:changed", updateByVoiceState);

    currentService.on("participants:changed", (roomType, participants) => {
      speakingByRoom[roomType].clear();
      for (const participant of participants) {
        speakingByRoom[roomType].set(participant.userId, participant.isSpeaking);
        const state = ensureRemoteState(participant.userId);
        if (participant.isLocal) {
          continue;
        }
        state.isMicMuted = participant.isMicMuted;
      }
      refreshSpeakingStates();
      applyPlaybackForAllUsers();
    });

    currentService.on("speaking:changed", (userId, isSpeaking, roomType) => {
      ensureRemoteState(userId);
      speakingByRoom[roomType].set(userId, isSpeaking);
      refreshSpeakingStates();
    });

    currentService.on("connection:changed", (roomType, status) => {
      connectionStatus.value[roomType] = status;
      if (status !== "connected") {
        speakingByRoom[roomType].clear();
        refreshSpeakingStates();
      }
      dispatchVoiceEvent("connectionStateChanged", { roomType, status });
    });

    currentService.on("auth:tokenExpired", (roomType, roomId) => {
      dispatchVoiceEvent("tokenExpired", { roomType, roomId });
    });

    currentService.on("lifecycle:switchedToPublic", (roomId) => {
      currentActiveRoomId.value = roomId;
      dispatchVoiceEvent("switchedToPublic", { roomId });
    });
  }

  function refreshSpeakingStates() {
    // A listener shares both channels with the storyteller. Silence in one
    // channel must not erase ongoing speech in the other channel.
    for (const state of Object.values(remoteVoiceStates.value)) {
      state.isSpeaking = Boolean(speakingByRoom.active.get(state.userId) || speakingByRoom.broadcast.get(state.userId));
    }
  }

  function clearSpeakingStates() {
    speakingByRoom.active.clear();
    speakingByRoom.broadcast.clear();
    refreshSpeakingStates();
  }

  function applyRoomOverview(payload: ServerVoiceRoomOverviewMessage) {
      if (!payload.isUpdate) {
        roomDirectory.value = {};
      }

      for (const room of payload.rooms) {
        roomDirectory.value[room.chatRoomId] = {
          scene: room.scene,
          access: room.access, allowedUserIds: room.allowedUserIds,
          users: room.users,
        };

        for (const user of room.users) {
          applySocketMuteState(room.chatRoomId, user);
        }
      }

      if (payload.removed) {
        for (const removedRoomId of payload.removed) {
          delete roomDirectory.value[removedRoomId];
        }
      }
  }

  function bindSocketEvents(gameSocket: GameSocket) {
    if (socketBound.value && boundSocket.value === gameSocket) return;
    detachSocketEvents?.();
    const onState = (payload: ServerVoiceRoomUserStateMessage) => applySocketMuteState(payload.roomId, payload);
    const onJoin = (payload: ServerVoiceRoomJoinMessage) => {
      const generation = mediaGeneration;
      roomTransition = roomTransition.catch(() => {}).then(async () => {
        if (!service.value || generation !== mediaGeneration) return;
        try {
          await service.value.connectToPrivateRoom({ roomId: payload.chatRoomId, token: payload.token });
          if (generation === mediaGeneration) {
            const changed = currentActiveRoomId.value !== payload.chatRoomId;
            currentActiveRoomId.value = payload.chatRoomId;
            await syncLocalMuteState();
            if (changed) voiceChime("voiceJoin");
          }
          else await service.value.disconnect();
        } catch (error) {
          if (generation !== mediaGeneration) return;
          reportVoiceRequestError("joinPrivateRoom", error);
          window.$toast?.error("语音连接失败，正在返回广场");
          await connect().catch(() => undefined);
        }
      });
    };
    const onReturn = (payload: ServerVoiceWillReturnToPublicRoomMessage) => {
      dispatchVoiceEvent("forcedReturnCountdown", payload);
      if (returnTimer.value) clearTimeout(returnTimer.value);
      returnTimer.value = setTimeout(() => {
        void backToPublicRoom().catch(error => reportVoiceRequestError("returnPublic", error));
      }, Math.max(0, payload.countdown) * 1000);
    };
    let reconnectVoice = false;
    const onInviteResult = (payload: ServerVoiceRoomInviteResultMessage) => {
      const existing = outgoingInvites.value.find(invite => invite.chatRoomId === payload.chatRoomId && invite.userId === payload.userId);
      if (existing?.status === payload.status) return;
      if (existing) existing.status = payload.status;
      else outgoingInvites.value.push(payload);
      const name = useGameStore().roomUsers[payload.userId]?.displayName || useUserStore().getUserById(payload.userId)?.displayName || "对方";
      const descriptions = { accepted: "已同意私聊", rejected: "拒绝了私聊邀请", timeout: "未回应，私聊邀请已超时", cancelled: "的私聊邀请已取消", failed: "的私聊邀请失败，请重试" };
      useRoomNotificationsStore().add({ key: `voice-invite:${payload.chatRoomId}:${payload.userId}`, message: `${name}${descriptions[payload.status]}` });
      if (payload.status !== "accepted") voiceChime("decline");
    };
    const onDisconnected = () => {
      reconnectVoice = Boolean(connecting || (service.value && currentActiveRoomId.value));
      void disconnect();
    };
    const onConnected = () => {
      if (!reconnectVoice) return;
      reconnectVoice = false;
      void ensureConnected().catch(error => reportVoiceRequestError("reconnect", error));
    };
    gameSocket.on(SocketServerEvent.VoiceRoomOverview, applyRoomOverview);
    gameSocket.on(SocketServerEvent.VoiceRoomUserState, onState);
    gameSocket.on(SocketServerEvent.VoiceRoomJoin, onJoin);
    gameSocket.on(SocketServerEvent.VoiceRoomInviteResult, onInviteResult);
    gameSocket.on(SocketServerEvent.VoiceWillReturnToPublicRoom, onReturn);
    gameSocket.on("socket:disconnected", onDisconnected);
    gameSocket.on("socket:connected", onConnected);
    detachSocketEvents = () => {
      gameSocket.off(SocketServerEvent.VoiceRoomOverview, applyRoomOverview);
      gameSocket.off(SocketServerEvent.VoiceRoomUserState, onState);
      gameSocket.off(SocketServerEvent.VoiceRoomJoin, onJoin);
      gameSocket.off(SocketServerEvent.VoiceRoomInviteResult, onInviteResult);
      gameSocket.off(SocketServerEvent.VoiceWillReturnToPublicRoom, onReturn);
      gameSocket.off("socket:disconnected", onDisconnected);
      gameSocket.off("socket:connected", onConnected);
    };
    boundSocket.value = gameSocket;
    socketBound.value = true;
  }

  async function checkMicrophonePermission() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("麦克风需要 HTTPS 或 localhost，请使用安全地址打开房间。");
    try {
      const permissionStatus = await navigator.permissions?.query({ name: "microphone" as PermissionName });
      if (!permissionStatus) throw new Error("Permissions API unavailable");
      microphonePermissionGranted.value = permissionStatus.state === "granted";
      permissionStatus.onchange = () => {
        microphonePermissionGranted.value = permissionStatus.state === "granted";
      };
    } catch {
      microphonePermissionGranted.value = false;
    }

    if (!microphonePermissionGranted.value) {
      dispatchVoiceEvent("permissionPrompt", { permission: "microphone" });
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: {
          deviceId: microphoneDeviceId.value || undefined,
          autoGainControl: autoGainControl.value, noiseSuppression: noiseSuppression.value,
          echoCancellation: echoCancellation.value,
        } });
        stream.getTracks().forEach(track => track.stop());
        microphonePermissionGranted.value = true;
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        throw new Error(name === "NotAllowedError" ? "麦克风权限被拒绝，请在浏览器地址栏允许麦克风。"
          : name === "NotFoundError" ? "没有检测到麦克风，请连接设备后重试。"
          : "无法打开麦克风，请检查设备是否被占用以及浏览器权限。");
      }
    }
  }

  function getLiveKitEndpoint(): string {
    return liveKitEndpoint.value;
  }

  async function connect(options?: ConnectOptions) {
    if (connecting) return connecting;
    const generation = mediaGeneration;
    connecting = connectNow(options).catch(async error => {
      if (generation === mediaGeneration) {
        currentActiveRoomId.value = "";
        connectionStatus.value = { active: "failed", broadcast: "failed" };
        await service.value?.disconnect();
      }
      throw error;
    }).finally(() => { connecting = null; });
    return connecting;
  }
  async function connectNow(options?: ConnectOptions) {
    if (disconnecting) await disconnecting;
    const generation = mediaGeneration;
    const gameSocket = getGameSocket();
    if (!gameSocket) {
      throw new Error("尚未连接到游戏服务器，请进入房间后再连接语音。");
    }

    bindSocketEvents(gameSocket);

    if (options?.liveKitEndpoint) {
      liveKitEndpoint.value = options.liveKitEndpoint;
    }

    const res = await gameSocket.request(SocketClientEvent.VoicePublicRoomJoin);
    const join = res as { status?: number; message?: string; data?: VoicePublicRoomJoinResData };
    if (join.status !== 200 || !join.data) {
      dispatchVoiceEvent("error", { stage: "voicePublicRoomJoin", response: res });
      throw new Error(join.message || "无法加入语音房间，请稍后重试。");
    }

    if (generation !== mediaGeneration) return;
    // A deployment can advertise its public voice URL without rebuilding the frontend.
    const configuredEndpoint = liveKitEndpoint.value !== advertisedEndpoint ? liveKitEndpoint.value : "";
    const endpoint = options?.liveKitEndpoint || configuredEndpoint || join.data.liveKitEndpoint || "";
    const preflight = await checkVoicePreflight(endpoint, { requireMicrophone: false });
    if (!preflight.ok) throw new Error(preflight.message);
    liveKitEndpoint.value = endpoint;
    advertisedEndpoint = configuredEndpoint || options?.liveKitEndpoint ? "" : endpoint;
    publicRoomId.value = join.data.publicRoomId;
    broadcastRoomId.value = join.data.dmBroadcastRoomId;

    if (!service.value) {
      service.value = new VoiceService();
      bindVoiceServiceEvents(service.value);
      voiceChannels.main = service.value;
      voiceChannels.broadcast = service.value;
    }

    const muted = microphoneMuted.value;
    const mutedSpeaker = speakerMuted.value;
    await service.value.setRole(currentVoiceRole.value);
    await service.value.setMicMuted(muted);
    await service.value.setSpeakMode(speakingMode.value === "push-to-talk" ? "ptt" : speakingMode.value === "vad" ? "vad" : "open");
    service.value.setSpeakerMuted(mutedSpeaker);
    await service.value.connect({
      liveKitEndpoint: liveKitEndpoint.value,
      publicRoomId: join.data.publicRoomId,
      publicRoomToken: join.data.publicRoomToken,
      broadcastRoomId: join.data.dmBroadcastRoomId,
      broadcastRoomToken: join.data.dmBroadcastRoomToken,
      role: currentVoiceRole.value === 'guest' ? 'guest' : options?.role ?? currentVoiceRole.value,
    } satisfies ConnectParams);

    if (generation !== mediaGeneration) { await service.value.disconnect(); return; }
    await service.value.setRole(currentVoiceRole.value);
    currentActiveRoomId.value = join.data.publicRoomId;
    await applyAudioSettings();
    await setSpeakingChannel(useGameStore().currentIsDm && speakingChannel.value === "broadcast" ? "broadcast" : "main");
    await service.value.setMicMuted(microphoneMuted.value);
    await service.value.setSpeakMode(speakingMode.value === "push-to-talk" ? "ptt" : speakingMode.value === "vad" ? "vad" : "open");
    service.value.setSpeakerMuted(speakerMuted.value);

    applyPlaybackForAllUsers();
    await syncLocalMuteState();
  }

  async function syncLocalMuteState() {
    if (!currentActiveRoomId.value || !canUseMicrophone.value) return;
    await getGameSocket()?.request(SocketClientEvent.VoiceUpdateMuteState, {
      chatRoomId: currentActiveRoomId.value, muted: microphoneMuted.value, speakerMuted: speakerMuted.value,
    });
  }

  async function disconnect() {
    selectingInvitee.value = false;
    incomingInvites.value = [];
    outgoingInvites.value = [];
    mediaGeneration += 1;
    clearSpeakingStates();
    currentActiveRoomId.value = "";
    connectionStatus.value = { active: "idle", broadcast: "idle" };
    if (returnTimer.value) {
      clearTimeout(returnTimer.value);
      returnTimer.value = null;
    }
    if (!disconnecting) disconnecting = Promise.resolve(service.value?.disconnect()).finally(() => { disconnecting = null; });
    await disconnecting;
  }

  function resetRoomView() {
    selectingInvitee.value = false;
    incomingInvites.value = [];
    inviteError.value = "";
    outgoingInvites.value = [];
    clearSpeakingStates();
    detachSocketEvents?.(); detachSocketEvents = null;
    socketBound.value = false; boundSocket.value = null;
    roomDirectory.value = {}; remoteVoiceStates.value = {}; localMutedUsers.value = {};
    publicRoomId.value = ""; broadcastRoomId.value = "";
  }
  async function backToPublicRoom() {
    if (!service.value) return;
    // Serialize with private joins and refresh both channel tokens on return.
    const generation = mediaGeneration;
    roomTransition = roomTransition.catch(() => {}).then(async () => {
      if (generation === mediaGeneration) {
        const wasPrivate = currentActiveRoomId.value && currentActiveRoomId.value !== publicRoomId.value;
        await connect();
        if (wasPrivate && generation === mediaGeneration) voiceChime("voiceLeave");
      }
    });
    await roomTransition;
  }

  async function setMicrophoneMuted(muted: boolean) {
    if (!muted && !canUseMicrophone.value) throw new Error('旁观者只能收听，不能开麦。');
    if (!muted && connectionStatus.value.active !== "connected") await ensureConnected();
    const previous = microphoneMuted.value;
    if (!muted) await checkMicrophonePermission();
    microphoneMuted.value = muted;
    try { await service.value?.setMicMuted(muted); }
    catch (error) {
      microphoneMuted.value = previous;
      await service.value?.setMicMuted(previous).catch(() => {});
      throw error;
    }

    const gameSocket = getGameSocket();
    if (gameSocket && currentActiveRoomId.value && canUseMicrophone.value) {
      void gameSocket
        .request(SocketClientEvent.VoiceUpdateMuteState, {
          chatRoomId: currentActiveRoomId.value,
          muted,
        })
        .catch((error) => reportVoiceRequestError("voiceUpdateMicrophoneMute", error));
    }
  }

  function setSpeakerMuted(muted: boolean) {
    speakerMuted.value = muted;
    service.value?.setSpeakerMuted(muted);
    applyPlaybackForAllUsers();

    const gameSocket = getGameSocket();
    if (gameSocket && currentActiveRoomId.value && canUseMicrophone.value) {
      void gameSocket
        .request(SocketClientEvent.VoiceUpdateMuteState, {
          chatRoomId: currentActiveRoomId.value,
          speakerMuted: muted,
        })
        .catch((error) => reportVoiceRequestError("voiceUpdateSpeakerMute", error));
    }
  }

  function setSpeakerVolume(volume: number) {
    speakerVolume.value = clamp(Math.round(volume), 0, 200);
    applyPlaybackForAllUsers();
  }

  function setMicrophoneVolume(volume: number) {
    microphoneVolume.value = clamp(Math.round(volume), 0, 200);
    void applyAudioSettings().catch(error => reportVoiceRequestError("microphoneGain", error));
  }

  function audioSettings(): AudioInputSettings {
    return { deviceId: microphoneDeviceId.value, volume: microphoneVolume.value,
      autoGainControl: autoGainControl.value, noiseSuppression: noiseSuppression.value, echoCancellation: echoCancellation.value };
  }
  let audioUpdate: Promise<void> = Promise.resolve();
  async function applyAudioSettings(): Promise<void> {
    const settings = audioSettings();
    audioUpdate = audioUpdate.catch(() => {}).then(() => service.value?.configureAudio(settings));
    await audioUpdate;
  }
  async function setAudioOptions(options: Partial<AudioInputSettings>): Promise<void> {
    const previous = audioSettings();
    const assign = (next: Partial<AudioInputSettings>) => {
      if (next.deviceId !== undefined) microphoneDeviceId.value = next.deviceId;
      if (next.autoGainControl !== undefined) autoGainControl.value = next.autoGainControl;
      if (next.noiseSuppression !== undefined) noiseSuppression.value = next.noiseSuppression;
      if (next.echoCancellation !== undefined) echoCancellation.value = next.echoCancellation;
    };
    assign(options);
    try { await applyAudioSettings(); }
    catch (error) { assign(previous); throw error; }
  }

  function setUserVolume(userId: string, volume: number) {
    userVolumeSettings.value[userId] = clamp(Math.round(volume), 0, 200);
    applyPlaybackForUser(userId);
  }

  async function setSpeakingMode(mode: "push-to-talk" | "vad" | "open-mic") {
    speakingMode.value = mode;
    const mappedMode = mode === "push-to-talk" ? "ptt" : mode === "open-mic" ? "open" : "vad";
    await service.value?.setSpeakMode(mappedMode);
  }

  async function setSpeakingChannel(channel: "main" | "broadcast") {
    if (channel === "broadcast" && !useGameStore().currentIsDm) throw new Error("只有说书人可以广播。");
    await service.value?.setActiveSpeakingRoom(channel === "broadcast" ? "broadcast" : "active");
    speakingChannel.value = channel;
  }

  async function pttPress() {
    if (!canUseMicrophone.value || microphoneMuted.value) return;
    await service.value?.pttPress();
  }

  async function pttRelease() {
    await service.value?.pttRelease();
  }

  function toggleLocalMuteUser(userId: string, muted?: boolean) {
    const next = muted ?? !(localMutedUsers.value[userId] ?? false);
    localMutedUsers.value[userId] = next;
    const state = ensureRemoteState(userId);
    state.isLocallyMutedByMe = next;
    applyPlaybackForUser(userId);
  }

  async function adminSetUserMute(userId: string, mute: boolean, chatRoomId = currentActiveRoomId.value) {
    const gameSocket = getGameSocket();
    if (!gameSocket || !chatRoomId) {
      return;
    }

    try {
      await gameSocket.request(SocketClientEvent.DMVoiceSetUserMute, {
        userId,
        mute,
        chatRoomId,
      });
      dispatchVoiceEvent("adminActionResult", { type: "DMVoiceSetUserMute", success: true, userId, mute, chatRoomId });
    } catch (error) {
      dispatchVoiceEvent("adminActionResult", {
        type: "DMVoiceSetUserMute",
        success: false,
        userId,
        mute,
        chatRoomId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function adminSetAllMute(mute: boolean, chatRoomId = currentActiveRoomId.value) {
    const gameSocket = getGameSocket();
    if (!gameSocket || !chatRoomId) {
      return;
    }

    try {
      await gameSocket.request(SocketClientEvent.DMVoiceSetAllMute, {
        mute,
        chatRoomId,
      });
      dispatchVoiceEvent("adminActionResult", { type: "DMVoiceSetAllMute", success: true, mute, chatRoomId });
    } catch (error) {
      dispatchVoiceEvent("adminActionResult", {
        type: "DMVoiceSetAllMute",
        success: false,
        mute,
        chatRoomId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function createVoiceRoom(toUserIds: string[], scene?: string) {
    if (waitingForInvite.value) throw new Error("已有私聊邀请正在等待回应");
    await ensureConnected();
    const gameSocket = getGameSocket();
    if (!gameSocket) {
      return;
    }

    const response = await gameSocket.request(SocketClientEvent.VoiceRoomCreate, {
      toUserIds,
      scene,
    });
    const chatRoomId = response.data?.chatRoomId;
    if (!chatRoomId) return;
    outgoingInvites.value = outgoingInvites.value.filter(invite => invite.status === "pending" || invite.chatRoomId === chatRoomId);
    for (const userId of response.data?.invitedUserIds ?? [...new Set(toUserIds)]) {
      if (!outgoingInvites.value.some(invite => invite.chatRoomId === chatRoomId && invite.userId === userId)) {
        outgoingInvites.value.push({ chatRoomId, userId, status: "pending" });
      }
    }
    voiceChime("invite");
  }

  async function inviteToVoiceRoom(chatRoomId: string, toUserIds: string[]) {
    const gameSocket = getGameSocket();
    if (!gameSocket) {
      return;
    }

    await gameSocket.request(SocketClientEvent.VoiceRoomInvite, {
      chatRoomId,
      toUserIds,
    });
  }

  async function joinVoiceRoom(chatRoomId: string) {
    await ensureConnected();
    if (chatRoomId === "townsquare" || chatRoomId === publicRoomId.value) return backToPublicRoom();
    const gameSocket = getGameSocket();
    if (!gameSocket) {
      return;
    }

    await gameSocket.request(
      SocketClientEvent.VoiceRoomApplyJoin,
      { chatRoomId },
    );
  }

  async function leaveVoiceRoom(chatRoomId = currentActiveRoomId.value) {
    const gameSocket = getGameSocket();
    if (!gameSocket || !chatRoomId) {
      return;
    }

    await gameSocket.request(SocketClientEvent.VoiceRoomLeave, { chatRoomId });

    // 默认反回公共频道
    await backToPublicRoom();
  }

  async function ensureConnected() {
    if (!getGameSocket()) throw new Error("房间尚未连接");
    if (connecting) await connecting;
    if (disconnecting) await disconnecting;
    if (!service.value || connectionStatus.value.active !== "connected") await connect();
  }
  async function joinPlace(placeId: string) {
    await ensureConnected();
    await getGameSocket()!.request(SocketClientEvent.VoicePlaceJoin, { placeId });
  }

  return {
    selectingInvitee, inviteSending, inviteError, incomingInvites, respondingInviteId,
    startInviteSelection, selectInvitee, receiveInvite, finishInvite, respondToInvite, cancelInvite,
    outgoingInvites, waitingForInvite,
    applyRoomOverview, joinPlace, ensureConnected, resetRoomView,
    microphoneDeviceId, autoGainControl, noiseSuppression, echoCancellation,
    setAudioOptions,
    service,
    voiceChannels,
    roomDirectory,
    remoteVoiceStates,
    localMutedUsers,
    publicRoomId,
    broadcastRoomId,
    currentActiveRoomId,
    connectionStatus,
    speakerMuted,
    microphoneMuted,
    canUseMicrophone,
    allowSpeaking,
    allowBroadcastSpeaking,
    microphoneVolume,
    speakerVolume,
    userVolumeSettings,
    speakingMode,
    speakingChannel,
    setSpeakingChannel,
    microphonePermissionGranted,
    liveKitEndpoint,
    getLiveKitEndpoint,
    checkMicrophonePermission,
    connect,
    disconnect,
    backToPublicRoom,
    setMicrophoneMuted,
    setSpeakerMuted,
    setSpeakerVolume,
    setMicrophoneVolume,
    setUserVolume,
    setSpeakingMode,
    pttPress,
    pttRelease,
    toggleLocalMuteUser,
    adminSetUserMute,
    adminSetAllMute,
    createVoiceRoom,
    inviteToVoiceRoom,
    joinVoiceRoom,
    leaveVoiceRoom,
  };
});

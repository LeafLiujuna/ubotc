import { LiveKitAdapter } from "./adapters/LiveKitAdapter";
import { LocalWebRTCAdapter } from "./adapters/LocalWebRTCAdapter";
import type { AudioInputSettings } from "./mediaSettings";
import type { IVoiceAdapterFactory } from "./adapters/IVoiceAdapter";
import type { IAudioPlugin } from "./plugins/IAudioPlugin";
import { VADEngine } from "./vad/VADEngine";
import { VoiceConnection } from "./VoiceConnection";
import {
  type ConnectParams,
  type PrivateRoomParams,
  type RoomType,
  type SpeakMode,
  type VoiceEventMap,
  type VoiceRoomState,
  type VoiceState,
  type VoiceRole,
  VoiceServiceError,
} from "./types";

type HandlerMap = {
  [K in keyof VoiceEventMap]: Set<(...args: VoiceEventMap[K]) => void>;
};

export type VoiceServiceOptions = {
  adapterFactory?: IVoiceAdapterFactory;
};

export class VoiceService {
  private readonly adapterFactory: IVoiceAdapterFactory;
  private useLocalWebRTC = false;

  private broadcastConnection: VoiceConnection | null = null;
  private activeConnection: VoiceConnection | null = null;

  private publicConnectParams: ConnectParams | null = null;
  private currentActiveRoomId: string | null = null;

  private state: VoiceState = {
    role: "guest",
    isMicMuted: true,
    isSpeakerMuted: false,
    activeSpeakingRoom: "active",
    speakMode: "open",
    isPTTActive: false,
    isDMMutedByServer: false,
  };

  private plugins: IAudioPlugin[] = [];
  private audioSettings: AudioInputSettings | null = null;

  private roomStates: Record<RoomType, VoiceRoomState> = {
    broadcast: {
      roomId: "",
      roomType: "broadcast",
      status: "idle",
      participants: [],
    },
    active: {
      roomId: "",
      roomType: "active",
      status: "idle",
      participants: [],
    },
  };

  private vadEngine: VADEngine | null = null;
  private vadProbeStream: MediaStream | null = null;
  private vadGateOpen = true;
  private vadGeneration = 0;
  private micRouting: Promise<void> = Promise.resolve();
  private generation = 0;
  private pendingConnections = new Set<VoiceConnection>();

  private handlers: HandlerMap = {
    "participants:changed": new Set(),
    "speaking:changed": new Set(),
    "state:changed": new Set(),
    "connection:changed": new Set(),
    "vad:speaking:changed": new Set(),
    "auth:tokenExpired": new Set(),
    "lifecycle:switchedToPublic": new Set(),
  };

  constructor(options: VoiceServiceOptions = {}) {
    this.adapterFactory =
      options.adapterFactory ?? {
        create: () => this.useLocalWebRTC ? new LocalWebRTCAdapter() : new LiveKitAdapter(),
      };
  }

  async connect(params: ConnectParams): Promise<void> {
    this.useLocalWebRTC = new URL(params.liveKitEndpoint).pathname === "/local-voice";
    const generation = this.generation;
    const nextBroadcast = new VoiceConnection("broadcast", this.adapterFactory);
    const nextActive = new VoiceConnection("active", this.adapterFactory);
    this.bindConnectionEvents(nextBroadcast);
    this.bindConnectionEvents(nextActive);
    this.pendingConnections.add(nextBroadcast);
    this.pendingConnections.add(nextActive);

    try {
      await nextBroadcast.connect({
        serverUrl: params.liveKitEndpoint,
        roomId: params.broadcastRoomId,
        token: params.broadcastRoomToken,
        listenOnly: true,
        plugins: this.plugins,
      });
      if (generation !== this.generation) return;

      await nextActive.connect({
        serverUrl: params.liveKitEndpoint,
        roomId: params.publicRoomId,
        token: params.publicRoomToken,
        listenOnly: true,
        plugins: this.plugins,
      });
      if (generation !== this.generation) return;
    } catch (error) {
      await nextBroadcast.disconnect();
      await nextActive.disconnect();
      throw new VoiceServiceError(
        "ERR_VOICE_CONNECTION_FAILED",
        `Failed to connect voice service: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.pendingConnections.delete(nextBroadcast);
      this.pendingConnections.delete(nextActive);
      if (generation !== this.generation) {
        await nextBroadcast.disconnect();
        await nextActive.disconnect();
      }
    }

    const prevBroadcast = this.broadcastConnection;
    const prevActive = this.activeConnection;

    this.broadcastConnection = nextBroadcast;
    this.activeConnection = nextActive;
    this.publicConnectParams = { ...params };
    this.currentActiveRoomId = params.publicRoomId;
    this.state.role = params.role;
    this.vadGateOpen = this.state.speakMode !== "vad";

    this.roomStates.broadcast.roomId = params.broadcastRoomId;
    this.roomStates.active.roomId = params.publicRoomId;

    await prevBroadcast?.disconnect();
    await prevActive?.disconnect();
    await this.restoreActiveMedia();

    this.emitStateChanged();
    if (this.audioSettings) await this.configureAudio(this.audioSettings);
    await this.applyMicRouting();
    if (this.state.speakMode === "vad" && !this.state.isMicMuted) await this.startVAD();
  }

  async connectToPrivateRoom(params: PrivateRoomParams): Promise<void> {
    if (this.state.role === "guest") {
      throw new VoiceServiceError(
        "ERR_VOICE_ROLE_NOT_ALLOWED",
        "Guest role cannot connect to private rooms",
      );
    }

    const base = this.publicConnectParams;
    if (!base) {
      throw new VoiceServiceError(
        "ERR_VOICE_NO_PUBLIC_CONTEXT",
        "connect() must be called before connectToPrivateRoom()",
      );
    }

    const nextActive = new VoiceConnection("active", this.adapterFactory);
    this.bindConnectionEvents(nextActive);
    const generation = this.generation;
    this.pendingConnections.add(nextActive);
    try {
      await nextActive.connect({
        serverUrl: base.liveKitEndpoint,
        roomId: params.roomId,
        token: params.token,
        listenOnly: true,
        plugins: this.plugins,
      });
      if (generation !== this.generation) return;
      if (this.audioSettings) await nextActive.configureAudio(this.audioSettings);
    } catch (error) {
      await nextActive.disconnect();
      throw error;
    } finally {
      this.pendingConnections.delete(nextActive);
      if (generation !== this.generation) await nextActive.disconnect();
    }
    if (generation !== this.generation) return;

    const prevActive = this.activeConnection;
    this.activeConnection = nextActive;
    this.currentActiveRoomId = params.roomId;
    this.roomStates.active.roomId = params.roomId;
    await prevActive?.disconnect();
    await this.restoreActiveMedia();

    await this.applyMicRouting();
  }

  async backToPublicRoom(): Promise<void> {
    const base = this.publicConnectParams;
    if (!base) {
      throw new VoiceServiceError(
        "ERR_VOICE_NO_PUBLIC_CONTEXT",
        "No cached public room context",
      );
    }

    const nextActive = new VoiceConnection("active", this.adapterFactory);
    this.bindConnectionEvents(nextActive);
    const generation = this.generation;
    this.pendingConnections.add(nextActive);

    try {
      await nextActive.connect({
        serverUrl: base.liveKitEndpoint,
        roomId: base.publicRoomId,
        token: base.publicRoomToken,
        listenOnly: true,
        plugins: this.plugins,
      });
      if (generation !== this.generation) return;
      if (this.audioSettings) await nextActive.configureAudio(this.audioSettings);
    } catch (error) {
      await nextActive.disconnect();
      throw new VoiceServiceError(
        "ERR_VOICE_TOKEN_EXPIRED",
        `Failed to return to public room: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.pendingConnections.delete(nextActive);
      if (generation !== this.generation) await nextActive.disconnect();
    }
    if (generation !== this.generation) return;

    const prevActive = this.activeConnection;
    this.activeConnection = nextActive;
    this.currentActiveRoomId = base.publicRoomId;
    this.roomStates.active.roomId = base.publicRoomId;
    await prevActive?.disconnect();
    await this.restoreActiveMedia();

    this.emit("lifecycle:switchedToPublic", base.publicRoomId);
    await this.applyMicRouting();
  }

  async disconnect(): Promise<void> {
    this.generation += 1;
    // Invalidate pending mic routes before stopping transports.
    this.state.isMicMuted = true;
    this.state.isPTTActive = false;
    await this.stopVAD();
    await Promise.all([...this.pendingConnections].map(connection => connection.disconnect()));
    await this.broadcastConnection?.disconnect();
    await this.activeConnection?.disconnect();
    this.broadcastConnection = null;
    this.activeConnection = null;
    this.publicConnectParams = null;
    this.currentActiveRoomId = null;
    this.roomStates.broadcast.status = "idle";
    this.roomStates.active.status = "idle";
    this.roomStates.broadcast.participants = [];
    this.roomStates.active.participants = [];
    this.emitStateChanged();
  }

  async setMicMuted(muted: boolean): Promise<void> {
    if (!muted && this.isGuestRole()) {
      throw new VoiceServiceError('ERR_VOICE_ROLE_NOT_ALLOWED', '旁观者只能收听，不能开麦。');
    }
    this.state.isMicMuted = muted;
    this.emitStateChanged();
    if (muted) await this.stopVAD();
    else if (this.state.speakMode === 'vad') await this.startVAD();
    await this.applyMicRouting();
  }

  async setRole(role: VoiceRole): Promise<void> {
    this.state.role = role;
    if (this.isGuestRole()) {
      this.state.isMicMuted = true;
      this.state.isPTTActive = false;
      await this.stopVAD();
    }
    this.emitStateChanged();
    await this.applyMicRouting();
  }

  setSpeakerMuted(muted: boolean): void {
    this.state.isSpeakerMuted = muted;
    this.broadcastConnection?.setSpeakerEnabled(!muted);
    this.activeConnection?.setSpeakerEnabled(!muted);
    this.emitStateChanged();
  }

  setRemoteParticipantMuted(userId: string, muted: boolean): void {
    this.broadcastConnection?.setRemoteParticipantMuted(userId, muted);
    this.activeConnection?.setRemoteParticipantMuted(userId, muted);
  }

  setRemoteParticipantVolume(userId: string, volume: number): void {
    this.broadcastConnection?.setRemoteParticipantVolume(userId, volume);
    this.activeConnection?.setRemoteParticipantVolume(userId, volume);
  }

  setDMMutedByServer(muted: boolean): void {
    this.state.isDMMutedByServer = muted;
    this.emitStateChanged();
    void this.applyMicRouting();
  }

  async setActiveSpeakingRoom(roomType: RoomType): Promise<void> {
    this.state.activeSpeakingRoom = roomType;
    this.emitStateChanged();
    await this.applyMicRouting();
  }

  async setSpeakMode(mode: SpeakMode): Promise<void> {
    this.state.speakMode = mode;
    this.state.isPTTActive = false;
    this.vadGateOpen = mode !== "vad";
    this.emitStateChanged();

    if (mode === "vad") {
      await this.startVAD();
    } else {
      await this.stopVAD();
    }

    await this.applyMicRouting();
  }

  async pttPress(): Promise<void> {
    if (this.state.speakMode !== "ptt") {
      return;
    }
    this.state.isPTTActive = true;
    this.emitStateChanged();
    await this.applyMicRouting();
  }

  async pttRelease(): Promise<void> {
    if (this.state.speakMode !== "ptt") {
      return;
    }
    this.state.isPTTActive = false;
    this.emitStateChanged();
    await this.applyMicRouting();
  }

  async setAudioInputDevice(deviceId: string): Promise<void> {
    if (this.audioSettings) this.audioSettings.deviceId = deviceId;
    await this.broadcastConnection?.setAudioInputDevice(deviceId);
    await this.activeConnection?.setAudioInputDevice(deviceId);
  }

  async configureAudio(settings: AudioInputSettings): Promise<void> {
    const restartVAD = this.vadProbeStream && (!this.audioSettings || ["deviceId", "autoGainControl", "noiseSuppression", "echoCancellation"].some(key => this.audioSettings?.[key as keyof AudioInputSettings] !== settings[key as keyof AudioInputSettings]));
    this.audioSettings = { ...settings };
    await this.broadcastConnection?.configureAudio(settings);
    await this.activeConnection?.configureAudio(settings);
    if (restartVAD) await this.startVAD();
  }

  async addPlugin(plugin: IAudioPlugin): Promise<void> {
    if (this.plugins.some(p => p.id === plugin.id)) {
      return;
    }
    this.plugins.push(plugin);
    await this.syncPlugins();
  }

  async removePlugin(pluginId: string): Promise<void> {
    const idx = this.plugins.findIndex(plugin => plugin.id === pluginId);
    if (idx < 0) {
      return;
    }

    const [plugin] = this.plugins.splice(idx, 1);
    plugin.dispose();
    await this.syncPlugins();
  }

  getState(): VoiceState {
    return { ...this.state };
  }

  getRoomState(roomType: RoomType): VoiceRoomState {
    return { ...this.roomStates[roomType] };
  }

  on<K extends keyof VoiceEventMap>(
    event: K,
    handler: (...args: VoiceEventMap[K]) => void,
  ): void {
    this.handlers[event].add(handler);
  }

  off<K extends keyof VoiceEventMap>(
    event: K,
    handler: (...args: VoiceEventMap[K]) => void,
  ): void {
    this.handlers[event].delete(handler);
  }

  private emit<K extends keyof VoiceEventMap>(
    event: K,
    ...args: VoiceEventMap[K]
  ): void {
    for (const handler of this.handlers[event]) {
      handler(...args);
    }
  }

  private emitStateChanged(): void {
    this.emit("state:changed", this.getState());
  }

  private async restoreActiveMedia(): Promise<void> {
    this.setSpeakerMuted(this.state.isSpeakerMuted);
    for (const connection of [this.broadcastConnection, this.activeConnection]) {
      if (!connection) continue;
      const participants = connection.getParticipants();
      this.roomStates[connection.roomType].participants = participants;
      this.roomStates[connection.roomType].status = "connected";
      this.emit("participants:changed", connection.roomType, participants);
      this.emit("connection:changed", connection.roomType, "connected");
    }
  }

  private bindConnectionEvents(connection: VoiceConnection): void {
    const generation = this.generation;
    const isCurrent = () => {
      if (generation !== this.generation) return false;
      const current = connection.roomType === "active" ? this.activeConnection : this.broadcastConnection;
      return !current || current === connection;
    };
    connection.on("participants:changed", participants => {
      if (!isCurrent()) return;
      this.roomStates[connection.roomType].participants = participants;
      this.emit("participants:changed", connection.roomType, participants);
    });

    connection.on("speaking:changed", (userId, isSpeaking) => {
      if (!isCurrent()) return;
      this.emit("speaking:changed", userId, isSpeaking, connection.roomType);
    });

    connection.on("connection:changed", status => {
      if (!isCurrent()) return;
      this.roomStates[connection.roomType].status = status;
      this.emit("connection:changed", connection.roomType, status);
    });

    connection.on("auth:tokenExpired", (roomType, roomId) => {
      this.emit("auth:tokenExpired", roomType, roomId);
    });
  }

  private isGuestRole(): boolean {
    return this.state.role === "guest";
  }

  private isDMRole(): boolean {
    return this.state.role === "dm" || this.state.role === "admin";
  }

  private isMicGloballyBlocked(): boolean {
    if (this.isGuestRole()) {
      return true;
    }

    if (this.state.isDMMutedByServer && this.isDMRole()) {
      return true;
    }

    if (this.state.isMicMuted) {
      return true;
    }

    if (this.state.speakMode === "ptt" && !this.state.isPTTActive) {
      return true;
    }

    if (this.state.speakMode === "vad" && !this.vadGateOpen) {
      return true;
    }

    return false;
  }

  private async applyMicRouting(): Promise<void> {
    this.micRouting = this.micRouting.catch(() => {}).then(async () => {
      const blocked = this.isMicGloballyBlocked();
      const broadcast = !blocked && this.isDMRole() && this.state.activeSpeakingRoom === "broadcast";
      // Close the previous channel before opening the target to avoid leaking private speech.
      if (broadcast) {
        await this.activeConnection?.setMicEnabled(false);
        await this.broadcastConnection?.setMicEnabled(!this.isMicGloballyBlocked() && this.state.activeSpeakingRoom === "broadcast");
      } else {
        await this.broadcastConnection?.setMicEnabled(false);
        await this.activeConnection?.setMicEnabled(!this.isMicGloballyBlocked() && (this.state.activeSpeakingRoom === "active" || !this.isDMRole()));
      }
    });
    await this.micRouting;
  }

  private async syncPlugins(): Promise<void> {
    await this.broadcastConnection?.setAudioPlugins(this.plugins);
    await this.activeConnection?.setAudioPlugins(this.plugins);
  }

  private async startVAD(): Promise<void> {
    if (this.isGuestRole() || this.state.isMicMuted) {
      return;
    }

    await this.stopVAD();
    const generation = this.vadGeneration;

    if (!navigator.mediaDevices?.getUserMedia) {
      return;
    }

    const settings = this.audioSettings;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: settings ? {
      deviceId: settings.deviceId || undefined, autoGainControl: settings.autoGainControl,
      noiseSuppression: settings.noiseSuppression, echoCancellation: settings.echoCancellation,
    } : true });
    if (generation !== this.vadGeneration || this.state.isMicMuted || this.state.speakMode !== "vad") {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    this.vadProbeStream = stream;
    this.vadEngine = new VADEngine();
    this.vadEngine.on("speaking", () => {
      if (generation !== this.vadGeneration) return;
      this.vadGateOpen = true;
      void this.applyMicRouting();
      this.emit("vad:speaking:changed", true);
    });
    this.vadEngine.on("silence", () => {
      if (generation !== this.vadGeneration) return;
      this.vadGateOpen = false;
      void this.applyMicRouting();
      this.emit("vad:speaking:changed", false);
    });
    await this.vadEngine.attach(this.vadProbeStream);
  }

  private async stopVAD(): Promise<void> {
    this.vadGeneration += 1;
    this.vadGateOpen = this.state.speakMode !== "vad";
    const engine = this.vadEngine;
    const stream = this.vadProbeStream;
    this.vadEngine = null;
    this.vadProbeStream = null;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    await engine?.detach();
  }
}

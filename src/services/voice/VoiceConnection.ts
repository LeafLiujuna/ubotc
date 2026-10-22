import type { IAudioPlugin } from "./plugins/IAudioPlugin";
import type { AudioInputSettings } from "./mediaSettings";
import type {
  AdapterConnectOptions,
  IVoiceAdapter,
  IVoiceAdapterFactory,
} from "./adapters/IVoiceAdapter";
import type {
  ConnectionStatus,
  DisconnectReason,
  ParticipantInfo,
  RoomType,
} from "./types";

type VoiceConnectionEventMap = {
  "participants:changed": [participants: ParticipantInfo[]];
  "speaking:changed": [userId: string, isSpeaking: boolean];
  "connection:changed": [status: ConnectionStatus];
  "auth:tokenExpired": [roomType: RoomType, roomId: string];
};

type HandlerMap = {
  [K in keyof VoiceConnectionEventMap]: Set<(...args: VoiceConnectionEventMap[K]) => void>;
};

type ConnectionCredentials = {
  serverUrl: string;
  roomId: string;
  token: string;
  listenOnly: boolean;
  plugins: IAudioPlugin[];
};

const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 32000, 32000, 32000, 32000, 32000];

export class VoiceConnection {
  public readonly roomType: RoomType;

  private readonly adapterFactory: IVoiceAdapterFactory;
  private adapter: IVoiceAdapter;
  private credentials: ConnectionCredentials | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isManualDisconnect = false;
  private audioSettings: AudioInputSettings | null = null;
  private micEnabled = false;
  private speakerEnabled = true;
  private generation = 0;
  private reconnectingAdapter: IVoiceAdapter | null = null;
  private remoteMuted = new Map<string, boolean>();
  private remoteVolumes = new Map<string, number>();
  private micUpdate: Promise<void> = Promise.resolve();

  private handlers: HandlerMap = {
    "participants:changed": new Set(),
    "speaking:changed": new Set(),
    "connection:changed": new Set(),
    "auth:tokenExpired": new Set(),
  };

  constructor(roomType: RoomType, adapterFactory: IVoiceAdapterFactory) {
    this.roomType = roomType;
    this.adapterFactory = adapterFactory;
    this.adapter = adapterFactory.create();
    this.bindAdapterEvents(this.adapter);
  }

  async connect(credentials: ConnectionCredentials): Promise<void> {
    this.generation += 1;
    this.credentials = credentials;
    this.isManualDisconnect = false;
    this.clearReconnectTimer();
    this.reconnectAttempt = 0;

    await this.adapter.connect(credentials.serverUrl, {
      roomId: credentials.roomId,
      token: credentials.token,
      listenOnly: credentials.listenOnly,
      audioPlugins: credentials.plugins,
    });
  }

  async disconnect(): Promise<void> {
    this.generation += 1;
    this.isManualDisconnect = true;
    this.clearReconnectTimer();
    await Promise.all([this.adapter.disconnect(), this.reconnectingAdapter?.disconnect()]);
  }

  async setMicEnabled(enabled: boolean): Promise<void> {
    this.micEnabled = enabled;
    this.micUpdate = this.micUpdate.catch(() => {}).then(() =>
      this.adapter.setMicEnabled(!this.isManualDisconnect && this.micEnabled));
    await this.micUpdate;
  }

  setSpeakerEnabled(enabled: boolean): void {
    this.speakerEnabled = enabled;
    this.adapter.setSpeakerEnabled(enabled);
  }

  setRemoteParticipantMuted(userId: string, muted: boolean): void {
    this.remoteMuted.set(userId, muted);
    this.adapter.setRemoteParticipantMuted(userId, muted);
  }

  setRemoteParticipantVolume(userId: string, volume: number): void {
    this.remoteVolumes.set(userId, volume);
    this.adapter.setRemoteParticipantVolume(userId, volume);
  }

  async setAudioInputDevice(deviceId: string): Promise<void> {
    if (this.audioSettings) this.audioSettings.deviceId = deviceId;
    await this.adapter.setAudioInputDevice(deviceId);
  }

  async configureAudio(settings: AudioInputSettings): Promise<void> {
    this.audioSettings = { ...settings };
    await this.adapter.configureAudio?.(settings);
  }
  getParticipants(): ParticipantInfo[] { return this.adapter.getParticipants(); }

  async setAudioPlugins(plugins: IAudioPlugin[]): Promise<void> {
    if (this.credentials) {
      this.credentials.plugins = plugins;
    }
    await this.adapter.setAudioPlugins(plugins);
  }

  on<K extends keyof VoiceConnectionEventMap>(
    event: K,
    handler: (...args: VoiceConnectionEventMap[K]) => void,
  ): void {
    this.handlers[event].add(handler);
  }

  off<K extends keyof VoiceConnectionEventMap>(
    event: K,
    handler: (...args: VoiceConnectionEventMap[K]) => void,
  ): void {
    this.handlers[event].delete(handler);
  }

  private emit<K extends keyof VoiceConnectionEventMap>(
    event: K,
    ...args: VoiceConnectionEventMap[K]
  ): void {
    for (const handler of this.handlers[event]) {
      handler(...args);
    }
  }

  private bindAdapterEvents(adapter: IVoiceAdapter): void {
    adapter.on("participants:changed", participants => {
      if (this.adapter !== adapter) return;
      this.emit("participants:changed", participants);
    });

    adapter.on("speaking:changed", (userId, isSpeaking) => {
      if (this.adapter !== adapter) return;
      this.emit("speaking:changed", userId, isSpeaking);
    });

    adapter.on("connection:changed", status => {
      if (this.adapter !== adapter) return;
      this.emit("connection:changed", status);
    });

    adapter.on("disconnected", reason => {
      if (this.adapter !== adapter) return;
      void this.handleUnexpectedDisconnect(reason);
    });
  }

  private async handleUnexpectedDisconnect(reason: DisconnectReason): Promise<void> {
    if (this.isManualDisconnect || !this.credentials) {
      return;
    }

    if (reason === "tokenExpired") {
      this.emit("auth:tokenExpired", this.roomType, this.credentials.roomId);
      return;
    }

    if (reason === "kicked" || reason === "serverClosed") {
      this.clearReconnectTimer();
      this.emit("connection:changed", "failed");
      return;
    }
    if (this.reconnectTimer || this.reconnectingAdapter) return;

    if (this.reconnectAttempt >= RECONNECT_DELAYS_MS.length) {
      this.emit("connection:changed", "failed");
      return;
    }

    this.emit("connection:changed", "reconnecting");

    const delay = RECONNECT_DELAYS_MS[this.reconnectAttempt++];
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.reconnect();
    }, delay);
  }

  private async reconnect(): Promise<void> {
    if (!this.credentials || this.isManualDisconnect) {
      return;
    }
    const generation = this.generation;
    const newAdapter = this.adapterFactory.create();
    this.reconnectingAdapter = newAdapter;
    let failed = false;
    try {
      this.bindAdapterEvents(newAdapter);

      const options: AdapterConnectOptions = {
        roomId: this.credentials.roomId,
        token: this.credentials.token,
        listenOnly: true,
        audioPlugins: this.credentials.plugins,
      };

      await newAdapter.connect(this.credentials.serverUrl, options);
      if (generation !== this.generation || this.isManualDisconnect) return;
      if (this.audioSettings) await newAdapter.configureAudio?.(this.audioSettings);
      if (generation !== this.generation || this.isManualDisconnect) return;
      newAdapter.setSpeakerEnabled(this.speakerEnabled);
      for (const [userId, muted] of this.remoteMuted) newAdapter.setRemoteParticipantMuted(userId, muted);
      for (const [userId, volume] of this.remoteVolumes) newAdapter.setRemoteParticipantVolume(userId, volume);
      if (generation !== this.generation || this.isManualDisconnect) return;

      const oldAdapter = this.adapter;
      this.adapter = newAdapter;
      await oldAdapter.disconnect();
      await this.setMicEnabled(this.micEnabled);
      if (generation !== this.generation || this.isManualDisconnect) return;
      this.emit("participants:changed", this.getParticipants());
      this.emit("connection:changed", "connected");

      this.reconnectAttempt = 0;
      this.clearReconnectTimer();
    } catch {
      failed = true;
    } finally {
      if (this.reconnectingAdapter === newAdapter) this.reconnectingAdapter = null;
      if (this.adapter !== newAdapter) await newAdapter.disconnect().catch(() => {});
    }
    if (failed && generation === this.generation) await this.handleUnexpectedDisconnect("networkError");
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

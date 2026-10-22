import type { IAudioPlugin } from "../plugins/IAudioPlugin";
import type { AudioInputSettings } from "../mediaSettings";
import type {
  ConnectionStatus,
  DisconnectReason,
  ParticipantInfo,
} from "../types";

export type AdapterConnectOptions = {
  roomId: string;
  token: string;
  listenOnly?: boolean;
  audioPlugins?: IAudioPlugin[];
};

export type AdapterEventMap = {
  "participants:changed": [participants: ParticipantInfo[]];
  "speaking:changed": [userId: string, isSpeaking: boolean];
  "connection:changed": [status: ConnectionStatus];
  disconnected: [reason: DisconnectReason];
};

export interface IVoiceAdapter {
  readonly adapterType: string;
  readonly roomId: string | null;
  connect(serverUrl: string, options: AdapterConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  setMicEnabled(enabled: boolean): Promise<void>;
  setSpeakerEnabled(enabled: boolean): void;
  setRemoteParticipantMuted(userId: string, muted: boolean): void;
  setRemoteParticipantVolume(userId: string, volume: number): void;
  setAudioInputDevice(deviceId: string): Promise<void>;
  setAudioPlugins(plugins: IAudioPlugin[]): Promise<void>;
  getParticipants(): ParticipantInfo[];
  configureAudio?(settings: AudioInputSettings): Promise<void>;
  on<K extends keyof AdapterEventMap>(
    event: K,
    handler: (...args: AdapterEventMap[K]) => void,
  ): void;
  off<K extends keyof AdapterEventMap>(
    event: K,
    handler: (...args: AdapterEventMap[K]) => void,
  ): void;
}

export interface IVoiceAdapterFactory {
  create(): IVoiceAdapter;
}

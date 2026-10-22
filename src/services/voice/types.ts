export type RoomType = "broadcast" | "active";

export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "failed";

export type SpeakMode = "open" | "vad" | "ptt";

export type VoiceRole = "admin" | "dm" | "guest" | "player";

export type DisconnectReason =
  | "tokenExpired"
  | "networkError"
  | "kicked"
  | "serverClosed"
  | "unknown";

export type ParticipantInfo = {
  userId: string;
  isSpeaking: boolean;
  isMicMuted: boolean;
  isLocal: boolean;
};

export type VoiceRoomState = {
  roomId: string;
  roomType: RoomType;
  status: ConnectionStatus;
  participants: ParticipantInfo[];
};

export type VoiceState = {
  role: VoiceRole;
  isMicMuted: boolean;
  isSpeakerMuted: boolean;
  activeSpeakingRoom: RoomType;
  speakMode: SpeakMode;
  isPTTActive: boolean;
  isDMMutedByServer: boolean;
};

export type ConnectParams = {
  liveKitEndpoint: string;
  publicRoomId: string;
  publicRoomToken: string;
  broadcastRoomId: string;
  broadcastRoomToken: string;
  role: VoiceRole;
};

export type PrivateRoomParams = {
  roomId: string;
  token: string;
};

export type VoiceEventMap = {
  "participants:changed": [roomType: RoomType, participants: ParticipantInfo[]];
  "speaking:changed": [userId: string, isSpeaking: boolean, roomType: RoomType];
  "state:changed": [state: VoiceState];
  "connection:changed": [roomType: RoomType, status: ConnectionStatus];
  "vad:speaking:changed": [isSpeaking: boolean];
  "auth:tokenExpired": [roomType: RoomType, roomId: string];
  "lifecycle:switchedToPublic": [publicRoomId: string];
};

export type VoiceServiceErrorCode =
  | "ERR_VOICE_ROLE_NOT_ALLOWED"
  | "ERR_VOICE_NO_PUBLIC_CONTEXT"
  | "ERR_VOICE_TOKEN_EXPIRED"
  | "ERR_VOICE_CONNECTION_FAILED";

export class VoiceServiceError extends Error {
  public readonly code: VoiceServiceErrorCode;

  constructor(code: VoiceServiceErrorCode, message: string) {
    super(message);
    this.name = "VoiceServiceError";
    this.code = code;
  }
}

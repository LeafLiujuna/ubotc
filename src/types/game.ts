import { CommonPlayerState } from "./domain";
import type { ApiPaginationQuery, ApiResponse, PaginatedData } from "./http";
import { BaseUserInfo } from "./user";

export interface GameRoomTag {
  tag: string;
  detail?: string;
}

export type GameRoomMetaInfo = {
  roomTitle: string;
  roomTags?: GameRoomTag[];
  dmUserIds: string[];
};

export type RoomPlayerState = CommonPlayerState & {
  ping: number;
  connected: boolean;
};

export type LimitedRoomPlayerState = CommonPlayerState & {
  /** Public death-marker status; remaining vote counts stay private. */
  ghostVoteUsed?: boolean;
  ping: number;
  connected: boolean;
};

export type GameLevel = "prepare" | "day" | "night" | "end" | string;

import type { RoomTimerState, GrimoireRevealState } from './storyteller';

export type GameState = {
  roomTimer?: RoomTimerState | null;
  grimoireReveal?: GrimoireRevealState | null;
  level: GameLevel;
  levelDays: number;
  levelStartFromDaytime: boolean;
  seatCount: number;
  /** 房间级传奇角色配置；旧服务端未提供时按空数组处理。 */
  fabledRoleIds?: string[];
  grimoireRevealed?: boolean;
  customRules?: string[];
};

export type GameStateWithPlayers = GameState & {
  players: CommonPlayerState[];
};

export type GameConfig = {
  allowTextWhispers?: boolean;
  backToPublicRoomDelay?: number;
  clearMessageWhenLevelChange?: Array<"public" | "whisper" | "dm_chat" | "dm_skill">;
  showWhisperMessageHistory?: boolean;
  dmElectionMode?: boolean;
  messageAutoDismiss?: boolean;
  messageAutoDismissTimeout?: number;
  voteTurnTimeoutSeconds?: number;
};

export interface CreateRoomRequest {
  name: string;
  tags: GameRoomTag[];
  gameServerId?: string;
  isPrivate?: boolean;
  isVipRoom?: boolean;
  password?: string | null;
  maxOnline?: number;
}

export interface CreateRoomData {
  roomId: string;
  gameServerId: string;
  isPrivate: boolean;
  maxOnline: number;
}

export interface RoomListItem {
  roomId: string;
  name: string;
  host: string | null;
  hostUser: BaseUserInfo | null;
  tags: GameRoomTag[];
  gameServerId: string;
  level: string;
  levelDays: number;
  playerCount: number;
  onlineCount: number;
  maxPlayer: number;
  isPrivate: boolean;
  createdAt: number;
  gameScriptId: string | null;
  gameScript: {
    id: string;
    name: string;
    iconUrl: string | null;
    authorName: string | null;
  } | null;
}

export interface RoomDetails {
  roomId: string;
  name: string;
  host: string | null;
  gameServerId: string;
  isPrivate: boolean;
  isVip: boolean;
  maxOnline: number;
  createdAt: number;
}

export interface JoinRoomRequest {
  password?: string | null;
}

export interface JoinRoomData {
  token: string;
  roomId: string;
  gameServerId: string;
  gameServerUrl: string;
}

export interface GameServerLoadStat {
  activeRooms: number;
  connectedPlayers: number;
  uptimeMs: number;
}

export interface GameServerInfo {
  serverId: string;
  name: string;
  region: string;
  publicUrl: string;
  status: string;
  activeRooms: number;
  connectedPlayers: number;
  lastHeartbeatTime: number;
}

export interface ServerLoadData {
  servers: Array<GameServerInfo>;
  preferred: string | null;
}

export interface UploadGameScriptRequest {
  gameScript: unknown;
  isPublic?: boolean;
}

export interface UploadGameScriptData {
  id: string;
  name: string;
  hash: string;
  isPublic: boolean;
  createdAt: number;
}

export interface RankingItem {
  rank: number;
  userId: string;
  displayName: string;
  score: number;
  level?: number;
  gamesPlayed?: number;
  winRate?: number;
}

export type ListRoomsResponse = ApiResponse<PaginatedData<RoomListItem>>;
export type CreateRoomResponse = ApiResponse<CreateRoomData>;
export type GetRoomResponse = ApiResponse<RoomDetails>;
export type JoinRoomResponse = ApiResponse<JoinRoomData>;
export type OwnerDiscardRoomResponse = ApiResponse<unknown>;
export type ServerLoadResponse = ApiResponse<ServerLoadData>;
export type GameResultResponse = ApiResponse<Record<string, unknown>>;
export type GameScriptResponse = ApiResponse<Record<string, unknown>>;
export type UploadGameScriptResponse = ApiResponse<UploadGameScriptData>;
export type RankingsResponse = ApiResponse<PaginatedData<RankingItem>>;

export type RankingsQuery = ApiPaginationQuery;

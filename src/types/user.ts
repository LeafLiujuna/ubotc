import type { ApiPaginationQuery, ApiResponse, PaginatedData } from "./http";

export interface BaseUserInfo {
  id: string;
  publicId?: string | null;
  displayName: string;
  avatarUrl?: string;
  level: number;
  storytellerLevel: number;
  isCertifiedStoryteller?: boolean;
  isAdmin?: boolean;
  isVip?: boolean;
}

export interface DetailedUserInfo extends BaseUserInfo {
  username?: string | null;
  email?: string | null;
  lastLoginAt?: number;
  lastLoginIp?: string | null;
  qqLinked?: boolean;
  emailLinked?: boolean;
  stats?: { totalGames: number; dmCount: number; wins: number; losses: number; mvpCount: number; favoriteScript?: string | null; favoriteStartingCharacter?: string | null };
  createdAt?: number;
  lastSeenAt: number;
  vipExpireAt?: number | null;
  hideGameResults?: boolean;
  isBanned?: boolean;
}

export interface UserGameRecord {
  id: number;
  gameResultId: string;
  isDM: boolean;
  team: string;
  characterId: string;
  result: string;
  isMvp: boolean;
  playedAt: number;
}

export interface BatchGetUsersQuery {
  id: string[];
}

export type UserMeResponse = ApiResponse<DetailedUserInfo>;
export type UserGamesResponse = ApiResponse<PaginatedData<UserGameRecord>>;
export interface PublicUserProfile extends BaseUserInfo {
  createdAt?: number;
  stats?: DetailedUserInfo['stats'] | null;
}
export type UserProfileResponse = ApiResponse<PublicUserProfile>;
export type BatchUsersResponse = ApiResponse<BaseUserInfo[]>;

export type UserGamesQuery = ApiPaginationQuery;

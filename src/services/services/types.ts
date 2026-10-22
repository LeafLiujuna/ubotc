export type MeResponse = {
  id: string;
  displayName: string;
  avatarUrl?: string;
  level?: number;
  storytellerLevel?: number;
  isCertifiedStoryteller?: boolean;
};

export type DevLoginResponse = {
  token: string;
  user: MeResponse;
};

export type GameRoomTag = {
  tag: string;
  detail?: string;
};

export type RawRoom = {
  id?: string;
  roomId?: string;
  name?: string;
  gameScriptId?: string | null;
  gameServerId?: string;
  host?: string;
  playerCount?: number;
  onlineCount?: number;
  currentPlayers?: number;
  maxPlayer?: number;
  maxPlayers?: number;
  maxOnline?: number;
  isPrivate?: boolean;
  level?: string;
  tags?: GameRoomTag[];
  createdAt?: number | string | null;
};

export type NormalizedRoom = {
  id: string;
  roomId: string;
  name: string;
  editionId: string;
  edition: string;
  gameServerId: string;
  host: string;
  playerCount: number;
  onlineCount: number;
  maxPlayers: number;
  isPrivate: boolean;
  status: string;
  tags: GameRoomTag[];
  createdAt: number | string | null;
};

export type CreateRoomInput = {
  name: string;
  difficulty?: string;
  isPrivate?: boolean;
  password?: string | null;
  maxPlayers?: number;
  maxOnline?: number;
};

export type JoinRoomResponse = {
  token: string;
  roomId: string;
  gameServerId: string;
  gameServerUrl: string;
};

export type UploadGameScriptResponse = {
  id: string;
  name: string;
  hash: string;
  isPublic: boolean;
  createdAt: number;
};

export type ServerLoadResponse = {
  servers: Array<Record<string, unknown>>;
  preferred: string | null;
};

export type RankingItem = {
  rank: number;
  userId: string;
  displayName: string;
  score: number;
  level?: number;
  gamesPlayed?: number;
  winRate?: number;
};
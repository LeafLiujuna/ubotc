export const SocketClientEvent = {
  RefreshGameState: "refreshGameState",
  EnterSit: "enterSit",
  LeaveSit: "leaveSit",
  SendPublicMessage: "sendPublicMessage",
  SendWhisperMessage: "sendWhisperMessage",
  SubmitVote: "submitVote",
  DMUpdatePlayer: "dmUpdatePlayer",
  Pong: "pong",
} as const;

export const SocketServerEvent = {
  Response: "res",
  Error: "err",
  RoomMeta: "roomMeta",
  PlayerList: "playerList",
  GameState: "gameState",
  UserEnter: "userEnter",
  UserLeave: "userLeave",
  RoomClose: "roomClose",
} as const;

export type SocketClientEventName = typeof SocketClientEvent[keyof typeof SocketClientEvent];
export type SocketServerEventName = typeof SocketServerEvent[keyof typeof SocketServerEvent];

export type ServerResponseMessage<T = unknown> = {
  status: number;
  data?: T;
  message?: string;
  errorId?: string;
  error?: string;
};

export type ServerErrorMessage = {
  errorId?: string;
  code: number;
  event: string;
  message: string;
  error?: string;
  data?: unknown;
};

export type ClientEnterSitMessage = {
  seat: number;
};

export type ClientSubmitVoteMessage = {
  vote: "yes" | "no" | "abstain";
};

export type ClientPongMessage = {
  nonce: string;
};

export type ClientDMUpdatePlayerMessage = {
  userId: string;
  seat?: number;
  isAlive?: boolean;
  marks?: string[];
  buffs?: string[];
  extras?: Record<string, unknown>;
};

export type RoomMetaMessage = {
  roomId: string;
  name?: string;
  host?: string;
  gameServerId?: string;
  isPrivate?: boolean;
  maxOnline?: number;
};

export type LimitedRoomPlayerState = {
  userId: string;
  seat: number;
  isAlive: boolean;
  isDM?: boolean;
  marks?: string[];
  buffs?: string[];
  ping: number;
  connected: boolean;
};

export type ServerPlayerListMessage = {
  isUpdate: boolean;
  players: LimitedRoomPlayerState[];
  removed?: string[];
};

export type ServerGameStateMessage = {
  level: string;
  levelDays: number;
  isStarted?: boolean;
  isCompleted?: boolean;
};
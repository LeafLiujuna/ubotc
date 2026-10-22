import type { ApiResponse } from "./http";
import type { CommonPlayerState, PlayerNote } from "./domain";
import type { GameScriptType } from "./gameScript";
import type { GameConfig, GameRoomMetaInfo, GameRoomTag, GameState, GameStateWithPlayers, LimitedRoomPlayerState, RoomPlayerState } from "./game";
import { MessageContent, NightInfoContext } from "./message";

export const SocketClientEvent = {
  RefreshGameState: "refreshGameState",
  RespondApply: "respondApply",
  Pong: "pong",
  EnterSit: "enterSit",
  LeaveSit: "leaveSit",
  LeaveRoom: "leaveRoom",
  GetMessageHistory: "getMessageHistory",
  SendPublicMessage: "sendPublicMessage",
  SendWhisperMessage: "sendWhisperMessage",
  SendDMMessage: "sendDMMessage",
  DeleteMessage: "deleteMessage",
  ApplySwapSit: "applySwapSit",
  SubmitVote: "submitVote",
  GetNotes: "getNotes",
  UpdateNote: "updateNote",
  AdminUpdateRoomMeta: "adminUpdateRoomMeta",
  DMEnter: "dmEnter",
  DMLeave: "dmLeave",
  DMTimer: "dmTimer",
  DMRevealPlayers: "dmRevealPlayers",
  DMPublishResult: "dmPublishResult",
  DMRevealGrimoire: "dmRevealGrimoire",
  DMSetSeatCount: "dmSetSeatCount",
  DMSetSeatRoles: "dmSetSeatRoles",
  DMSendRoles: "dmSendRoles",
  DMTestPlayers: "dmTestPlayers",
  DMChangeLevel: "dmChangeLevel",
  DMUpdateNightAction: "dmUpdateNightAction",
  DMAssignRandomCharacter: "dmAssignRandomCharacter",
  DMUpdatePlayer: "dmUpdatePlayer",
  DMSwapPlayer: "dmSwapPlayer",
  DMSetCustomRules: "dmSetCustomRules",
  DMEndGame: "dmEndGame",
  DMUpdateScript: "dmUpdateScript",
  DMUpdateConfig: "dmUpdateConfig",
  DMSetFabled: "dmSetFabled",
  DMForceLeaveSit: "dmForceLeaveSit",
  DMKickUser: "dmKickUser",
  DMInvitePlayer: "dmInvitePlayer",
  DMStartVote: "dmStartVote",
  DMSkipVoter: "dmSkipVoter",
  DMPauseVote: "dmPauseVote",
  DMResumeVote: "dmResumeVote",
  DMCancelVote: "dmCancelVote",
  DMFinalizeDay: "dmFinalizeDay",
  DMSetExecutionMarker: "dmSetExecutionMarker",
  SetDM: "setDM",
  RemoveDM: "removeDM",
  ApplyDM: "applyDM",
  CancelApplyDM: "cancelApplyDM",
  VoteDM: "voteDM",
  VoicePublicRoomJoin: "voicePublicRoomJoin",
  VoicePlaceJoin: "voicePlaceJoin",
  SetHandSignal: "setHandSignal",
  VoiceRoomCreate: "voiceRoomCreate",
  VoiceRoomInvite: "voiceRoomInvite",
  VoiceRoomApplyJoin: "voiceRoomApplyJoin",
  VoiceRoomLeave: "voiceRoomLeave",
  VoiceUpdateMuteState: "voiceUpdateMuteState",
  DMVoiceRoomJoin: "dmVoiceRoomJoin",
  DMVoiceRoomReturnToPublic: "dmVoiceRoomReturnToPublic",
  DMVoiceSetUserMute: "dmVoiceSetUserMute",
  DMVoiceSetAllMute: "dmVoiceSetAllMute",
  DMVoiceSetUserSingleTalk: "dmVoiceSetUserSingleTalk",
  PluginRequest: "pluginRequest",
  PluginResponse: "pluginResponse",
} as const;

export const SocketServerEvent = {
  Response: "res",
  Error: "err",
  BroadcastMessage: "broadcastMsg",
  RoomMeta: "roomMeta",
  RoomWillClose: "roomWillClose",
  RoomClose: "roomClose",
  Kicked: "kicked",
  ReceiveApply: "receiveApply",
  ApplyDone: "applyDone",
  PluginRequest: "pluginRequest",
  DMElectionUpdate: "dmElectionUpdate",
  HandSignals: "handSignals",
  SeatRoles: "seatRoles",
  VoiceRoomOverview: "voiceRoomOverview",
  VoiceRoomUserState: "voiceRoomUserState",
  VoiceRoomJoin: "voiceRoomJoin",
  VoiceRoomInviteResult: "voiceRoomInviteResult",
  VoiceWillReturnToPublicRoom: "voiceWillReturnToPublicRoom",
  PlayerList: "playerList",
  GameState: "gameState",
  NightActionProgress: "nightActionProgress",
  GameScript: "gameScript",
  GameConfig: "gameConfig",
  PublicMessage: "publicMessage",
  GetMessageHistory: "getMessageHistory",
  WhisperMessage: "whisperMessage",
  DMMessage: "dmMessage",
  DeleteMessage: "deleteMessage",
  LevelChangeClearMessage: "levelChangeClearMessage",
  GameEnd: "gameEnd",
  CharacterChange: "characterChange",
  PlayerEnter: "playerEnter",
  PlayerLeave: "playerLeave",
  PlayerBuff: "playerBuff",
  PlayerSkill: "playerSkill",
  DMEnter: "dmEnter",
  DMLeave: "dmLeave",
  UserEnter: "userEnter",
  UserLeave: "userLeave",
  LevelChange: "levelChange",
  StartVote: "startVote",
  PlayerVoteStart: "playerVoteStart",
  PlayerVoteResult: "playerVoteResult",
  VoteResult: "voteResult",
  DayNominationState: "dayNominationState",
} as const;

export type SocketResponse<T = unknown> = ApiResponse<T> & {
  error?: string;
  errorId?: string;
};

export type ServerErrorMessage = {
  errorId?: string;
  code: number;
  event: string;
  message: string;
  error?: string;
  data?: unknown;
};

export type ServerBroadcastMessage = {
  sender: "system" | "admin";
  content: MessageContent[];
};

export type ServerRoomMetaMessage = GameRoomMetaInfo;

export type ServerReceiveApplyMessage = {
  applyId: string;
  type: string;
  fromUserId?: string;
  extra?: Record<string, string>;
};

export type ServerApplyDoneMessage = {
  applyId: string;
};

export type ServerRoomWillCloseMessage = {
  countdown: number;
  reason: string;
};

export type ServerRoomCloseMessage = {
  operator: string;
  reason?: string;
  message?: string;
};

export type ServerKickedMessage = {
  operator: string;
  reason: string;
  message?: string;
};

export type ServerDMElectionUpdateMessage = {
  electionId?: string;
  applicantUserId: string;
  voteCount: number;
  requiredVoteCount: number;
  hasVoted: boolean;
};

export type VoicePublicRoomJoinResData = {
  liveKitEndpoint?: string;
  publicRoomId: string;
  publicRoomToken: string;
  dmBroadcastRoomId: string;
  dmBroadcastRoomToken: string;
};

export type VoiceRoomUserInfo = {
  userId: string;
  mutedByAdmin: boolean;
  muted: boolean;
  speakerMuted: boolean;
};

export type VoiceRoomOverviewItem = {
  access?: "open" | "invite";
  allowedUserIds?: string[];
  chatRoomHash?: number;
  chatRoomId: string;
  scene: string;
  users: VoiceRoomUserInfo[];
};

export type ServerVoiceRoomOverviewMessage = {
  isUpdate: boolean;
  rooms: VoiceRoomOverviewItem[];
  removed?: string[];
};

export type ServerVoiceRoomUserStateMessage = {
  roomId: string;
} & VoiceRoomUserInfo;

export type ServerVoiceRoomJoinMessage = {
  chatRoomHash: number;
  chatRoomId: string;
  scene: string;
  token: string;
};

export type ServerVoiceRoomInviteResultMessage = {
  chatRoomId: string;
  userId: string;
  status: "accepted" | "rejected" | "timeout" | "cancelled" | "failed";
};

export type ServerVoiceWillReturnToPublicRoomMessage = {
  countdown: number;
  reason: string;
};

export type ServerPlayerListMessage = {
  isUpdate: boolean;
  players: LimitedRoomPlayerState[];
  removed?: string[];
};

export type ServerGameScriptMessage = {
  scriptId: string | null;
  script?: GameScriptType;
};

export type ServerNightActionRecord = {
  actionId: string;
  targetUserIds: string[];
  result?: string;
  resolution?: NightActionResolution & {
    resolvedAt: number;
    resolvedByUserId: string;
  };
};

export type ServerNightActionProgressMessage = {
  levelDays: number;
  completedActionIds: string[];
  actionRecords: ServerNightActionRecord[];
  updatedAt: number;
};

export type ServerBaseMessage = {
  messageId: string;
  senderUserId: string;
  isDM?: boolean;
  content: MessageContent[];
  context?: NightInfoContext;
  timestamp: number;
};

export type ServerPublicMessage = ServerBaseMessage;

export type ServerPublicMessageHistoryMessage = {
  messages: ServerBaseMessage[];
};

export type ServerDeleteMessageNotification = {
  channel: "public" | "whisper" | "dm_chat" | "dm_skill";
  messageId: string;
};

export type ServerWhisperMessage = ServerBaseMessage & {
  toUserId: string;
};

export type ServerDMMessage = ServerBaseMessage & {
  channel: "chat" | "skill";
  playerUserId: string;
};

export type LevelChangeClearMessage = {
  types: Array<"public" | "whisper" | "dm_chat" | "dm_skill">;
};

export type ServerGameEndMessage = {
  winningTeam?: string;
  winningPlayerIds?: string[];
  result: string;
  isIncomplete: boolean;
};

export type ServerCharacterChangeMessage = {
  characterId?: string;
  isDM?: boolean;
};

export type ServerPlayerEnterMessage = {
  userId: string;
  seat: number;
};

export type ServerPlayerLeaveMessage = {
  userId: string;
  seat: number;
};

export type ServerPlayerBuffMessage = {
  userId: string;
  buffId: string;
};

export type ServerPlayerSkillMessage = {
  userId: string;
  targetUserIds?: string[];
  skillId: string;
};

export type ServerDMEnterMessage = {
  userId: string;
};

export type ServerDMLeaveMessage = {
  userId: string;
};

export type ServerUserEnterMessage = {
  userId: string;
  displayName?: string;
  isAdmin?: boolean;
  isRoomOwner?: boolean;
  isDM?: boolean;
  isPlayer?: boolean;
  disconnectedAt?: number;
};

export type ServerUserLeaveMessage = {
  userId: string;
  displayName?: string;
  isAdmin?: boolean;
  isRoomOwner?: boolean;
  isDM?: boolean;
  isPlayer?: boolean;
  disconnectedAt?: number;
};

export type ServerLevelChangeMessage = {
  level: string;
  levelDays: number;
};

export type ServerStartVoteMessage = {
  sweepVote?: boolean;
  stage?: 'ready' | 'countdown' | 'voting';
  turnDurationMs?: number;
  privateVote?: boolean;
  nominationId: string;
  nominatorUserId: string;
  nomineeUserId: string;
  requiredVotes: number;
  canVote: boolean;
  remainingVotes?: number;
};

export type ServerPlayerVoteStartMessage = {
  stage?: 'ready' | 'countdown' | 'voting';
  turnDurationMs?: number;
  userId: string;
  seat: number;
  /** 当前投票席在队列中的序号（从 1 开始） */
  turnIndex?: number;
  /** 本轮投票总席数 */
  totalTurns?: number;
  /** 本席剩余投票时间（毫秒），未启用倒计时或已暂停时为 undefined */
  turnRemainingMs?: number;
  /** 倒计时是否处于暂停 */
  paused?: boolean;
  /** 投票推进序号，客户端用于丢弃过期的计时同步 */
  sequenceRevision?: number;
};

export type ServerPlayerVoteResultMessage = {
  locked?: boolean;
  userId: string;
  seat: number;
  vote: "yes" | "no" | "abstain" | "skip";
};

export type ServerVoteResultMessage = {
  dismissed?: boolean;
  privateVote?: boolean;
  nominationId: string;
  nominatorUserId: string;
  nomineeUserId: string;
  totalVotes?: number;
  yesVotes?: number;
};

export type DayNominationStatus =
  | "hidden"
  | "voting"
  | "failed"
  | "on-block"
  | "superseded"
  | "tied"
  | "executed"
  | "cancelled";

export type DayNominationRecord = {
  privateVote?: boolean;
  nominationId: string;
  levelDays: number;
  nominatorUserId: string;
  nomineeUserId: string;
  requiredVotes: number;
  yesVotes?: number;
  totalVotes?: number;
  status: DayNominationStatus;
  startedAt: number;
  completedAt?: number;
};

export type ServerDayNominationStateMessage = {
  levelDays: number;
  nominations: DayNominationRecord[];
  highestYesVotes?: number;
  resultsHidden?: boolean;
  executionCandidateUserId?: string;
  executionMarkerUserId?: string;
  tiedCandidateUserIds: string[];
  finalized: boolean;
  executedUserId?: string;
  updatedAt: number;
};

export type ClientRespondApplyMessage = {
  applyId: string;
  accept: boolean;
  message?: MessageContent[];
  extra?: Record<string, string>;
};

export type ClientPongMessage = {
  nonce: string;
};

export type ClientEnterSitMessage = {
  seat: number;
};

export type ClientGetMessageHistory = {
  untilMessageId?: number;
  channel: "public" | "whisper" | "dm_chat" | "dm_skill";
  toUserId?: string;
};

export type ClientSendPublicMessage = {
  content: MessageContent[];
};

export type ClientSendPrivateMessage = {
  toUserId: string;
  content: MessageContent[];
};

export type ClientSendDMMessage = {
  playerUserId?: string;
  channel: "chat" | "skill";
  content: MessageContent[];
  context?: NightInfoContext;
};

export type ClientDeleteMessage = {
  channel: "public" | "whisper" | "dm_chat" | "dm_skill";
  messageId: string;
};

export type ClientSubmitVoteMessage = {
  seat?: number;
  nominationId?: string;
  vote: "yes" | "no" | "abstain";
};

export type ClientUpdateNoteMessage = {
  playerId: string;
  notes: PlayerNote;
};

export type ClientAdminUpdateRoomMetaMessage = {
  roomTags?: GameRoomTag[];
  roomTitle?: string;
  dmElectionMode?: boolean;
};

export type ClientDMTestPlayersMessage =
  | { action: "add"; seat: number; name?: string }
  | { action: "remove"; userId: string }
  | { action: "clear" }
  | { action: "hand"; userId: string; icon: string | null }
  | { action: "vote"; userId: string; vote: ClientSubmitVoteMessage["vote"]; nominationId: string }
  | { action: "election"; userId: string; accept: boolean; applicantUserId: string }
  | { action: "message"; userId: string; channel: TestPlayerChatChannel; text: string; toUserId?: string }
  | { action: "inspect"; userId: string; channel: TestPlayerChatChannel; toUserId?: string };

export type TestPlayerChatChannel = "public" | "whisper" | "dm_chat" | "dm_skill";
export type TestPlayerInspection = {
  messages: ServerBaseMessage[];
  election: ServerDMElectionUpdateMessage | null;
};

export type ClientDMSetSeatCountMessage = {
  seatCount: number;
  /** Previous zero-based seat indices in the new order; null creates an empty seat. */
  seatOrder?: Array<number | null>;
  expectedSeatUsers?: string[];
};

export type ClientDMChangeLevelMessage = {
  nextLevel: string;
};

export type NightActionResolutionEffect = {
  targetUserId: string;
  type: "poisoned" | "protected" | "dead";
};

export type NightActionResolution = {
  effects: NightActionResolutionEffect[];
};

export type ClientDMUpdateNightActionMessage = {
  levelDays: number;
  actionId: string;
  completed?: boolean;
  targetUserIds?: string[];
  result?: string;
  resolution?: NightActionResolution;
};

export type ClientDMAssignRandomCharacterMessage = {
  teamPlayerCount: Record<string, number>;
  setupCharacterIds?: string[];
};

export type ClientDMUpdatePlayerMessage = Partial<Omit<RoomPlayerState, "userId" | "isDM">> & {
  userId: string;
};

export type ClientDMSwapPlayerMessage = {
  seat1: number;
  seat1UserId?: string;
  seat2: number;
  seat2UserId?: string;
};

export type ClientDMSetCustomRulesMessage = {
  customRules: string[];
};

export type ClientDMEndGameMessage = {
  revealMode?: "immediate" | "staged";
  isComplete: boolean;
  result: string;
  winningTeam?: string;
  winningPlayerIds?: string[];
};

export type ClientDMUpdateScriptMessage = {
  scriptId?: string | null;
};

export type ClientDMUpdateConfigMessage = GameConfig;

export type ClientDMSetFabledMessage = {
  fabledRoleIds: string[];
};

export type ClientDMForceLeaveSitMessage = {
  userId: string;
};

export type ClientDMKickUserMessage = {
  userId: string;
  reason?: string;
};

export type DMInvitePlayerMessage = {
  toUserId: string;
};

export type VoteDMMessage = {
  electionId?: string;
  applicantUserId?: string;
  accept: boolean;
};

export type ClientSetDMMessage = {
  userId?: string;
  mode: "set" | "public" | "election";
};

export type ClientRemoveDMMessage = {
  userId?: string;
};

export type ClientVoiceRoomCreateMessage = {
  scene?: string;
  toUserIds: string[];
};

export type ClientVoiceRoomInviteMessage = {
  chatRoomId: string;
  toUserIds: string[];
};

export type ClientVoiceRoomApplyJoinMessage = {
  chatRoomId: string;
};

export type ClientVoiceRoomLeaveMessage = {
  chatRoomId: string;
};

export type ClientVoiceUpdateMuteStateMessage = {
  chatRoomId: string;
  muted?: boolean;
  speakerMuted?: boolean;
};

export type ClientDMVoiceRoomJoinMessage = {
  chatRoomId: string;
};

export type ClientDMVoiceSetUserMuteMessage = {
  userId: string;
  mute: boolean;
  chatRoomId: string;
};

export type ClientDMVoiceSetAllMuteMessage = {
  mute: boolean;
  chatRoomId: string;
};

export type ClientDMVoiceRoomReturnToPublicMessage = {
  delay?: number;
};

export type ClientDMStartVoteMessage = {
  sweepVote?: boolean;
  privateVote?: boolean;
  nominatorUserId: string;
  nomineeUserId: string;
  turnDurationMs?: number;
};

export type ClientDMFinalizeDayMessage =
  | { decision: "execute"; nomineeUserId: string }
  | { decision: "no-execution" };

export type ClientDMSetExecutionMarkerMessage = {
  nomineeUserId: string | null;
};

/** 说书人对进行中投票的控制指令（跳过/暂停/恢复/取消） */
export type ClientDMVoteControlMessage = {
  privateVote?: boolean;
  countdown?: boolean;
  restart?: boolean;
  /** 目标投票记录ID，省略时作用于当前进行中的投票 */
  nominationId?: string;
};

export type SendMessageResData = {
  messageId: string;
};

export type VoiceRoomCreateResData = {
  invitedUserIds?: string[];
  chatRoomHash: number;
  chatRoomId: string;
};

export type VoiceRoomJoinResData = {
  chatRoomId: string;
  token: string;
};

export type GetNotesResData = {
  notes: Record<string, PlayerNote>;
};

export type SocketRequestPayloadMap = {
  [SocketClientEvent.VoicePlaceJoin]: { placeId: string };
  [SocketClientEvent.SetHandSignal]: { icon: string | null };
  [SocketClientEvent.RefreshGameState]: undefined;
  [SocketClientEvent.RespondApply]: ClientRespondApplyMessage;
  [SocketClientEvent.EnterSit]: ClientEnterSitMessage;
  [SocketClientEvent.LeaveSit]: undefined;
  [SocketClientEvent.LeaveRoom]: undefined;
  [SocketClientEvent.GetMessageHistory]: ClientGetMessageHistory;
  [SocketClientEvent.SendPublicMessage]: ClientSendPublicMessage;
  [SocketClientEvent.SendWhisperMessage]: ClientSendPrivateMessage;
  [SocketClientEvent.SendDMMessage]: ClientSendDMMessage;
  [SocketClientEvent.DeleteMessage]: ClientDeleteMessage;
  [SocketClientEvent.SubmitVote]: ClientSubmitVoteMessage;
  [SocketClientEvent.GetNotes]: undefined;
  [SocketClientEvent.UpdateNote]: ClientUpdateNoteMessage;
  [SocketClientEvent.AdminUpdateRoomMeta]: ClientAdminUpdateRoomMetaMessage;
  [SocketClientEvent.DMEnter]: undefined;
  [SocketClientEvent.DMLeave]: undefined;
  [SocketClientEvent.DMTimer]: import("./storyteller").TimerCommand;
  [SocketClientEvent.DMRevealPlayers]: { userIds?: string[]; all?: boolean };
  [SocketClientEvent.DMPublishResult]: Record<string, never>;
  [SocketClientEvent.DMRevealGrimoire]: { revealed: boolean };
  [SocketClientEvent.DMSetSeatCount]: ClientDMSetSeatCountMessage;
  [SocketClientEvent.DMSetSeatRoles]: { assignments: Array<{ seat: number; characterId: string; alignment?: 'good' | 'evil' }>; expectedSeatUsers: string[] };
  [SocketClientEvent.DMSendRoles]: Record<string, never>;
  [SocketClientEvent.DMTestPlayers]: ClientDMTestPlayersMessage;
  [SocketClientEvent.DMChangeLevel]: ClientDMChangeLevelMessage;
  [SocketClientEvent.DMUpdateNightAction]: ClientDMUpdateNightActionMessage;
  [SocketClientEvent.DMAssignRandomCharacter]: ClientDMAssignRandomCharacterMessage;
  [SocketClientEvent.DMUpdatePlayer]: ClientDMUpdatePlayerMessage;
  [SocketClientEvent.DMSwapPlayer]: ClientDMSwapPlayerMessage;
  [SocketClientEvent.DMSetCustomRules]: ClientDMSetCustomRulesMessage;
  [SocketClientEvent.DMEndGame]: ClientDMEndGameMessage;
  [SocketClientEvent.DMUpdateScript]: ClientDMUpdateScriptMessage;
  [SocketClientEvent.DMUpdateConfig]: ClientDMUpdateConfigMessage;
  [SocketClientEvent.DMSetFabled]: ClientDMSetFabledMessage;
  [SocketClientEvent.DMForceLeaveSit]: ClientDMForceLeaveSitMessage;
  [SocketClientEvent.DMKickUser]: ClientDMKickUserMessage;
  [SocketClientEvent.DMInvitePlayer]: DMInvitePlayerMessage;
  [SocketClientEvent.DMStartVote]: ClientDMStartVoteMessage;
  [SocketClientEvent.DMSkipVoter]: ClientDMVoteControlMessage;
  [SocketClientEvent.DMPauseVote]: ClientDMVoteControlMessage;
  [SocketClientEvent.DMResumeVote]: ClientDMVoteControlMessage;
  [SocketClientEvent.DMCancelVote]: ClientDMVoteControlMessage;
  [SocketClientEvent.DMFinalizeDay]: ClientDMFinalizeDayMessage;
  [SocketClientEvent.DMSetExecutionMarker]: ClientDMSetExecutionMarkerMessage;
  [SocketClientEvent.SetDM]: ClientSetDMMessage;
  [SocketClientEvent.RemoveDM]: ClientRemoveDMMessage;
  [SocketClientEvent.ApplyDM]: undefined;
  [SocketClientEvent.CancelApplyDM]: undefined;
  [SocketClientEvent.VoteDM]: VoteDMMessage;
  [SocketClientEvent.VoicePublicRoomJoin]: undefined;
  [SocketClientEvent.VoiceRoomCreate]: ClientVoiceRoomCreateMessage;
  [SocketClientEvent.VoiceRoomInvite]: ClientVoiceRoomInviteMessage;
  [SocketClientEvent.VoiceRoomApplyJoin]: ClientVoiceRoomApplyJoinMessage;
  [SocketClientEvent.VoiceRoomLeave]: ClientVoiceRoomLeaveMessage;
  [SocketClientEvent.VoiceUpdateMuteState]: ClientVoiceUpdateMuteStateMessage;
  [SocketClientEvent.DMVoiceRoomJoin]: ClientDMVoiceRoomJoinMessage;
  [SocketClientEvent.DMVoiceRoomReturnToPublic]: ClientDMVoiceRoomReturnToPublicMessage;
  [SocketClientEvent.VoicePublicRoomJoin]: undefined;
  [SocketClientEvent.VoiceUpdateMuteState]: ClientVoiceUpdateMuteStateMessage;
  [SocketClientEvent.DMVoiceSetUserMute]: ClientDMVoiceSetUserMuteMessage;
  [SocketClientEvent.DMVoiceSetAllMute]: ClientDMVoiceSetAllMuteMessage;
  [SocketClientEvent.DMVoiceSetUserSingleTalk]: ClientDMVoiceSetUserMuteMessage;
};

export type SocketRequestResponseMap = {
  [SocketClientEvent.VoicePlaceJoin]: SocketResponse;
  [SocketClientEvent.SetHandSignal]: SocketResponse;
  [SocketClientEvent.RefreshGameState]: SocketResponse;
  [SocketClientEvent.RespondApply]: SocketResponse;
  [SocketClientEvent.EnterSit]: SocketResponse;
  [SocketClientEvent.LeaveSit]: SocketResponse;
  [SocketClientEvent.LeaveRoom]: SocketResponse;
  [SocketClientEvent.GetMessageHistory]: SocketResponse<ServerPublicMessageHistoryMessage>;
  [SocketClientEvent.SendPublicMessage]: SocketResponse<SendMessageResData>;
  [SocketClientEvent.SendWhisperMessage]: SocketResponse<SendMessageResData>;
  [SocketClientEvent.SendDMMessage]: SocketResponse<SendMessageResData>;
  [SocketClientEvent.DeleteMessage]: SocketResponse;
  [SocketClientEvent.SubmitVote]: SocketResponse;
  [SocketClientEvent.GetNotes]: GetNotesResData;
  [SocketClientEvent.UpdateNote]: SocketResponse;
  [SocketClientEvent.AdminUpdateRoomMeta]: SocketResponse;
  [SocketClientEvent.DMEnter]: SocketResponse;
  [SocketClientEvent.DMLeave]: SocketResponse;
  [SocketClientEvent.DMTimer]: SocketResponse;
  [SocketClientEvent.DMRevealPlayers]: SocketResponse;
  [SocketClientEvent.DMPublishResult]: SocketResponse;
  [SocketClientEvent.DMRevealGrimoire]: SocketResponse;
  [SocketClientEvent.DMSetSeatCount]: SocketResponse;
  [SocketClientEvent.DMSetSeatRoles]: SocketResponse;
  [SocketClientEvent.DMSendRoles]: SocketResponse;
  [SocketClientEvent.DMTestPlayers]: SocketResponse<TestPlayerInspection>;
  [SocketClientEvent.DMChangeLevel]: SocketResponse;
  [SocketClientEvent.DMUpdateNightAction]: SocketResponse<ServerNightActionProgressMessage>;
  [SocketClientEvent.DMAssignRandomCharacter]: SocketResponse;
  [SocketClientEvent.DMUpdatePlayer]: SocketResponse;
  [SocketClientEvent.DMSwapPlayer]: SocketResponse;
  [SocketClientEvent.DMSetCustomRules]: SocketResponse;
  [SocketClientEvent.DMEndGame]: SocketResponse;
  [SocketClientEvent.DMUpdateScript]: SocketResponse;
  [SocketClientEvent.DMUpdateConfig]: SocketResponse;
  [SocketClientEvent.DMSetFabled]: SocketResponse;
  [SocketClientEvent.DMForceLeaveSit]: SocketResponse;
  [SocketClientEvent.DMKickUser]: SocketResponse;
  [SocketClientEvent.DMInvitePlayer]: SocketResponse<{ accepted: boolean }>;
  [SocketClientEvent.DMStartVote]: SocketResponse;
  [SocketClientEvent.DMSkipVoter]: SocketResponse;
  [SocketClientEvent.DMPauseVote]: SocketResponse;
  [SocketClientEvent.DMResumeVote]: SocketResponse;
  [SocketClientEvent.DMCancelVote]: SocketResponse;
  [SocketClientEvent.DMFinalizeDay]: SocketResponse;
  [SocketClientEvent.DMSetExecutionMarker]: SocketResponse;
  [SocketClientEvent.SetDM]: SocketResponse;
  [SocketClientEvent.RemoveDM]: SocketResponse;
  [SocketClientEvent.ApplyDM]: SocketResponse;
  [SocketClientEvent.CancelApplyDM]: SocketResponse;
  [SocketClientEvent.VoteDM]: SocketResponse;
  [SocketClientEvent.VoicePublicRoomJoin]: SocketResponse<VoicePublicRoomJoinResData>;
  [SocketClientEvent.VoiceRoomCreate]: SocketResponse<VoiceRoomCreateResData>;
  [SocketClientEvent.VoiceRoomInvite]: SocketResponse;
  [SocketClientEvent.VoiceRoomApplyJoin]: SocketResponse;
  [SocketClientEvent.VoiceRoomLeave]: SocketResponse;
  [SocketClientEvent.VoiceUpdateMuteState]: SocketResponse;
  [SocketClientEvent.DMVoiceRoomJoin]: SocketResponse<VoiceRoomJoinResData>;
  [SocketClientEvent.DMVoiceRoomReturnToPublic]: SocketResponse;
  [SocketClientEvent.VoicePublicRoomJoin]: SocketResponse<VoicePublicRoomJoinResData>;
  [SocketClientEvent.VoiceUpdateMuteState]: SocketResponse;
  [SocketClientEvent.DMVoiceSetUserMute]: SocketResponse;
  [SocketClientEvent.DMVoiceSetAllMute]: SocketResponse;
  [SocketClientEvent.DMVoiceSetUserSingleTalk]: SocketResponse;
};

export type SocketEmitPayloadMap = {
  [SocketClientEvent.Pong]: ClientPongMessage;
};

export type SocketRequestEvent = keyof SocketRequestPayloadMap;
export type SocketEmitEvent = keyof SocketEmitPayloadMap;

export type ServerPushEventPayloadMap = {
  [SocketServerEvent.BroadcastMessage]: ServerBroadcastMessage;
  [SocketServerEvent.RoomMeta]: ServerRoomMetaMessage;
  [SocketServerEvent.RoomWillClose]: ServerRoomWillCloseMessage;
  [SocketServerEvent.RoomClose]: ServerRoomCloseMessage;
  [SocketServerEvent.Kicked]: ServerKickedMessage;
  [SocketServerEvent.ReceiveApply]: ServerReceiveApplyMessage;
  [SocketServerEvent.ApplyDone]: ServerApplyDoneMessage;
  [SocketServerEvent.PluginRequest]: unknown;
  [SocketServerEvent.DMElectionUpdate]: ServerDMElectionUpdateMessage;
  [SocketServerEvent.HandSignals]: ServerHandSignalsMessage;
  [SocketServerEvent.SeatRoles]: { roles: Record<number, { characterId: string; alignment?: 'good' | 'evil' }> };
  [SocketServerEvent.VoiceRoomOverview]: ServerVoiceRoomOverviewMessage;
  [SocketServerEvent.VoiceRoomUserState]: ServerVoiceRoomUserStateMessage;
  [SocketServerEvent.VoiceRoomJoin]: ServerVoiceRoomJoinMessage;
  [SocketServerEvent.VoiceRoomInviteResult]: ServerVoiceRoomInviteResultMessage;
  [SocketServerEvent.VoiceWillReturnToPublicRoom]: ServerVoiceWillReturnToPublicRoomMessage;
  [SocketServerEvent.PlayerList]: ServerPlayerListMessage;
  [SocketServerEvent.GameState]: GameState;
  [SocketServerEvent.NightActionProgress]: ServerNightActionProgressMessage;
  [SocketServerEvent.GameScript]: ServerGameScriptMessage;
  [SocketServerEvent.GameConfig]: GameConfig;
  [SocketServerEvent.PublicMessage]: ServerPublicMessage;
  [SocketServerEvent.GetMessageHistory]: ServerPublicMessageHistoryMessage;
  [SocketServerEvent.WhisperMessage]: ServerWhisperMessage;
  [SocketServerEvent.DMMessage]: ServerDMMessage;
  [SocketServerEvent.DeleteMessage]: ServerDeleteMessageNotification;
  [SocketServerEvent.LevelChangeClearMessage]: LevelChangeClearMessage;
  [SocketServerEvent.GameEnd]: ServerGameEndMessage;
  [SocketServerEvent.CharacterChange]: ServerCharacterChangeMessage;
  [SocketServerEvent.PlayerEnter]: ServerPlayerEnterMessage;
  [SocketServerEvent.PlayerLeave]: ServerPlayerLeaveMessage;
  [SocketServerEvent.PlayerBuff]: ServerPlayerBuffMessage;
  [SocketServerEvent.PlayerSkill]: ServerPlayerSkillMessage;
  [SocketServerEvent.DMEnter]: ServerDMEnterMessage;
  [SocketServerEvent.DMLeave]: ServerDMLeaveMessage;
  [SocketServerEvent.UserEnter]: ServerUserEnterMessage;
  [SocketServerEvent.UserLeave]: ServerUserLeaveMessage;
  [SocketServerEvent.LevelChange]: ServerLevelChangeMessage;
  [SocketServerEvent.StartVote]: ServerStartVoteMessage;
  [SocketServerEvent.PlayerVoteStart]: ServerPlayerVoteStartMessage;
  [SocketServerEvent.PlayerVoteResult]: ServerPlayerVoteResultMessage;
  [SocketServerEvent.VoteResult]: ServerVoteResultMessage;
  [SocketServerEvent.DayNominationState]: ServerDayNominationStateMessage;
};

export type GameSocketEvents = {
  [SocketServerEvent.Response]: (requestId: string, body: unknown) => void;
  [SocketServerEvent.Error]: (payload: ServerErrorMessage) => void;
} & {
  [K in keyof ServerPushEventPayloadMap]: (payload: ServerPushEventPayloadMap[K]) => void;
};

export type ServerHandSignalsMessage = { signals: Record<string, string> };

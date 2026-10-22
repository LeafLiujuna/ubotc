import type { FabledRole, Player, Role } from "./domain";
import type { ServerPublicMessage } from "./socket";
import type { DisplayPreferences } from "@/utils/settingsStorage";

export interface GrimoireState extends Omit<DisplayPreferences, "background"> {
  isNight: boolean;
  isNightOrder: boolean;
  isPublic: boolean;
  isMenuOpen: boolean;
  isStatic: boolean;
  isMuted: boolean;
  isImageOptIn: boolean;
  isForwardEvilInfo: boolean;
  zoom: number;
  audioThreshold: number;
  background: string | null;
  avatarScale: number;
  tokenScale: number;
  reminderScale: number;
  grimoireOffset: number;
  colorblindMode: number;
  showDecorations: boolean;
  showAnimations: boolean;
  showCustomImages: boolean;
}

export interface ModalsState {
  version: boolean;
  edition: boolean;
  fabled: boolean;
  gameState: boolean;
  nightOrder: boolean;
  reminder: boolean;
  role: boolean;
  roles: boolean;
  voteHistory: boolean;
  settings: boolean;
  input: boolean;
  groupChat: boolean;
  voice: boolean;
  voiceRoom: boolean;
  roomInfo: boolean;
  [key: string]: boolean;
}

export interface WraithRoleState {
  active: boolean;
  using: boolean;
  st: number;
  player: number;
  prob: number;
  probMax: number;
}

export interface SessionState {
  sessionId: string;
  seatId: string | null;
  rooms: unknown;
  isHostAllowed: boolean | null;
  hostTimeout: unknown;
  isJoinAllowed: boolean | null;
  joinTimeout: unknown;
  isRoomActive: boolean;
  gameServerId: string;
  roomTitle: string;
  gameLevel: string;
  gameLevelDays: number;
  isSpectator: boolean;
  isReconnecting: boolean;
  playerCount: number;
  ping: number;
  playerId: string;
  playerName: string;
  playerAvatar: string;
  claimedSeat: number;
  nomination: unknown;
  playerVotes: number;
  isRole: {
    wraith: WraithRoleState;
    [key: string]: unknown;
  };
  votes: unknown[];
  lockedVote: number;
  votingSpeed: number;
  isVoteInProgress: boolean;
  isSecretVote: boolean;
  voteHistory: unknown[];
  voteSelected: unknown[];
  markedPlayer: number;
  isVoteHistoryAllowed: boolean;
  isRolesDistributed: boolean;
  /**
   * The last complete local role deal, indexed by the players array.  Local
   * rooms keep the deal here so the storyteller's later "发送角色" action
   * can re-apply it over any manual grimoire edits.
   */
  roleAssignmentSnapshot: string[];
  isTypesDistributed: boolean;
  isBluffsDistributed: boolean;
  isGrimoireDistributed: boolean;
  isUseOldOrder: Record<string, boolean>;
  isUseOldRole: Record<string, boolean>;
  isReview: boolean;
  isChatOpen: boolean;
  isTyping: boolean;
  messageQueue: unknown[];
  messageUniqueQueue: unknown[];
  chatHistory: unknown[];
  publicMessages: ServerPublicMessage[];
  newStMessage: number[];
  groupChats: unknown[];
  inputType: string;
  inputModal: string;
  inputData: Record<string, unknown>;
  inputResolver: ((value: unknown) => void) | null;
  inputRejecter: ((reason?: unknown) => void) | null;
  bootlegger: string;
  timer: number;
  startTime: number | null;
  lastUpdateTime: number | null;
  interval: ReturnType<typeof setInterval> | null;
  isTalking: boolean;
  listeningFrame: unknown;
  seatStates: Record<string, unknown>;
  speakingPermissions: {
    enabled: boolean;
    onlyAlive: boolean;
    cooldown: number;
    lastSpeakTime: number;
  };
}

export interface PlayersState {
  players: Player[];
  fabled: FabledRole[];
  bluffs: Role[];
  firstNightOrder: string[];
  otherNightOrder: string[];
}

export interface AppState {
  version: string;
  latestVersion: string;
  lastVersion: string;
  grimoire: GrimoireState;
  modals: ModalsState;
  edition: Record<string, unknown>;
  selectedEditions: Record<string, boolean>;
  roles: Map<string, Role>;
  otherTravelers: Map<string, Role>;
  fabled: Map<string, FabledRole>;
  jinxes: Map<string, Map<string, string>>;
  states: unknown[];
  teamsNames: Record<string, string>;
  firstNight: unknown[];
  otherNight: unknown[];
}

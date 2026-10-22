export type RoleTeam =
  | "townsfolk"
  | "outsider"
  | "minion"
  | "demon"
  | "traveler"
  | string;

export interface Role {
  id: string;
  name?: string;
  image?: string;
  ability?: string;
  edition?: string;
  team?: RoleTeam;
  firstNight?: number;
  otherNight?: number;
  reminders?: string[];
  remindersGlobal?: string[];
  jinxes?: unknown[];
  setup?: boolean;
  isCustom?: boolean;
  [key: string]: unknown;
}

export interface PublicPlayerState {
  userId: string;
  isDM?: boolean;
  seat: number;
  isAlive: boolean;
  marks: string[];
  buffs: string[];
  extras?: Record<string, unknown>;

  isSelf?: boolean;
}

export interface PrivatePlayerState {
  characterId: string;
  privateBuffs: string[];
  privateExtras?: Record<string, unknown>;
  demonBluff?: string[];
  voteChancesAfterDeath: number;
}

export interface HiddenPlayerState {
  hiddenBuffs: string[];
  hiddenExtras?: Record<string, unknown>;
}

export interface PlayerNote {
  notes: string;
  marks: string[];
}

export type FullPlayerState = PublicPlayerState & PrivatePlayerState & HiddenPlayerState & PlayerNote;
export type CommonPlayerState = PublicPlayerState & Partial<PrivatePlayerState> & Partial<HiddenPlayerState> & PlayerNote;
export type CurrentPlayerState = PublicPlayerState & PrivatePlayerState & PlayerNote;

export interface Player {
  name: string;
  id: string;
  image: string;
  role: Role;
  isAllowRole: boolean;
  isWraith: boolean;
  isUsingWraith: boolean;
  reminders: unknown[];
  stReminders: unknown[];
  isVoteless: boolean;
  isSecretVoteless: boolean;
  isDead: boolean;
  votes: number;
  pronouns: string;
  newMessages: number;
  chatGroup: string;
  isTalking: boolean;
  [key: string]: unknown;
}

export interface FabledRole {
  id: string;
  name?: string;
  team?: string;
  firstNight?: number;
  otherNight?: number;
  [key: string]: unknown;
}

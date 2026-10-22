export type GameScriptRoleSpecial = {
  name: string;
  type: 'reveal' | 'signal' | 'selection' | 'vote' | 'player' | 'ability';
  value?: any;
}

export type GameScriptCharacterSkill = {
  id: string;
  name: string;
  description: string;
  image?: string;
  animation?: string;
  isPassive?: boolean;
  target: 'self' | 'single' | 'multiple' | 'all';
}

export type GameScriptCharacterJinx = {
  id: string;
  reason: string;
}

export type GameScriptCharacter = {
  id: string;
  name: string;
  team: string;
  ability: string;
  skills?: GameScriptCharacterSkill[];
  image?: string;
  flavor?: string;
  edition?: string;
  firstDay?: number;
  otherDay?: number;
  firstDayReminder?: string;
  otherDayReminder?: string;
  firstNight?: number;
  otherNight?: number;
  firstNightReminder?: string;
  otherNightReminder?: string;
  reminders?: string[];
  remindersGlobal?: string[];
  jinxes?: GameScriptCharacterJinx[];
  /** 不会静默进入随机池，需要说书人显式选择或手动配置。 */
  setup?: boolean;
  special?: GameScriptRoleSpecial[];
}

export type GameSpecialCharacters = {
  id: string;
  name?: string;
  description?: string;
  image?: string;
  value?: any;
}

export type GameScriptTeamPlayerNumTable = Record<string, string | number[]>;

export type GameScriptType = {
  name: string;
  description?: string;
  author?: string;
  logo?: string;
  additional?: Record<string, string>[];
  customLabels?: Record<string, string>;
  characters: GameScriptCharacter[];
  specialCharacters?: GameSpecialCharacters[];
  teamPlayerNumTable: GameScriptTeamPlayerNumTable;
}

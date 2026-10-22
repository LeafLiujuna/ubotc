import { GameStateWithPlayers } from "./game";

export type NightInfoContext = {
  kind: "night-info";
  levelDays: number;
  actionId: string;
  section: "first" | "other";
  templateId?: string;
};

export type MessageTextContent = { type: "text"; text: string };
export type MessageImageContent = { type: "image"; id: string };
export type MessageVoiceContent = { type: "voice"; id: string; duration?: number };
export type MessageEmojiContent = { type: "emoji"; id: string; shape?: string };
export type MessageGameStateContent = { type: "gameState"; state?: GameStateWithPlayers };
export type MessageCharacterContent = { type: "character"; characterId: string };
export type MessagePlayerContent = { type: "player"; userId: string };
export type MessageBuffContent = { type: "buff"; buffId: string };

export type MessageContent = (MessageTextContent
  | MessageImageContent
  | MessageVoiceContent
  | MessageEmojiContent
  | MessageGameStateContent
  | MessageCharacterContent
  | MessagePlayerContent
  | MessageBuffContent) & { newLine?: boolean };

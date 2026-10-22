import type { MessageContent } from '@/types/message';
import type { ServerBaseMessage } from '@/types/socket';
import type { NightInfoContext } from '@/types/message';

export type NightConversationMessage = ServerBaseMessage & { context: NightInfoContext };
export function nightConversation(messages: ServerBaseMessage[]): NightConversationMessage[] {
  return messages.filter((item): item is NightConversationMessage => item.context?.kind === 'night-info')
    .sort((left, right) => left.timestamp - right.timestamp || left.messageId.localeCompare(right.messageId, undefined, { numeric: true }));
}
export function nightWakeStatus(messages: ServerBaseMessage[], levelDays: number, playerUserId: string, readIds: string[]) {
  const current = nightConversation(messages).filter(item => item.context.levelDays === levelDays
    && (item.isDM === true || item.senderUserId === playerUserId));
  if (!current.some(item => item.isDM && !item.context.actionId.startsWith('reply:'))) return null;
  const latest = current.at(-1)!;
  const unread = !latest.isDM && !readIds.includes(latest.messageId);
  // The reference uses a thumbs-up for a standalone acknowledgement in either
  // direction. Other replies become an open eye until the storyteller reads them.
  const acknowledged = latest.content.length > 0 && latest.content.every(item => item.type === 'text')
    && latest.content.map(item => item.type === 'text' ? item.text : '').join('').trim() === '了解';
  return { icon: acknowledged ? 'thumbs-up' : unread ? 'eye' : 'eye-slash', unread };
}
export type NightMessageDraft = { type: 'text'; text: string; tone?: string }
  | { type: 'player'; userId: string; seat?: number } | { type: 'character'; characterId: string } | { type: 'break' };
export function nightReplyActionId(messageId: string): string { return `reply:${messageId}`; }
export type NightMessageCard = { id: string; text: string; icon: string; tone: string };
export const nightMessageCards: NightMessageCard[] = [
  { id: 'use-ability', text: '你要使用你的能力吗？', icon: 'moon', tone: 'brown' },
  { id: 'choose', text: '做出你的选择', icon: 'wand-magic-sparkles', tone: 'brown' },
  { id: 'not-in-play', text: '这些角色不在场', icon: 'eye-slash', tone: 'blue' },
  { id: 'demon', text: '他是恶魔', icon: 'skull', tone: 'red' },
  { id: 'minions', text: '他们是你的爪牙', icon: 'users', tone: 'red' },
  { id: 'you-are', text: '你是', icon: 'user', tone: 'purple' },
  { id: 'player-is', text: '这名玩家是', icon: 'magnifying-glass', tone: 'purple' },
  { id: 'ability-affects-you', text: '该角色的能力对你生效', icon: 'wand-magic-sparkles', tone: 'green' },
];
export function renderMessageContent(content: MessageContent[], playerLabel: (id: string) => string, roleLabel: (id: string) => string): string {
  return content.map((item, index) => {
    const label = item.type === 'text' ? item.text : item.type === 'player' ? playerLabel(item.userId)
      : item.type === 'character' ? roleLabel(item.characterId)
        : ({ image: '[图片]', voice: '[语音]', emoji: '[表情]', gameState: '[游戏状态]', buff: '[状态]' }[item.type] || '[内容]');
    return `${index ? item.newLine ? '\n' : ' ' : ''}${label}`;
  }).join('').trim();
}

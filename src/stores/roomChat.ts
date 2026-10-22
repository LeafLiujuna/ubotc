import { defineStore } from "pinia";
import type { ServerBaseMessage } from "@/types/socket";
import type { NightInfoContext } from "@/types/message";

export type PrivateRoomChatChannel = "whisper" | "dm_chat" | "dm_skill";
export type TextRoomChatChannel = "whisper" | "dm_chat";

export function roomChatConversationKey(
  channel: PrivateRoomChatChannel,
  targetUserId: string,
): string {
  return `${channel}:${targetUserId}`;
}

function mergeMessages(
  current: ServerBaseMessage[],
  incoming: ServerBaseMessage[],
): ServerBaseMessage[] {
  const byId = new Map<string, ServerBaseMessage>();
  for (const message of [...current, ...incoming]) {
    byId.set(message.messageId, message);
  }
  return [...byId.values()]
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-100);
}

export type RoomChatDelivery = {
  channel: PrivateRoomChatChannel;
  targetUserId: string;
  senderUserId: string;
  messageId: string;
};

export type NightInfoMessage = ServerBaseMessage & {
  context: NightInfoContext;
};

export const useRoomChatStore = defineStore("roomChat", {
  state: () => ({
    messagesByConversation: {} as Record<string, ServerBaseMessage[]>,
    textReadMessageIds: {} as Record<string, string[]>,
    nightReadMessageIds: {} as Record<string, string[]>,
    /**
     * The most recent LIVE private message (socket push). History loads go
     * through mergeConversation and deliberately do not touch this — it exists
     * so the table can play the whisper-envelope animation exactly once per
     * real delivery.
     */
    lastDelivery: null as RoomChatDelivery | null,
  }),
  actions: {
    getTextUnreadCount(
      readerUserId: string,
      channel: TextRoomChatChannel,
      targetUserId: string,
    ): number {
      if (!readerUserId || !targetUserId) return 0;
      if (channel !== "whisper" && channel !== "dm_chat") return 0;
      const readIds = new Set(this.textReadMessageIds[
        JSON.stringify([readerUserId, channel, targetUserId])
      ] || []);
      return this.getMessages(channel, targetUserId)
        .filter(message => message.senderUserId !== readerUserId && !readIds.has(message.messageId))
        .length;
    },
    markTextConversationRead(
      readerUserId: string,
      channel: TextRoomChatChannel,
      targetUserId: string,
    ): void {
      if (!readerUserId || !targetUserId) return;
      if (channel !== "whisper" && channel !== "dm_chat") return;
      const key = JSON.stringify([readerUserId, channel, targetUserId]);
      const ids = this.getMessages(channel, targetUserId).map(message => message.messageId);
      if (ids.some(id => !this.textReadMessageIds[key]?.includes(id))) {
        this.textReadMessageIds[key] = [...new Set([...(this.textReadMessageIds[key] || []), ...ids])].slice(-100);
      }
    },
    getNightReadIds(readerUserId: string, targetUserId: string): string[] {
      return this.nightReadMessageIds[JSON.stringify([readerUserId, targetUserId])] || [];
    },
    markNightConversationRead(readerUserId: string, targetUserId: string): void {
      if (!readerUserId || !targetUserId) return;
      const key = JSON.stringify([readerUserId, targetUserId]);
      const ids = this.getMessages('dm_skill', targetUserId)
        .filter(item => item.context?.kind === 'night-info' && !item.isDM && item.senderUserId === targetUserId)
        .map(item => item.messageId);
      if (ids.length && ids.some(id => !this.nightReadMessageIds[key]?.includes(id))) {
        this.nightReadMessageIds[key] = [...new Set([...(this.nightReadMessageIds[key] || []), ...ids])].slice(-100);
      }
    },
    getMessages(
      channel: PrivateRoomChatChannel,
      targetUserId: string,
    ): ServerBaseMessage[] {
      return this.messagesByConversation[
        roomChatConversationKey(channel, targetUserId)
      ] || [];
    },
    mergeConversation(
      channel: PrivateRoomChatChannel,
      targetUserId: string,
      messages: ServerBaseMessage[],
    ): void {
      const key = roomChatConversationKey(channel, targetUserId);
      this.messagesByConversation[key] = mergeMessages(
        this.messagesByConversation[key] || [],
        messages,
      );
    },
    addMessage(
      channel: PrivateRoomChatChannel,
      targetUserId: string,
      message: ServerBaseMessage,
    ): void {
      this.mergeConversation(channel, targetUserId, [message]);
      this.lastDelivery = {
        channel,
        targetUserId,
        senderUserId: message.senderUserId,
        messageId: message.messageId,
      };
    },
    removeMessage(messageId: string): void {
      for (const key of Object.keys(this.messagesByConversation)) {
        this.messagesByConversation[key] = this.messagesByConversation[key]
          .filter((message) => message.messageId !== messageId);
      }
    },
    clearChannel(channel: PrivateRoomChatChannel): void {
      if (channel === 'dm_skill') this.nightReadMessageIds = {};
      for (const key of Object.keys(this.textReadMessageIds)) {
        if (JSON.parse(key)[1] === channel) delete this.textReadMessageIds[key];
      }
      const prefix = `${channel}:`;
      for (const key of Object.keys(this.messagesByConversation)) {
        if (key.startsWith(prefix)) delete this.messagesByConversation[key];
      }
    },
    resetRoomState(): void {
      this.messagesByConversation = {};
      this.textReadMessageIds = {};
      this.nightReadMessageIds = {};
      this.lastDelivery = null;
    },
  },
});

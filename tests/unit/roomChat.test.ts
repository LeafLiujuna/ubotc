import { beforeEach, describe, expect, test } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useRoomChatStore } from "@/stores/roomChat";
import type { ServerBaseMessage } from "@/types/socket";

beforeEach(() => {
  setActivePinia(createPinia());
});

function message(messageId: string, senderUserId = "other"): ServerBaseMessage {
  return {
    messageId,
    senderUserId,
    content: [{ type: "text", text: `message ${messageId}` }],
    timestamp: Number(messageId),
  };
}

describe("ordinary text conversation unread messages", () => {
  test("counts received messages once when history and live delivery overlap", () => {
    const chat = useRoomChatStore();
    const received = message("1");
    chat.mergeConversation("whisper", "other", [received]);
    chat.addMessage("whisper", "other", received);

    expect(chat.getTextUnreadCount("me", "whisper", "other")).toBe(1);
    expect(chat.getMessages("whisper", "other")).toEqual([received]);
  });

  test("does not count messages sent by the reader", () => {
    const chat = useRoomChatStore();
    chat.addMessage("dm_chat", "me", message("1", "me"));
    chat.addMessage("dm_chat", "me", message("2", "storyteller"));

    expect(chat.getTextUnreadCount("me", "dm_chat", "me")).toBe(1);
    expect(chat.getTextUnreadCount("storyteller", "dm_chat", "me")).toBe(1);
  });

  test("marks loaded messages as read and counts only later incoming messages", () => {
    const chat = useRoomChatStore();
    chat.addMessage("whisper", "other", message("1"));
    chat.addMessage("whisper", "other", message("2", "me"));
    chat.markTextConversationRead("me", "whisper", "other");

    expect(chat.getTextUnreadCount("me", "whisper", "other")).toBe(0);
    chat.addMessage("whisper", "other", message("1"));
    chat.addMessage("whisper", "other", message("3"));
    expect(chat.getTextUnreadCount("me", "whisper", "other")).toBe(1);

    chat.markTextConversationRead("me", "whisper", "other");
    chat.markTextConversationRead("me", "whisper", "other");
    expect(chat.getTextUnreadCount("me", "whisper", "other")).toBe(0);
    expect(chat.textReadMessageIds[JSON.stringify(["me", "whisper", "other"])]).toEqual(["1", "2", "3"]);
  });

  test("keeps read state separate for each reader, channel and target", () => {
    const chat = useRoomChatStore();
    chat.addMessage("whisper", "first", message("1"));
    chat.addMessage("whisper", "second", message("1"));
    chat.addMessage("dm_chat", "first", message("1"));
    chat.markTextConversationRead("me", "whisper", "first");

    expect(chat.getTextUnreadCount("me", "whisper", "first")).toBe(0);
    expect(chat.getTextUnreadCount("another-reader", "whisper", "first")).toBe(1);
    expect(chat.getTextUnreadCount("me", "whisper", "second")).toBe(1);
    expect(chat.getTextUnreadCount("me", "dm_chat", "first")).toBe(1);
    expect(chat.getTextUnreadCount("", "whisper", "first")).toBe(0);
    expect(chat.getTextUnreadCount("me", "whisper", "")).toBe(0);
  });

  test("clears only the selected channel's messages and read state", () => {
    const chat = useRoomChatStore();
    chat.addMessage("whisper", "other", message("1"));
    chat.addMessage("dm_chat", "me", message("2"));
    chat.addMessage("dm_skill", "other", {
      ...message("3"),
      context: { kind: "night-info", levelDays: 1, actionId: "reply", section: "first" },
    });
    chat.markTextConversationRead("me", "whisper", "other");
    chat.markTextConversationRead("me", "dm_chat", "me");
    chat.markNightConversationRead("me", "other");
    chat.clearChannel("whisper");

    expect(chat.getMessages("whisper", "other")).toEqual([]);
    expect(chat.textReadMessageIds[JSON.stringify(["me", "whisper", "other"])]).toBeUndefined();
    expect(chat.textReadMessageIds[JSON.stringify(["me", "dm_chat", "me"])]).toEqual(["2"]);
    expect(chat.getNightReadIds("me", "other")).toEqual(["3"]);

    chat.addMessage("whisper", "other", message("1"));
    expect(chat.getTextUnreadCount("me", "whisper", "other")).toBe(1);
    chat.clearChannel("dm_skill");
    expect(chat.getNightReadIds("me", "other")).toEqual([]);
    expect(chat.getTextUnreadCount("me", "dm_chat", "me")).toBe(0);
    expect(chat.textReadMessageIds[JSON.stringify(["me", "dm_chat", "me"])]).toEqual(["2"]);
    chat.clearChannel("dm_chat");
    expect(chat.textReadMessageIds).toEqual({});
  });

  test("resets all room messages, deliveries and text read state", () => {
    const chat = useRoomChatStore();
    chat.addMessage("whisper", "other", message("1"));
    chat.markTextConversationRead("me", "whisper", "other");
    chat.addMessage("dm_chat", "me", message("2"));
    chat.markTextConversationRead("me", "dm_chat", "me");
    chat.resetRoomState();

    expect(chat.messagesByConversation).toEqual({});
    expect(chat.textReadMessageIds).toEqual({});
    expect(chat.lastDelivery).toBeNull();
    chat.addMessage("whisper", "other", message("1"));
    expect(chat.getTextUnreadCount("me", "whisper", "other")).toBe(1);
  });
});

import { beforeEach, describe, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises } from "@vue/test-utils";
import TownSquare from "@/components/TownSquare.vue";
import { useGameStore } from "@/stores/game";
import { useRoomChatStore } from "@/stores/roomChat";
import { useSessionStore } from "@/stores/session";
import { SocketClientEvent } from "@/types/socket";

const methods = TownSquare.methods;

beforeEach(() => {
  setActivePinia(createPinia());
  window.$toast = { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() };
});

function createContext() {
  const session = useSessionStore();
  session.setApiRoomSession({ roomId: "ROOM", gameServerId: "server" });
  session.setPlayerId("me");
  session.claimSeat(0);
  const gameStore = useGameStore();
  gameStore.currentPlayer = { userId: "me", seat: 1, isDM: false };
  const context = {
    session,
    gameStore,
    roomChatStore: useRoomChatStore(),
    gameController: { isConnected: true, request: vi.fn().mockResolvedValue({ status: 200, data: { messages: [] } }) },
    players: [
      { id: "me", name: "我" },
      { id: "clock", name: "钟匠" },
      { id: "raven", name: "鸦羽" },
      { id: "moon", name: "月影" },
    ],
    actionSeatIndex: -1,
    apiChatChannel: "public",
    apiChatTargetUserId: "",
    apiChatTargetName: "",
    apiChatLoadGeneration: 0,
    apiChatLoading: false,
    chatDrafts: {},
    chatLastTargets: {},
    chatConversationsOpen: false,
    chatConversationFilter: "",
    message: "",
    chatError: "",
    chatSending: false,
    isChatMin: false,
    minimising: false,
    closeSeatActions: vi.fn(),
    scrollToBottom: vi.fn(),
    $refs: { message: { focus: vi.fn() } },
    $nextTick: vi.fn(callback => { callback?.(); return Promise.resolve(); }),
  };
  for (const name of [
    "canTextChatWithSeat", "openPrivateChat", "openStorytellerChat", "openSystemChat",
    "selectTextConversation", "loadApiChatHistory", "markTextConversationRead", "maximiseChat",
    "setChatOpen", "playerDisplayName", "sendChat", "toggleTextConversations",
  ]) context[name] = methods[name].bind(context);
  for (const name of ["isApiRoom", "apiChatScope", "apiChatConversationKey", "canSendChat", "textConversations"]) {
    Object.defineProperty(context, name, { get: () => TownSquare.computed[name].call(context) });
  }
  return context;
}

function incoming(messageId, senderUserId = "clock") {
  return { messageId, senderUserId, timestamp: Number(messageId), content: [{ type: "text", text: `消息 ${messageId}` }] };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe("TownSquare desktop text chat", () => {
  test.each(['dm_chat', 'dm_skill'])("keeps %s deliveries quiet for the sender and receiver", channel => {
    for (const reader of ['storyteller', 'player', 'other-storyteller']) {
      const context = {
        isApiRoom: true, session: { playerId: reader },
        elementForUserId: vi.fn(), flyEnvelope: vi.fn(),
      };
      for (const sender of ['storyteller', 'player']) {
        methods.animateWhisperDelivery.call(context, { channel, targetUserId: 'player', senderUserId: sender });
      }
      expect(context.elementForUserId).not.toHaveBeenCalled();
      expect(context.flyEnvelope).not.toHaveBeenCalled();
    }
  });

  test("still animates live neighbor whispers in both participants' windows", () => {
    const senderElement = document.createElement('button');
    const receiverElement = document.createElement('button');
    for (const reader of ['sender', 'receiver']) {
      const context = {
        isApiRoom: true, session: { playerId: reader },
        elementForUserId: id => id === 'sender' ? senderElement : receiverElement,
        flyEnvelope: vi.fn(),
      };
      methods.animateWhisperDelivery.call(context, {
        channel: 'whisper', senderUserId: 'sender', targetUserId: reader === 'sender' ? 'receiver' : 'sender',
      });
      expect(context.flyEnvelope).toHaveBeenCalledTimes(1);
      expect(context.flyEnvelope).toHaveBeenCalledWith(senderElement, receiverElement);
    }
  });

  test("uses the supplied seat index for adjacent and wraparound seats without a seat action menu", async () => {
    const context = createContext();
    context.actionSeatIndex = 2;
    expect(context.canTextChatWithSeat(1)).toBe(true);
    expect(context.canTextChatWithSeat(3)).toBe(true);
    expect(context.canTextChatWithSeat(2)).toBe(false);
    expect(context.canTextChatWithSeat(0)).toBe(false);
    expect(context.canTextChatWithSeat(-1)).toBe(false);

    context.actionSeatIndex = -1;
    await context.openPrivateChat(3);
    expect(context.apiChatChannel).toBe("whisper");
    expect(context.apiChatTargetUserId).toBe("moon");
    expect(context.session.isChatOpen).toBe(true);
    expect(context.gameController.request).toHaveBeenCalledWith(SocketClientEvent.GetMessageHistory, { channel: "whisper", toUserId: "moon" });

    context.session.claimSeat(3);
    context.players = [{ id: "clock" }, { id: "raven" }, { id: "moon" }, { id: "me" }];
    expect(context.canTextChatWithSeat(0)).toBe(true);
    expect(context.canTextChatWithSeat(2)).toBe(true);
    expect(context.canTextChatWithSeat(1)).toBe(false);
  });

  test("honors the text whisper setting and requires an occupied connected seat", async () => {
    const context = createContext();
    context.gameStore.gameConfig = { allowTextWhispers: false };
    expect(context.canTextChatWithSeat(1)).toBe(false);
    await context.openPrivateChat(1);
    expect(context.gameController.request).not.toHaveBeenCalled();
    expect(context.apiChatChannel).toBe("public");

    context.gameStore.gameConfig = { allowTextWhispers: true };
    context.players[1] = { id: "" };
    expect(context.canTextChatWithSeat(1)).toBe(false);
    context.players[1] = { id: "clock" };
    context.gameController.isConnected = false;
    expect(context.canTextChatWithSeat(1)).toBe(false);
    context.gameController.isConnected = true;
    context.session.claimSeat(-1);
    expect(context.canTextChatWithSeat(1)).toBe(false);
    context.session.claimSeat(0);
    context.gameStore.currentPlayer = null;
    expect(context.canTextChatWithSeat(1)).toBe(false);
  });

  test("allows the storyteller to open a player conversation independently of whisper settings", async () => {
    const context = createContext();
    context.gameStore.currentPlayer = { userId: "me", seat: 0, isDM: true };
    context.gameStore.gameConfig = { allowTextWhispers: false };
    context.session.claimSeat(-1);
    expect(context.canTextChatWithSeat(2)).toBe(true);
    await context.openPrivateChat(2);
    expect(context.apiChatChannel).toBe("dm_chat");
    expect(context.apiChatTargetUserId).toBe("raven");
  });

  test("switches a player's adjacent whisper to their own storyteller conversation", async () => {
    const context = createContext();
    context.apiChatChannel = "whisper";
    context.apiChatTargetUserId = "clock";
    context.message = "给钟匠的草稿";
    context.openStorytellerChat();
    await flushPromises();

    expect(context.apiChatChannel).toBe("dm_chat");
    expect(context.apiChatTargetUserId).toBe("me");
    expect(context.chatDrafts["whisper:clock"]).toBe("给钟匠的草稿");
    expect(context.gameController.request).toHaveBeenCalledWith(SocketClientEvent.GetMessageHistory, { channel: "dm_chat", toUserId: "me" });
  });

  test("saves and restores separate drafts while marking only the opened conversation read", async () => {
    const context = createContext();
    context.roomChatStore.addMessage("whisper", "clock", incoming("1"));
    context.roomChatStore.addMessage("whisper", "moon", incoming("2", "moon"));
    context.message = "公聊草稿";
    context.selectTextConversation({ channel: "whisper", targetUserId: "clock", name: "钟匠" });
    expect(context.chatDrafts["public:"]).toBe("公聊草稿");
    expect(context.roomChatStore.getTextUnreadCount("me", "whisper", "clock")).toBe(0);
    expect(context.roomChatStore.getTextUnreadCount("me", "whisper", "moon")).toBe(1);

    context.message = "给钟匠的草稿";
    context.selectTextConversation({ channel: "whisper", targetUserId: "moon", name: "月影" });
    context.message = "给月影的草稿";
    context.selectTextConversation({ channel: "whisper", targetUserId: "clock", name: "钟匠" });
    expect(context.message).toBe("给钟匠的草稿");
    expect(context.chatDrafts["whisper:moon"]).toBe("给月影的草稿");
    expect(context.chatLastTargets.whisper).toBe("clock");
    expect(context.chatConversationsOpen).toBe(false);
    await flushPromises();
  });

  test("switching to system messages invalidates an in-flight private history", async () => {
    const context = createContext();
    const history = deferred();
    context.gameController.request.mockReturnValue(history.promise);
    context.apiChatChannel = "whisper";
    context.apiChatTargetUserId = "clock";
    const load = context.loadApiChatHistory();
    const generation = context.apiChatLoadGeneration;
    context.message = "未发送文字";
    context.openSystemChat();
    expect(context.apiChatLoadGeneration).toBeGreaterThan(generation);
    expect(context.apiChatLoading).toBe(false);
    expect(context.canSendChat).toBe(false);
    history.resolve({ status: 200, data: { messages: [incoming("1")] } });
    await load;

    expect(context.apiChatChannel).toBe("system");
    expect(context.apiChatTargetUserId).toBe("");
    expect(context.chatDrafts["whisper:clock"]).toBe("未发送文字");
    expect(context.roomChatStore.messagesByConversation).toEqual({});
    expect(context.gameController.request).toHaveBeenCalledOnce();
  });

  test("only the latest history request merges into its captured conversation", async () => {
    const context = createContext();
    const first = deferred();
    const second = deferred();
    context.gameController.request.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    context.apiChatChannel = "whisper";
    context.apiChatTargetUserId = "clock";
    const firstLoad = context.loadApiChatHistory();
    context.selectTextConversation({ channel: "whisper", targetUserId: "moon", name: "月影" });
    expect(context.gameController.request.mock.calls).toEqual([
      [SocketClientEvent.GetMessageHistory, { channel: "whisper", toUserId: "clock" }],
      [SocketClientEvent.GetMessageHistory, { channel: "whisper", toUserId: "moon" }],
    ]);

    first.resolve({ status: 200, data: { messages: [incoming("1")] } });
    await firstLoad;
    expect(context.roomChatStore.getMessages("whisper", "clock")).toEqual([]);
    expect(context.apiChatLoading).toBe(true);
    const received = incoming("2", "moon");
    second.resolve({ status: 200, data: { messages: [received] } });
    await flushPromises();
    expect(context.roomChatStore.getMessages("whisper", "moon")).toEqual([received]);
    expect(context.roomChatStore.getTextUnreadCount("me", "whisper", "moon")).toBe(0);
    expect(context.apiChatLoading).toBe(false);
  });

  test.each([
    ["room", context => context.session.setApiRoomSession({ roomId: "OTHER", gameServerId: "server" })],
    ["server", context => context.session.setApiRoomSession({ roomId: "ROOM", gameServerId: "other-server" })],
    ["reader", context => context.session.setPlayerId("other-user")],
    ["storyteller role", context => { context.gameStore.currentPlayer = { userId: "me", seat: 0, isDM: true }; }],
  ])("drops history when its %s scope changes even before the scope watcher runs", async (_label, changeScope) => {
    const context = createContext();
    const history = deferred();
    context.gameController.request.mockReturnValue(history.promise);
    context.apiChatChannel = "whisper";
    context.apiChatTargetUserId = "clock";
    const load = context.loadApiChatHistory();
    const generation = context.apiChatLoadGeneration;
    changeScope(context);
    expect(context.apiChatLoadGeneration).toBe(generation);
    history.resolve({ status: 200, data: { messages: [incoming("1")] } });
    await load;
    expect(context.roomChatStore.messagesByConversation).toEqual({});
  });

  test("an older request for the same conversation cannot overwrite the latest generation", async () => {
    const context = createContext();
    const first = deferred();
    const second = deferred();
    context.gameController.request.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    context.apiChatChannel = "whisper";
    context.apiChatTargetUserId = "clock";
    const firstLoad = context.loadApiChatHistory();
    const secondLoad = context.loadApiChatHistory();
    first.reject(new Error("旧请求失败"));
    await firstLoad;
    expect(context.chatError).toBe("");
    expect(context.apiChatLoading).toBe(true);
    second.resolve({ status: 200, data: { messages: [incoming("2")] } });
    await secondLoad;
    expect(context.roomChatStore.getMessages("whisper", "clock").map(message => message.messageId)).toEqual(["2"]);
    expect(context.apiChatLoading).toBe(false);
  });

  test("finishing a send clears its sent draft and preserves another open conversation's draft", async () => {
    const context = createContext();
    const send = deferred();
    context.gameController.request.mockImplementation(event => event === SocketClientEvent.SendWhisperMessage
      ? send.promise : Promise.resolve({ status: 200, data: { messages: [] } }));
    context.apiChatChannel = "whisper";
    context.apiChatTargetUserId = "clock";
    context.message = "发给钟匠";
    const sending = context.sendChat();
    expect(context.gameController.request).toHaveBeenCalledWith(SocketClientEvent.SendWhisperMessage, {
      toUserId: "clock", content: [{ type: "text", text: "发给钟匠" }],
    });
    context.selectTextConversation({ channel: "whisper", targetUserId: "moon", name: "月影" });
    context.message = "给月影的新草稿";
    context.chatDrafts["whisper:moon"] = "给月影的新草稿";
    send.resolve({ status: 200, data: { messageId: "1" } });
    await sending;

    expect(context.message).toBe("给月影的新草稿");
    expect(context.chatDrafts["whisper:moon"]).toBe("给月影的新草稿");
    expect(context.chatDrafts["whisper:clock"]).toBe("");
    expect(context.chatSending).toBe(false);
  });

  test("finishing a send preserves edits made in the same conversation", async () => {
    const context = createContext();
    const send = deferred();
    context.gameController.request.mockReturnValue(send.promise);
    context.apiChatChannel = "whisper";
    context.apiChatTargetUserId = "clock";
    context.message = "原消息";
    const sending = context.sendChat();
    context.message = "后续草稿";
    send.resolve({ status: 200 });
    await sending;
    expect(context.message).toBe("后续草稿");
    expect(context.chatSending).toBe(false);
  });
});

import { beforeEach, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import TestPlayerPanel from "@/components/TestPlayerPanel.vue";
import { useGameController } from "@/controllers/GameController";
import { useGameStore } from "@/stores/game";
import { usePlayersStore } from "@/stores/players";
import { useRealtimeVoteStore } from "@/stores/realtimeVote";
import { SocketClientEvent } from "@/types/socket";

beforeEach(() => {
  setActivePinia(createPinia());
  useGameStore().currentPlayer = { isDM: true } as never;
  useGameController().connectionStatus = "connected";
  useGameController().gameSocket = {} as never;
  usePlayersStore().add({ id: "real", name: "真实玩家" });
  usePlayersStore().add("");
  usePlayersStore().add("");
  vi.spyOn(useGameController(), "refreshGameState").mockResolvedValue({ status: 200 });
});

async function open() {
  const wrapper = mount(TestPlayerPanel);
  await wrapper.get(".test-players__toggle").trigger("click");
  return wrapper;
}

test("selects a free seat and submits the chosen number and trimmed nickname once", async () => {
  const controller = useGameController();
  let resolve!: (value: { status: number }) => void;
  const request = vi.spyOn(controller, "request").mockImplementation(() => new Promise(done => { resolve = done; }) as never);
  const wrapper = await open();
  expect(wrapper.get("select").element.value).toBe("2");
  expect(wrapper.get('option[value="1"]').attributes("disabled")).toBeDefined();
  await wrapper.get("select").setValue("3");
  await wrapper.get("input").setValue("  小三  ");
  await wrapper.get("form").trigger("submit");
  await wrapper.get("form").trigger("submit");
  expect(request).toHaveBeenCalledOnce();
  expect(request).toHaveBeenCalledWith(SocketClientEvent.DMTestPlayers, { action: "add", seat: 3, name: "小三" });
  expect(wrapper.get(".test-players__add").attributes("disabled")).toBeDefined();
  resolve({ status: 200 });
  await flushPromises();
  expect(controller.refreshGameState).toHaveBeenCalledOnce();
  expect(wrapper.text()).toContain("已在 3 号位添加虚拟玩家");
  wrapper.unmount();
});

test("shows request errors without inventing a seated player", async () => {
  vi.spyOn(useGameController(), "request").mockRejectedValue(new Error("该座位已被占用"));
  const wrapper = await open();
  await wrapper.get("form").trigger("submit");
  await flushPromises();
  expect(wrapper.get('[role="alert"]').text()).toBe("该座位已被占用");
  expect(usePlayersStore().players[1].id).toBe("");
  wrapper.unmount();
});

test("disables mutations after game start, on disconnect, and after losing DM permissions", async () => {
  const request = vi.spyOn(useGameController(), "request");
  const wrapper = await open();
  for (const apply of [
    () => { useGameStore().level = "night"; },
    () => { useGameStore().level = "prepare"; useGameController().connectionStatus = "disconnected"; },
    () => { useGameController().connectionStatus = "connected"; useGameStore().currentPlayer = null; },
  ]) {
    apply();
    await wrapper.get("form").trigger("submit");
    expect(wrapper.get(".test-players__add").attributes("disabled")).toBeDefined();
  }
  expect(request).not.toHaveBeenCalled();
  wrapper.unmount();
});

test("clears virtual players through the server and disables adds when all seats are taken", async () => {
  useGameStore().players = { bot: { userId: "bot", seat: 2, extras: { isTestPlayer: true, testPlayerName: "二号" } } } as never;
  usePlayersStore().players[1].id = "bot";
  usePlayersStore().players[2].id = "other";
  const request = vi.spyOn(useGameController(), "request").mockResolvedValue({ status: 200 });
  const wrapper = await open();
  expect(wrapper.text()).toContain("暂无空座位");
  expect(wrapper.get(".test-players__add").attributes("disabled")).toBeDefined();
  await wrapper.get(".test-players__clear").trigger("click");
  await flushPromises();
  expect(request).toHaveBeenCalledWith(SocketClientEvent.DMTestPlayers, { action: "clear" });
  wrapper.unmount();
});

function addActors() {
  useGameStore().players = Object.fromEntries([2, 3].map(seat => [`bot${seat}`, {
    userId: `bot${seat}`, seat, isAlive: true, voteChancesAfterDeath: 1,
    extras: { isTestPlayer: true, testPlayerName: `${seat}号` },
  }])) as never;
  for (const seat of [2, 3]) Object.assign(usePlayersStore().players[seat - 1], { id: `bot${seat}`, name: `${seat}号` });
}

test("sends as the selected virtual player and displays the recipient's conversation", async () => {
  addActors();
  const request = vi.spyOn(useGameController(), "request").mockImplementation(async (_event, payload: any) => ({
    status: 200,
    ...(payload.action === "inspect" ? { data: { messages: payload.userId === "bot3" ? [{
      messageId: "1", senderUserId: "bot2", content: [{ type: "text", text: "邻座你好" }], timestamp: 1,
    }] : [], election: null } } : {}),
  }) as never);
  const wrapper = await open();
  await flushPromises();
  await wrapper.get("#test-player-channel").setValue("whisper");
  await wrapper.get("#test-player-target").setValue("bot3");
  await wrapper.get("textarea").setValue("  邻座你好  ");
  await wrapper.get(".test-players__chat").trigger("submit");
  await flushPromises();
  expect(request).toHaveBeenCalledWith(SocketClientEvent.DMTestPlayers, {
    action: "message", userId: "bot2", channel: "whisper", toUserId: "bot3", text: "邻座你好",
  });
  expect(wrapper.get("textarea").element.value).toBe("");
  await wrapper.get("#test-player-actor").setValue("bot3");
  await flushPromises();
  expect(wrapper.get(".test-players__history").text()).toContain("邻座你好");
  expect(wrapper.get(".test-players__history small").text()).toBe("2号");
  wrapper.unmount();
});

test("controls hands and current-round ballots during gameplay and blocks other turns and pauses", async () => {
  addActors();
  useGameStore().level = "day";
  const request = vi.spyOn(useGameController(), "request").mockResolvedValue({ status: 200 });
  const wrapper = await open();
  const hand = wrapper.get('button[aria-pressed]');
  await hand.trigger("click");
  await flushPromises();
  expect(request).toHaveBeenCalledWith(SocketClientEvent.DMTestPlayers, { action: "hand", userId: "bot2", icon: "✋" });
  useGameStore().handSignals = { bot2: "✋" };
  await flushPromises();
  expect(hand.text()).toBe("放下手");
  await hand.trigger("click");
  await flushPromises();
  expect(request).toHaveBeenCalledWith(SocketClientEvent.DMTestPlayers, { action: "hand", userId: "bot2", icon: null });
  const vote = useRealtimeVoteStore();
  vote.$patch({ phase: "voting", nominationId: "round-1", currentVoterUserId: "bot3" });
  await flushPromises();
  expect(wrapper.get(".test-players__buttons button").attributes("disabled")).toBeDefined();
  vote.currentVoterUserId = "bot2";
  await flushPromises();
  await wrapper.get(".test-players__buttons button").trigger("click");
  await flushPromises();
  expect(request).toHaveBeenCalledWith(SocketClientEvent.DMTestPlayers, { action: "vote", userId: "bot2", vote: "yes", nominationId: "round-1" });
  vote.paused = true;
  await flushPromises();
  expect(wrapper.get(".test-players__buttons button").attributes("disabled")).toBeDefined();
  expect(wrapper.get(".test-players__add").attributes("disabled")).toBeDefined();
  wrapper.unmount();
});

test("submits the inspected storyteller candidate and prevents duplicate support", async () => {
  addActors();
  let voted = false;
  const request = vi.spyOn(useGameController(), "request").mockImplementation(async (_event, payload: any) => {
    if (payload.action === "election") voted = true;
    return { status: 200, data: { messages: [], election: { applicantUserId: "real", voteCount: voted ? 1 : 0, requiredVoteCount: 2, hasVoted: voted } } } as never;
  });
  const wrapper = await open();
  await flushPromises();
  const support = wrapper.findAll("button").find(button => button.text() === "支持该说书人")!;
  expect(support.attributes("disabled")).toBeUndefined();
  await support.trigger("click");
  await flushPromises();
  expect(request).toHaveBeenCalledWith(SocketClientEvent.DMTestPlayers, { action: "election", userId: "bot2", accept: true, applicantUserId: "real" });
  expect(support.attributes("disabled")).toBeDefined();
  expect(wrapper.text()).toContain("已支持");
  wrapper.unmount();
});

test("a legacy blocking room timer leaves virtual player ballots available", async () => {
  addActors();
  useGameStore().level = "day";
  useGameStore().roomTimer = {
    id: "legacy-timer", title: "讨论", status: "running", durationMs: 60000,
    remainingMs: 60000, endsAt: Date.now() + 60000, blockNominations: true,
  };
  useRealtimeVoteStore().$patch({ phase: "voting", nominationId: "round-1", currentVoterUserId: "bot2" });
  const request = vi.spyOn(useGameController(), "request").mockResolvedValue({ status: 200 });
  const wrapper = await open();
  try {
    expect(wrapper.get(".test-players__buttons button").attributes("disabled")).toBeUndefined();
    await wrapper.get(".test-players__buttons button").trigger("click");
    await flushPromises();
    expect(request).toHaveBeenCalledWith(SocketClientEvent.DMTestPlayers, { action: "vote", userId: "bot2", vote: "yes", nominationId: "round-1" });
  } finally { wrapper.unmount(); }
});

test("ignores stale inbox responses after switching actors and fetches the new inbox", async () => {
  addActors();
  let resolve!: (value: unknown) => void;
  vi.spyOn(useGameController(), "request")
    .mockImplementationOnce(() => new Promise(done => { resolve = done; }) as never)
    .mockResolvedValue({ status: 200, data: { messages: [{ messageId: "new", senderUserId: "bot3", content: [{ type: "text", text: "新玩家消息" }], timestamp: 1 }], election: null } } as never);
  const wrapper = await open();
  await wrapper.get("#test-player-actor").setValue("bot3");
  resolve({ status: 200, data: { messages: [{ messageId: "old", senderUserId: "bot2", content: [{ type: "text", text: "旧玩家消息" }] }], election: null } });
  await flushPromises();
  expect(wrapper.get(".test-players__history").text()).toContain("新玩家消息");
  expect(wrapper.get(".test-players__history").text()).not.toContain("旧玩家消息");
  wrapper.unmount();
});

test("whisper targets use adjacent seat numbers and do not jump over empty seats", async () => {
  addActors();
  usePlayersStore().players.splice(2, 0, { id: "", name: "" } as never);
  useGameStore().players.bot3.seat = 4;
  vi.spyOn(useGameController(), "request").mockResolvedValue({ status: 200 });
  const wrapper = await open();
  await wrapper.get("#test-player-channel").setValue("whisper");
  const targets = wrapper.findAll("#test-player-target option").map(option => option.attributes("value"));
  expect(targets).toEqual(["real"]);
  wrapper.unmount();
});

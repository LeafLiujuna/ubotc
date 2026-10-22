// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import TownSquare from "@/components/TownSquare.vue";
import { useAppStore } from "@/stores/app";
import { useSessionStore } from "@/stores/session";
import { usePlayersStore } from "@/stores/players";

const methods = TownSquare.methods;
const computed = TownSquare.computed;

function createContext(overrides = {}) {
  const gameController = {
    isConnected: true,
    startVote: vi.fn().mockResolvedValue({ status: 200 }),
  };
  const context = {
    players: [
      { id: "user-1", name: "鸦羽", isDead: false },
      { id: "user-2", name: "钟匠", isDead: false },
    ],
    grimoire: { voteDuration: 600 },
    canManageActionSeat: true,
    canManageSeatLife: true,
    canNominate: true,
    isApiRoom: true,
    nominationStage: "",
    nominationNomineeIndex: -1,
    nominationNominatorIndex: -1,
    get nominationDraftNominatorName() {
      return this.players[this.nominationNominatorIndex]?.name || "";
    },
    get nominationDraftNomineeName() {
      return this.players[this.nominationNomineeIndex]?.name || "";
    },
    realtimeVoteStore: {
      isActive: false,
      dayNominationState: null,
      hasDayLedger: false,
      show: vi.fn(),
      hide: vi.fn(() => true),
    },
    gameStore: { level: "day" },
    gameController,
    seatActionPending: "",
    seatActionStatus: "",
    closeSeatActions: vi.fn(),
    playerDisplayName: vi.fn((player) => player?.name || "未知玩家"),
    ...overrides,
  };
  context.runSeatAction = (...args) => methods.runSeatAction.call(context, ...args);
  return context;
}

beforeEach(() => {
  setActivePinia(createPinia());
  window.$toast = {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  };
});

describe("TownSquare death marking", () => {
  test('local seats cycle through death, a spent ghost vote and revival, including unclaimed seats', async () => {
    const player = { id: '', isDead: false, isVoteless: false, votes: 1 };
    const context = createContext({ isApiRoom: false, players: [player],
      updatePlayerSeat: (target, patch) => Object.assign(target, patch) });
    await methods.cycleSeatLifeState.call(context, 0);
    expect(player).toMatchObject({ isDead: true, isVoteless: false, votes: 1 });
    await methods.cycleSeatLifeState.call(context, 0);
    expect(player).toMatchObject({ isDead: true, isVoteless: true, votes: 0 });
    await methods.cycleSeatLifeState.call(context, 0);
    expect(player).toMatchObject({ isDead: false, isVoteless: false, votes: 1 });
    await methods.cycleSeatLifeState.call(context, 0);
    await methods.cycleSeatLifeState.call(context, 0, true);
    expect(player).toMatchObject({ isDead: false, isVoteless: false, votes: 1 });
  });

  test('online death changes wait for the server, refresh all state and block duplicate clicks', async () => {
    let accept;
    const context = createContext();
    context.gameController.updatePlayer = vi.fn(() => new Promise(resolve => { accept = resolve; }));
    context.gameController.refreshGameState = vi.fn().mockResolvedValue({ status: 200 });
    const request = methods.cycleSeatLifeState.call(context, 0);
    expect(context.seatActionPending).toBe('life');
    expect(context.players[0].isDead).toBe(false);
    await methods.cycleSeatLifeState.call(context, 0);
    expect(context.gameController.updatePlayer).toHaveBeenCalledOnce();
    expect(context.gameController.updatePlayer).toHaveBeenCalledWith({
      userId: 'user-1', isAlive: false, voteChancesAfterDeath: 1,
    });
    accept({ status: 200 });
    expect(await request).toBe(true);
    expect(context.gameController.refreshGameState).toHaveBeenCalledOnce();
    expect(context.seatActionPending).toBe('');
  });

  test('online shroud consumption and explicit revival send different authoritative updates', async () => {
    const context = createContext({ players: [{ id: 'user-1', isDead: true, isVoteless: false }] });
    context.gameController.updatePlayer = vi.fn().mockResolvedValue({ status: 200 });
    context.gameController.refreshGameState = vi.fn().mockResolvedValue({ status: 200 });
    await methods.cycleSeatLifeState.call(context, 0);
    expect(context.gameController.updatePlayer).toHaveBeenLastCalledWith({ userId: 'user-1', voteChancesAfterDeath: 0 });
    await methods.cycleSeatLifeState.call(context, 0, true);
    expect(context.gameController.updatePlayer).toHaveBeenLastCalledWith({ userId: 'user-1', isAlive: true, voteChancesAfterDeath: 1 });
    context.canManageSeatLife = false;
    context.gameController.updatePlayer.mockClear();
    await methods.cycleSeatLifeState.call(context, 0);
    expect(context.gameController.updatePlayer).not.toHaveBeenCalled();
  });

  test('own life status distinguishes an unused and a spent ghost vote', () => {
    const currentPlayer = { isDead: true, isVoteless: false };
    expect(computed.profileLifeState.call({ currentPlayer })).toContain('保留一张鬼票');
    currentPlayer.isVoteless = true;
    expect(computed.profileLifeState.call({ currentPlayer })).toContain('鬼票已用');
  });
});

describe("TownSquare realtime vote entry", () => {
  test("night reference selection intercepts table clicks before seat and role actions", async () => {
    const choose = vi.fn();
    const context = createContext({ nightPlayerSelection: { active: true, choose } });
    await methods.handleTableSeatClick.call(context, 0, {});
    await methods.handleTableTokenClick.call(context, 1, {});
    expect(choose.mock.calls).toEqual([[0], [1]]);
    expect(context.closeSeatActions).not.toHaveBeenCalled();
    expect(context.gameController.startVote).not.toHaveBeenCalled();
  });
  test("routes modal and room-menu controls directly through the app store", () => {
    const appStore = useAppStore();
    const toggleModal = vi.spyOn(appStore, "toggleModal");
    const toggleMenu = vi.spyOn(appStore, "toggleMenu");

    methods.openModal("settings");
    methods.toggleRoomMenu(true);

    expect(toggleModal).toHaveBeenCalledWith("settings");
    expect(toggleMenu).toHaveBeenCalledWith(true);
  });

  test("routes chat UI state directly through the session store", () => {
    const sessionStore = useSessionStore();
    const setChatOpen = vi.spyOn(sessionStore, "setChatOpen");
    const updateChatSent = vi.spyOn(sessionStore, "updateChatSent");
    const setTyping = vi.spyOn(sessionStore, "setTyping");
    const chatPayload = {
      message: "hello",
      sendingPlayerId: "user-1",
      receivingPlayerId: "user-2",
    };

    methods.setChatOpen(true);
    methods.recordSentChat(chatPayload);
    methods.setTyping(true);

    expect(setChatOpen).toHaveBeenCalledWith(true);
    expect(updateChatSent).toHaveBeenCalledWith(chatPayload);
    expect(setTyping).toHaveBeenCalledWith(true);
  });

  test("routes local role state directly through the session store", () => {
    const sessionStore = useSessionStore();
    const setIsRole = vi.spyOn(sessionStore, "setIsRole");
    const rolePayload = {
      role: "wraith",
      property: "using",
      value: true,
    };

    methods.setUsingWraith.call({
      session: { isRole: { wraith: { using: false } } },
      setRoleState: methods.setRoleState,
    });

    expect(setIsRole).toHaveBeenCalledWith(rolePayload);
  });

  test("routes chat unread counts directly through their Pinia stores", () => {
    const sessionStore = useSessionStore();
    const playersStore = usePlayersStore();
    const setStMessage = vi.spyOn(sessionStore, "setStMessage");
    const setPlayerMessage = vi.spyOn(playersStore, "setPlayerMessage");
    const playerMessagePayload = { playerId: "user-2", num: 0 };

    methods.setStorytellerMessageCount(0);
    methods.setPlayerMessageCount(playerMessagePayload);

    expect(setStMessage).toHaveBeenCalledWith(0);
    expect(setPlayerMessage).toHaveBeenCalledWith(playerMessagePayload);
  });

  test("routes local player identity and seat state directly through the session store", () => {
    const sessionStore = useSessionStore();
    const setPlayerId = vi.spyOn(sessionStore, "setPlayerId");
    const setPlayerName = vi.spyOn(sessionStore, "setPlayerName");
    const claimSeat = vi.spyOn(sessionStore, "claimSeat");
    const createChatHistory = vi.spyOn(sessionStore, "createChatHistory");

    methods.setLocalPlayerId("user-1");
    methods.setLocalPlayerName("钟匠");
    methods.setClaimedSeat(2);
    methods.createLocalChatHistory("storyteller-1");

    expect(setPlayerId).toHaveBeenCalledWith("user-1");
    expect(setPlayerName).toHaveBeenCalledWith("钟匠");
    expect(claimSeat).toHaveBeenCalledWith(2);
    expect(createChatHistory).toHaveBeenCalledWith("storyteller-1");
  });

  test("routes local nomination state directly through the session store", () => {
    const sessionStore = useSessionStore();
    const nominationUpdate = vi.spyOn(sessionStore, "nominationUpdate");
    const setNomination = vi.spyOn(sessionStore, "setNomination");
    const nomination = [1, 3];

    methods.updateLocalNomination({ nomination });
    methods.setLocalNomination(nomination);

    expect(nominationUpdate).toHaveBeenCalledWith({ nomination });
    expect(setNomination).toHaveBeenCalledWith(nomination);
  });

  test("routes local player mutations directly through the players store", () => {
    const playersStore = usePlayersStore();
    const update = vi.spyOn(playersStore, "update");
    const empty = vi.spyOn(playersStore, "empty");
    const setFabled = vi.spyOn(playersStore, "setFabled");
    const remove = vi.spyOn(playersStore, "remove");
    const swap = vi.spyOn(playersStore, "swap");
    const move = vi.spyOn(playersStore, "move");
    const player = { id: "user-2", name: "钟匠" };
    const updatePayload = { player, property: "votes", value: 2 };
    const emptyPayload = { player };
    const fabledPayload = { index: 1 };
    const playerIndexes = [0, 1];

    methods.updatePlayerState(updatePayload);
    methods.emptyPlayerState(emptyPayload);
    methods.setFabledState(fabledPayload);
    methods.removePlayerState(1);
    methods.swapPlayerState(playerIndexes);
    methods.movePlayerState(playerIndexes);

    expect(update).toHaveBeenCalledWith(updatePayload);
    expect(empty).toHaveBeenCalledWith(emptyPayload);
    expect(setFabled).toHaveBeenCalledWith(fabledPayload);
    expect(remove).toHaveBeenCalledWith(1);
    expect(swap).toHaveBeenCalledWith(playerIndexes);
    expect(move).toHaveBeenCalledWith(playerIndexes);
  });

  test("shows the authoritative end phase ahead of a completed vote", () => {
    const phaseLabel = computed.phaseLabel.call({
      isApiRoom: true,
      gameStore: { level: "end" },
      grimoire: { isNight: false },
      nominationStage: "",
      realtimeVoteStore: { isActive: false, isComplete: true },
      session: { nomination: false },
    });

    expect(phaseLabel).toBe("终局盘点");
  });

  test("shows the authoritative numbered day and night phases", () => {
    const common = {
      isApiRoom: true,
      grimoire: { isNight: false },
      nominationStage: "",
      realtimeVoteStore: { isActive: false, isComplete: false },
      session: { nomination: false },
    };

    expect(computed.phaseLabel.call({
      ...common,
      gameStore: { level: "night", levelDays: 2 },
    })).toBe("第 2 夜");
    expect(computed.phaseLabel.call({
      ...common,
      gameStore: { level: "day", levelDays: 3 },
    })).toBe("第 3 天");
    expect(computed.phaseLabel.call({
      ...common,
      gameStore: { level: "prepare", levelDays: 0 },
    })).toBe("等待开局");
  });

  test("keeps occupied nicknames while removing placeholder labels from empty seats", () => {
    const players = [
      { id: "user-1", name: "本地玩家 A5CA", pronouns: "" },
      { id: "", name: "", pronouns: "" },
    ];
    const tableSeats = computed.tableSeats.call({
      players,
      playerAvatarUrl: vi.fn(() => ""),
      getChairForAngle: vi.fn(() => ({ img: "chair.png", flip: false })),
      playerDisplayName: methods.playerDisplayName,
      displayRoleForPlayer: vi.fn(() => ({})),
      tablePositionStyle: vi.fn(() => ({})),
      isApiRoom: false,
      canManageActionSeat: false,
      gameStore: { level: "prepare" },
    });

    expect(tableSeats[0]).toMatchObject({
      nameLine: "本地玩家 A5CA",
      nameAnchor: "name-outside-north",
      actionLabel: "",
      hasPlayer: true,
    });
    expect(tableSeats[1]).toMatchObject({
      nameLine: "",
      nameAnchor: "name-outside-south",
      actionLabel: "点击坐下",
      hasPlayer: false,
    });
  });

  test("keeps empty seats available after an authoritative game has started", async () => {
    const players = [{ id: "", name: "", pronouns: "" }];
    const context = {
      players,
      isApiRoom: true,
      canManageActionSeat: false,
      gameStore: { level: "night" },
      realtimeVoteStore: { isActive: false },
      playerAvatarUrl: vi.fn(() => ""),
      getChairForAngle: vi.fn(() => ({ img: "chair.png", flip: false })),
      playerDisplayName: methods.playerDisplayName,
      displayRoleForPlayer: vi.fn(() => ({})),
      tablePositionStyle: vi.fn(() => ({})),
      apiNominationTargeting: false,
      swap: -1,
      gameController: { enterSeat: vi.fn(), refreshGameState: vi.fn() },
      isApiRoomConnected: vi.fn(() => true),
      openSeatActions: vi.fn(),
    };
    const seats = computed.tableSeats.call(context);

    expect(seats[0]).toMatchObject({
      emptySeatLocked: false,
      actionLabel: "点击坐下",
    });
    expect(methods.seatButtonLabel.call(context, seats[0]))
      .toBe("第 1 席为空，点击坐下");

    await methods.handleTableSeatClick.call(context, 0, {});
    expect(context.gameController.enterSeat).toHaveBeenCalledWith(1);
  });

  test("uses authoritative script metadata in API rooms", () => {
    expect(computed.scriptName.call({
      isApiRoom: true,
      gameScriptStore: { title: null },
      edition: { name: "暗流涌动" },
    })).toBe("尚未选择剧本");
    expect(computed.scriptReferenceTitle.call({
      isApiRoom: true,
      scriptName: "尚未选择剧本",
      gameScriptStore: { currentGameScriptId: null, author: null },
      edition: { author: "The Pandemonium Institute" },
    })).toBe("尚未选择剧本");
    expect(computed.scriptName.call({
      isApiRoom: true,
      gameScriptStore: { title: "权威剧本" },
      edition: { name: "暗流涌动" },
    })).toBe("权威剧本");
  });

  test("starts a nominee-first targeting draft from the ruling tool", () => {
    const context = createContext();

    methods.startNominationFromSelf.call(context);
    expect(context.closeSeatActions).toHaveBeenCalledOnce();
    expect(context.nominationStage).toBe("nominee");
    expect(context.nominationNomineeIndex).toBe(-1);
    expect(context.nominationNominatorIndex).toBe(-1);
  });

  test("routes both selected players through the authoritative startVote request", async () => {
    const context = createContext();

    // The seat panel pre-fills the clicked player as nominee…
    await methods.startRealtimeVote.call(context, 1);
    expect(context.nominationStage).toBe("nominator");
    expect(context.nominationNomineeIndex).toBe(1);

    // …the storyteller then clicks the nominator's seat…
    methods.handleNominationSeatClick.call(context, 0);
    expect(context.nominationStage).toBe("confirm");
    expect(context.nominationNominatorIndex).toBe(0);

    // …and nothing is sent until the confirmation card is confirmed.
    expect(context.gameController.startVote).not.toHaveBeenCalled();
    await methods.confirmNominationDraft.call(context);

    expect(context.gameController.startVote).toHaveBeenCalledOnce();
    expect(context.gameController.startVote).toHaveBeenCalledWith({
      sweepVote: true,
      nominatorUserId: "user-1",
      nomineeUserId: "user-2",
      turnDurationMs: 600,
    });
    expect(context.nominationStage).toBe("");
    expect(context.realtimeVoteStore.show).toHaveBeenCalledOnce();
  });

  test("allows dead nominees and nominators in the targeting draft", () => {
    const context = createContext({
      players: [
        { id: "user-1", name: "鸦羽", isDead: true },
        { id: "user-2", name: "钟匠", isDead: false },
      ],
      nominationStage: "nominee",
    });
    context.realtimeVoteStore.dayNominationState = {
      finalized: false,
      nominations: [{ nominatorUserId: "user-2", nomineeUserId: "user-2" }],
    };

    methods.handleNominationSeatClick.call(context, 0);
    expect(context.nominationStage).toBe("nominator");
    expect(context.nominationNomineeIndex).toBe(0);
    methods.handleNominationSeatClick.call(context, 0);
    expect(context.nominationStage).toBe("confirm");
    expect(context.nominationNominatorIndex).toBe(0);
    expect(window.$toast.warning).not.toHaveBeenCalled();
    methods.handleNominationSeatClick.call(context, 1);
    expect(context.nominationStage).toBe("confirm");
    expect(context.nominationNominatorIndex).toBe(1);
    expect(window.$toast.warning).not.toHaveBeenCalled();
  });

  test("keeps nomination entry points available when every seat has nominated and been nominated", async () => {
    const context = createContext({
      actionSeatIndex: 1,
      gameStore: { currentIsDm: true, level: "day" },
    });
    context.realtimeVoteStore.dayNominationState = {
      finalized: false,
      nominations: [
        { nominatorUserId: "user-1", nomineeUserId: "user-2" },
        { nominatorUserId: "user-2", nomineeUserId: "user-1" },
      ],
    };
    context.actionPlayer = context.players[1];
    context.hasEligibleNominator = computed.hasEligibleNominator.call(context);
    context.hasEligibleNominee = computed.hasEligibleNominee.call(context);
    expect(context.hasEligibleNominator).toBe(true);
    expect(context.hasEligibleNominee).toBe(true);
    expect(computed.canNominate.call(context)).toBe(true);
    context.canStartVoteForActionSeat = computed.canStartVoteForActionSeat.call(context);
    expect(context.canStartVoteForActionSeat).toBe(true);
    expect(computed.canSelfNominateActionSeat.call(context)).toBe(true);
    await methods.startRealtimeVote.call(context, 1);
    expect(context.nominationStage).toBe("nominator");
    expect(context.nominationNomineeIndex).toBe(1);
    expect(window.$toast.warning).not.toHaveBeenCalled();
  });

  test("keeps entries available when all players are dead but still requires an unfinished day", () => {
    const context = createContext({
      actionPlayer: { id: "user-1", isDead: true },
      hasEligibleNominator: true,
      hasEligibleNominee: true,
      gameStore: { currentIsDm: true, level: "day" },
      players: [{ id: "user-1", isDead: true }],
    });
    expect(computed.hasEligibleNominator.call(context)).toBe(true);
    expect(computed.hasEligibleNominee.call(context)).toBe(true);
    expect(computed.hasEligibleNominator.call({ players: [] })).toBe(false);
    expect(computed.hasEligibleNominee.call({ players: [] })).toBe(false);
    expect(computed.canNominate.call(context)).toBe(true);
    expect(computed.canStartVoteForActionSeat.call(context)).toBe(true);
    context.realtimeVoteStore.dayNominationState = { finalized: true, nominations: [] };
    expect(computed.canNominate.call(context)).toBe(false);
    expect(computed.canStartVoteForActionSeat.call(context)).toBe(false);
  });

  test("a running legacy blocking timer does not disable online nomination entries", () => {
    const context = createContext({
      actionPlayer: { id: "user-2", isDead: false },
      hasEligibleNominator: true,
      hasEligibleNominee: true,
      gameStore: { currentIsDm: true, level: "day", roomTimer: {
        status: "running", blockNominations: true, endsAt: Date.now() + 60000,
      } },
    });
    expect(computed.canNominate.call(context)).toBe(true);
    expect(computed.canStartVoteForActionSeat.call(context)).toBe(true);
    context.actionPlayer.isDead = true;
    expect(computed.canStartVoteForActionSeat.call(context)).toBe(true);
  });

  test("opens a dead player's self-nomination and sends it for confirmation", async () => {
    const context = createContext({
      players: [{ id: "user-1", name: "鸦羽", isDead: true, isVoteless: true }],
    });
    await methods.startRealtimeVote.call(context, 0);
    expect(context.nominationStage).toBe("nominator");
    expect(context.nominationNomineeIndex).toBe(0);
    methods.handleNominationSeatClick.call(context, 0);
    expect(context.nominationStage).toBe("confirm");
    await methods.confirmNominationDraft.call(context);
    expect(context.gameController.startVote).toHaveBeenCalledWith({
      sweepVote: true, nominatorUserId: "user-1", nomineeUserId: "user-1", turnDurationMs: 600,
    });
    expect(context.players[0].isVoteless).toBe(true);
    expect(window.$toast.warning).not.toHaveBeenCalled();
  });

  test("does not send for a non-storyteller, an active vote, or a disconnected room", async () => {
    const nonStoryteller = createContext({ canManageActionSeat: false, canNominate: false });
    methods.startNominationFromSelf.call(nonStoryteller);
    await methods.startRealtimeVote.call(nonStoryteller, 0);
    expect(nonStoryteller.nominationStage).toBe("");
    expect(nonStoryteller.gameController.startVote).not.toHaveBeenCalled();

    const activeVote = createContext({ realtimeVoteStore: { isActive: true } });
    await methods.startRealtimeVote.call(activeVote, 0);
    expect(activeVote.gameController.startVote).not.toHaveBeenCalled();
    expect(window.$toast.warning).toHaveBeenCalled();

    const disconnected = createContext();
    disconnected.gameController.isConnected = false;
    await methods.startRealtimeVote.call(disconnected, 0);
    expect(disconnected.gameController.startVote).not.toHaveBeenCalled();
    expect(disconnected.seatActionStatus).toContain("重连");

    const night = createContext({ gameStore: { level: "night" } });
    await methods.startRealtimeVote.call(night, 0);
    expect(night.gameController.startVote).not.toHaveBeenCalled();
    expect(window.$toast.warning).toHaveBeenCalledWith(
      "请在准备或白天阶段发起提名。",
    );
  });
});

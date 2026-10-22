import { describe, expect, test, vi } from "vitest";
import {
  cheatSheetEntries,
  dispatchGameHotkey,
  type HotkeyActions,
  type HotkeyContext,
  type HotkeyKeystroke,
} from "../../src/composables/useGameHotkeys";

function mockActions(): HotkeyActions {
  return {
    storytellerAction: vi.fn(),
    playerAction: vi.fn(),
    leaveGame: vi.fn(),
    toggleMenu: vi.fn(),
    toggleGrimoire: vi.fn(),
    hostSession: vi.fn(),
    joinSession: vi.fn(),
    returnEveryoneToTown: vi.fn(),
    goNightLegacy: vi.fn(),
    goNightApi: vi.fn(),
    openModal: vi.fn(),
    openRealtimeVote: vi.fn(),
    openDayNomination: vi.fn(),
    showTownSquare: vi.fn(),
    setTimer: vi.fn(),
    skipVoter: vi.fn(),
    pauseVote: vi.fn(),
    resumeVote: vi.fn(),
    closeActiveSurface: vi.fn(),
    rejectInputDialog: vi.fn(),
    toggleCheatSheet: vi.fn(),
    closeCheatSheet: vi.fn(),
  };
}

function makeContext(overrides: Partial<HotkeyContext> = {}): HotkeyContext {
  return {
    isApiRoom: true,
    isSpectator: false,
    isDm: true,
    voteActive: false,
    votePaused: false,
    hasVoteHistory: false,
    inputDialogVisible: false,
    cheatSheetOpen: false,
    actions: mockActions(),
    ...overrides,
  };
}

function press(key: string, extras: Partial<HotkeyKeystroke> = {}): HotkeyKeystroke {
  return { key, ctrlKey: false, metaKey: false, typingGuard: false, ...extras };
}

describe("global guards", () => {
  test("ignores chords with ctrl or meta", () => {
    const ctx = makeContext();
    expect(dispatchGameHotkey(press("m", { ctrlKey: true }), ctx)).toBe(false);
    expect(dispatchGameHotkey(press("m", { metaKey: true }), ctx)).toBe(false);
    expect(ctx.actions.toggleMenu).not.toHaveBeenCalled();
  });

  test("while typing, every key is inert except Escape", () => {
    const ctx = makeContext();
    expect(dispatchGameHotkey(press("m", { typingGuard: true }), ctx)).toBe(false);
    expect(dispatchGameHotkey(press("Escape", { typingGuard: true }), ctx)).toBe(true);
    expect(ctx.actions.toggleMenu).not.toHaveBeenCalled();
    expect(ctx.actions.closeActiveSurface).toHaveBeenCalledOnce();
  });

  test("an unbound key reports unhandled so the event keeps its default", () => {
    expect(dispatchGameHotkey(press("x"), makeContext())).toBe(false);
  });
});

describe("bindings preserved from the original switch", () => {
  test.each([
    ["m", "toggleMenu"],
    ["t", "showTownSquare"],
    ["r", "returnEveryoneToTown"],
    ["z", "setTimer"],
  ] as const)("%s → %s", (key, action) => {
    const ctx = makeContext();
    expect(dispatchGameHotkey(press(key), ctx)).toBe(true);
    expect(ctx.actions[action]).toHaveBeenCalledOnce();
  });

  test("H/J host or join a local session, and stay dead in API rooms", () => {
    const legacy = makeContext({ isApiRoom: false });
    dispatchGameHotkey(press("h"), legacy);
    dispatchGameHotkey(press("j"), legacy);
    expect(legacy.actions.hostSession).toHaveBeenCalledOnce();
    expect(legacy.actions.joinSession).toHaveBeenCalledOnce();

    // In an API room, joinSession() falls through to leaveSession() — a key
    // absent from the cheat sheet must never pop a "解散" confirm at a player.
    const api = makeContext();
    expect(dispatchGameHotkey(press("h"), api)).toBe(false);
    expect(dispatchGameHotkey(press("j"), api)).toBe(false);
    expect(api.actions.joinSession).not.toHaveBeenCalled();
  });

  test("N advances the API phase; O opens night order; N still flips night locally", () => {
    const api = makeContext();
    dispatchGameHotkey(press("n"), api);
    expect(api.actions.goNightApi).toHaveBeenCalledOnce();
    dispatchGameHotkey(press("o"), api);
    expect(api.actions.openModal).toHaveBeenCalledWith("nightOrder");

    const legacy = makeContext({ isApiRoom: false });
    dispatchGameHotkey(press("n"), legacy);
    expect(legacy.actions.goNightLegacy).toHaveBeenCalledOnce();
  });

  test("V opens the live vote surface or the legacy history", () => {
    const api = makeContext();
    dispatchGameHotkey(press("v"), api);
    expect(api.actions.openRealtimeVote).toHaveBeenCalledOnce();

    // A legacy spectator with no recorded votes has nothing to open.
    const emptySpectator = makeContext({
      isApiRoom: false,
      isSpectator: true,
      hasVoteHistory: false,
    });
    expect(dispatchGameHotkey(press("v"), emptySpectator)).toBe(false);

    const withHistory = makeContext({
      isApiRoom: false,
      isSpectator: true,
      hasVoteHistory: true,
    });
    dispatchGameHotkey(press("v"), withHistory);
    expect(withHistory.actions.openModal).toHaveBeenCalledWith("voteHistory");
  });

  test("spectators cannot trigger storyteller keys", () => {
    const ctx = makeContext({ isSpectator: true, isDm: false });
    for (const key of ["r", "n", "o", "z", "a"]) {
      expect(dispatchGameHotkey(press(key), ctx)).toBe(false);
    }
  });

  test("storyteller menu shortcuts share player surfaces and guard typing", () => {
    const ctx = makeContext();
    for (const [key, action] of [["c", "roles"], ["f", "fullscreen"], ["enter", "chat"], ["u", "users"], ["q", "settings"], [" ", "hand"]]) {
      dispatchGameHotkey(press(key), ctx);
      expect(ctx.actions.playerAction).toHaveBeenLastCalledWith(action);
      expect(dispatchGameHotkey(press(key, { typingGuard: true }), ctx)).toBe(false);
    }
    for (const [key, action] of [["1", "seats"], ["2", "script"], ["3", "rules"], ["4", "npc"], ["5", "roles"], ["g", "reveal"]]) {
      dispatchGameHotkey(press(key), ctx);
      expect(ctx.actions.storytellerAction).toHaveBeenLastCalledWith(action);
      expect(dispatchGameHotkey(press(key, { typingGuard: true }), ctx)).toBe(false);
      if (key !== "g") expect(dispatchGameHotkey(press(key), makeContext({ isDm: false, isSpectator: true }))).toBe(false);
    }
    expect(ctx.actions.openModal).not.toHaveBeenCalled();
  });
});

describe("new storyteller bindings", () => {
  test("D advances the phase for the storyteller in an API room", () => {
    const ctx = makeContext({ isDm: true });
    dispatchGameHotkey(press("d"), ctx);
    expect(ctx.actions.goNightApi).toHaveBeenCalledOnce();
  });

  test("D stays inert for API-room players and keeps group chat locally", () => {
    const player = makeContext({ isDm: false });
    expect(dispatchGameHotkey(press("d"), player)).toBe(false);

    const legacy = makeContext({ isApiRoom: false });
    dispatchGameHotkey(press("d"), legacy);
    expect(legacy.actions.openModal).toHaveBeenCalledWith("groupChat");
  });

  test("A starts a nomination in API rooms only", () => {
    const ctx = makeContext();
    dispatchGameHotkey(press("a"), ctx);
    expect(ctx.actions.openDayNomination).toHaveBeenCalledOnce();
    expect(dispatchGameHotkey(press("a"), makeContext({ isApiRoom: false }))).toBe(false);
  });

  test("S skips the current voter mid-vote, night order otherwise", () => {
    const midVote = makeContext({ isDm: true, voteActive: true });
    dispatchGameHotkey(press("s"), midVote);
    expect(midVote.actions.skipVoter).toHaveBeenCalledOnce();

    const noVote = makeContext({ isDm: true, voteActive: false });
    dispatchGameHotkey(press("s"), noVote);
    expect(noVote.actions.openModal).toHaveBeenCalledWith("nightOrder");
  });

  test("P toggles the vote countdown by its paused state", () => {
    const running = makeContext({ isDm: true, voteActive: true, votePaused: false });
    dispatchGameHotkey(press("p"), running);
    expect(running.actions.pauseVote).toHaveBeenCalledOnce();

    const paused = makeContext({ isDm: true, voteActive: true, votePaused: true });
    dispatchGameHotkey(press("p"), paused);
    expect(paused.actions.resumeVote).toHaveBeenCalledOnce();
  });

  test("vote controls never fire for players, even mid-vote", () => {
    const ctx = makeContext({ isDm: false, voteActive: true });
    expect(dispatchGameHotkey(press("p"), ctx)).toBe(false);
    dispatchGameHotkey(press("s"), ctx);
    expect(ctx.actions.skipVoter).not.toHaveBeenCalled();
  });
});

describe("cheat sheet", () => {
  test("? toggles and Escape prefers closing the sheet over other surfaces", () => {
    const ctx = makeContext({ cheatSheetOpen: true, inputDialogVisible: true });
    dispatchGameHotkey(press("?"), ctx);
    expect(ctx.actions.toggleCheatSheet).toHaveBeenCalledOnce();

    dispatchGameHotkey(press("Escape"), ctx);
    expect(ctx.actions.closeCheatSheet).toHaveBeenCalledOnce();
    expect(ctx.actions.rejectInputDialog).not.toHaveBeenCalled();
  });

  test("Escape falls through to the input dialog, then other surfaces", () => {
    const dialog = makeContext({ inputDialogVisible: true });
    dispatchGameHotkey(press("Escape"), dialog);
    expect(dialog.actions.rejectInputDialog).toHaveBeenCalledOnce();

    const plain = makeContext();
    dispatchGameHotkey(press("Escape"), plain);
    expect(plain.actions.closeActiveSurface).toHaveBeenCalledOnce();
  });

  test("lists one entry per key and it is the entry dispatch would run", () => {
    const ctx = makeContext({ isDm: true, voteActive: true });
    const entries = cheatSheetEntries(ctx);
    const keys = entries.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(entries.find((entry) => entry.key === "S")?.label).toBe("跳过当前投票席");
  });

  test("hides API-room noise from local-room listings and vice versa", () => {
    const api = cheatSheetEntries(makeContext({ isDm: true }));
    expect(api.some((entry) => entry.group === "本地房间")).toBe(false);

    const legacy = cheatSheetEntries(makeContext({ isApiRoom: false }));
    expect(legacy.some((entry) => entry.label === "以说书人身份开局")).toBe(true);
  });
});


describe("ordinary player shortcuts", () => {
  test("dispatches the same player actions as the menu", () => {
    const ctx = makeContext({ isDm: false, isSpectator: true });
    for (const [key, action] of [["enter", "chat"], [" ", "hand"], ["t", "town"], ["c", "roles"], ["u", "users"], ["q", "settings"], ["f", "fullscreen"]]) {
      expect(dispatchGameHotkey(press(key), ctx)).toBe(true);
      expect(ctx.actions.playerAction).toHaveBeenLastCalledWith(action);
      expect(dispatchGameHotkey(press(key, { typingGuard: true }), ctx)).toBe(false);
      expect(dispatchGameHotkey(press(key, { altKey: true }), ctx)).toBe(false);
    }
    dispatchGameHotkey(press("l"), ctx);
    expect(ctx.actions.leaveGame).toHaveBeenCalledOnce();
    expect(cheatSheetEntries(ctx).find(entry => entry.key === "Space")?.label).toContain("举手");
  });
});

// @vitest-environment jsdom

import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import StorytellerControls from "@/components/StorytellerControls.vue";
import { useGameController } from "@/controllers/GameController";
import { useGameScriptStore } from "@/stores/gameScript";
import { useGameStore } from "@/stores/game";
import { resolveTeamPlayerCount } from "@/utils/teamPlayerCount";

describe("resolveTeamPlayerCount", () => {
  test("fills the standard percentage team after fixed team counts", () => {
    expect(resolveTeamPlayerCount({
      townsfolk: "100%",
      outsider: [0, 0, 0, 0, 0, 0, 0],
      minion: [0, 0, 1, 1, 1, 1, 1],
      demon: [0, 0, 1, 1, 1, 1, 1],
    }, 7)).toEqual({
      townsfolk: 5,
      outsider: 0,
      minion: 1,
      demon: 1,
    });
  });

  test("never assigns more roles than seated players", () => {
    expect(resolveTeamPlayerCount({
      townsfolk: "100%",
      minion: [4, 4, 4],
      demon: [2, 2, 2],
    }, 3)).toEqual({ townsfolk: 0, minion: 3, demon: 0 });
  });
});

describe("StorytellerControls", () => {
  let wrapper;

  beforeEach(() => {
    setActivePinia(createPinia());
    window.$toast = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    };
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
    document.body.style.overflow = "";
    delete document.body.dataset.tsModalLockCount;
  });

  test("confirms random assignment through the canonical controller", async () => {
    const gameStore = useGameStore();
    const scriptStore = useGameScriptStore();
    const controller = useGameController();
    gameStore.level = "prepare";
    gameStore.players = Object.fromEntries(
      Array.from({ length: 7 }, (_, index) => [`user-${index}`, {
        userId: `user-${index}`,
        isDM: false,
        seat: index + 1,
      }]),
    );
    scriptStore.teamPlayerNumTable = {
      townsfolk: "100%",
      outsider: [0, 0, 0, 0, 0, 0, 0],
      minion: [0, 0, 1, 1, 1, 1, 1],
      demon: [0, 0, 1, 1, 1, 1, 1],
    };

    const assign = vi.spyOn(controller, "assignRandomCharacters")
      .mockResolvedValue({ status: 200 });
    const refresh = vi.spyOn(controller, "refreshGameState")
      .mockResolvedValue({ status: 200 });

    wrapper = mount(StorytellerControls, {
      attachTo: document.body,
      global: { stubs: { "font-awesome-icon": true } },
    });

    await wrapper.findAll("button")[0].trigger("click");
    await flushPromises();
    expect(document.body.querySelector("[role='dialog']")).not.toBeNull();

    document.body.querySelector(".storyteller-dialog")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(assign).toHaveBeenCalledWith({
      teamPlayerCount: { townsfolk: 5, outsider: 0, minion: 1, demon: 1 },
      setupCharacterIds: [],
    });
    expect(refresh).toHaveBeenCalledOnce();
    expect(window.$toast.success).toHaveBeenCalledWith(
      expect.stringContaining("随机角色分配成功"),
    );
  });

  test("only counts non-storyteller players with a real seat", async () => {
    const gameStore = useGameStore();
    const scriptStore = useGameScriptStore();
    const controller = useGameController();
    gameStore.level = "prepare";
    gameStore.players = {
      "dm-1": { userId: "dm-1", isDM: true, seat: 0 },
      observer: { userId: "observer", isDM: false, seat: 0 },
      "player-1": { userId: "player-1", isDM: false, seat: 3 },
    };
    scriptStore.teamPlayerNumTable = { townsfolk: "100%" };
    const assign = vi.spyOn(controller, "assignRandomCharacters")
      .mockResolvedValue({ status: 200 });
    vi.spyOn(controller, "refreshGameState").mockResolvedValue({ status: 200 });

    wrapper = mount(StorytellerControls, {
      attachTo: document.body,
      global: { stubs: { "font-awesome-icon": true } },
    });
    await wrapper.findAll("button")[0].trigger("click");
    await flushPromises();

    expect(document.body.textContent).toContain("当前 1 名玩家已入座");
    document.body.querySelector(".storyteller-dialog")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(assign).toHaveBeenCalledWith({
      teamPlayerCount: { townsfolk: 1 },
      setupCharacterIds: [],
    });
  });

  test("previews and submits supported Baron and Drunk setup rules", async () => {
    const gameStore = useGameStore();
    const scriptStore = useGameScriptStore();
    const controller = useGameController();
    gameStore.level = "prepare";
    gameStore.players = Object.fromEntries(
      Array.from({ length: 7 }, (_, index) => [`user-${index}`, {
        userId: `user-${index}`,
        isDM: false,
        seat: index + 1,
      }]),
    );
    scriptStore.teamPlayerNumTable = {
      townsfolk: "100%",
      outsider: [0, 0, 0, 0, 0, 0, 0],
      minion: [0, 0, 1, 1, 1, 1, 1],
      demon: [0, 0, 1, 1, 1, 1, 1],
    };
    scriptStore.characters = [
      { id: "baron", name: "男爵", team: "minion", ability: "", setup: true },
      { id: "drunk", name: "酒鬼", team: "outsider", ability: "", setup: true },
      { id: "lunatic", name: "疯子", team: "outsider", ability: "", setup: true },
    ];
    const assign = vi.spyOn(controller, "assignRandomCharacters")
      .mockResolvedValue({ status: 200 });
    vi.spyOn(controller, "refreshGameState").mockResolvedValue({ status: 200 });

    wrapper = mount(StorytellerControls, {
      attachTo: document.body,
      global: { stubs: { "font-awesome-icon": true } },
    });
    await wrapper.findAll("button")[0].trigger("click");
    await flushPromises();

    const baronInput = document.body.querySelector("[data-testid='setup-character-baron']");
    const drunkInput = document.body.querySelector("[data-testid='setup-character-drunk']");
    drunkInput.checked = true;
    drunkInput.dispatchEvent(new Event("change", { bubbles: true }));
    await flushPromises();
    expect(document.body.textContent).toContain("没有足够的“外来者”名额");
    expect(document.body.querySelector("button[type='submit']").disabled).toBe(true);

    baronInput.checked = true;
    baronInput.dispatchEvent(new Event("change", { bubbles: true }));
    await flushPromises();

    const counts = document.body.querySelector(".team-counts").textContent;
    expect(counts).toContain("镇民3 人");
    expect(counts).toContain("外来者2 人");
    expect(document.body.textContent).toContain("疯子");
    expect(document.body.textContent).toContain("尚不支持自动规则");

    document.body.querySelector(".storyteller-dialog")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(assign).toHaveBeenCalledOnce();
    const payload = assign.mock.calls[0][0];
    expect(payload.teamPlayerCount).toEqual({
      townsfolk: 5,
      outsider: 0,
      minion: 1,
      demon: 1,
    });
    expect(new Set(payload.setupCharacterIds)).toEqual(new Set(["baron", "drunk"]));
  });

  test("offers default winning teams before a server script is hydrated", async () => {
    const gameStore = useGameStore();
    const controller = useGameController();
    gameStore.level = "day";
    const endGame = vi.spyOn(controller, "endGame")
      .mockResolvedValue({ status: 200 });

    wrapper = mount(StorytellerControls, {
      attachTo: document.body,
      global: { stubs: { "font-awesome-icon": true } },
    });

    const endGameButton = wrapper.findAll("button")
      .find((button) => button.text().includes("结束游戏"));
    await endGameButton.trigger("click");
    await flushPromises();

    const dialog = document.body.querySelector("[role='dialog']");
    const teamSelect = dialog.querySelector("select");
    expect([...teamSelect.options].map((option) => option.value)).toContain("townsfolk");

    dialog.querySelector(".storyteller-dialog")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(endGame).toHaveBeenCalledWith({
      isComplete: true,
      result: "team-win",
      winningTeam: "townsfolk",
    });
    expect(window.$toast.success).toHaveBeenCalledWith(
      expect.stringContaining("结束游戏并公布结果成功"),
    );
  });

  test("requires and submits explicit winners for a special victory", async () => {
    const gameStore = useGameStore();
    const controller = useGameController();
    gameStore.level = "day";
    gameStore.players = {
      "user-1": { userId: "user-1", seat: 1, isDM: false },
      "user-2": { userId: "user-2", seat: 2, isDM: false },
    };
    gameStore.roomUsers = {
      "user-1": { userId: "user-1", displayName: "一号玩家" },
      "user-2": { userId: "user-2", displayName: "二号玩家" },
    };
    const endGame = vi.spyOn(controller, "endGame")
      .mockResolvedValue({ status: 200 });

    wrapper = mount(StorytellerControls, {
      attachTo: document.body,
      global: { stubs: { "font-awesome-icon": true } },
    });

    const endGameButton = wrapper.findAll("button")
      .find((button) => button.text().includes("结束游戏"));
    await endGameButton.trigger("click");
    await flushPromises();

    const dialog = document.body.querySelector("[role='dialog']");
    dialog.querySelector("input[value='special-win']").click();
    await flushPromises();
    const winnerCheckbox = dialog.querySelector("input[type='checkbox'][value='user-2']");
    expect(winnerCheckbox).not.toBeNull();
    winnerCheckbox.click();
    dialog.querySelector(".storyteller-dialog")
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(endGame).toHaveBeenCalledWith({
      isComplete: true,
      result: "special-win",
      winningPlayerIds: ["user-2"],
    });
  });

  test("lists connected spectators by name instead of requiring a raw user id", async () => {
    const gameStore = useGameStore();
    gameStore.level = "day";
    gameStore.roomUsers = {
      "spectator-1": {
        userId: "spectator-1",
        displayName: "等待入座的玩家",
      },
      "seated-1": {
        userId: "seated-1",
        displayName: "已入座玩家",
        isPlayer: true,
      },
    };
    gameStore.players = {
      "seated-1": { userId: "seated-1" },
    };

    wrapper = mount(StorytellerControls, {
      attachTo: document.body,
      global: { stubs: { "font-awesome-icon": true } },
    });

    const inviteButton = wrapper.findAll("button")
      .find((button) => button.text().includes("邀请与分享"));
    await inviteButton.trigger("click");
    await flushPromises();

    expect(document.body.textContent).toContain("等待入座的玩家");
    expect(document.body.textContent).not.toContain("已入座玩家");
    expect(document.body.querySelector("input[type='text']")).toBeNull();
    expect(document.body.querySelector("input[type='radio']:checked")?.value)
      .toBe("spectator-1");
  });
});

// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises, shallowMount } from "@vue/test-utils";
import Menu from "@/components/Menu.vue";
import { useAppStore } from "@/stores/app";
import { useGameStore } from "@/stores/game";
import { useSessionStore } from "@/stores/session";
import { useGameController } from "@/controllers/GameController";
import { useVoiceController } from "@/controllers/VoiceController";
import { SocketClientEvent } from "@/types/socket";

const methods = Menu.methods;

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("Menu store actions", () => {
  test("waits for the explicit room exit before disconnecting and fetching the lobby", async () => {
    const controller = useGameController();
    controller.connectionStatus = "connected";
    controller.gameSocket = {};
    let acknowledge;
    const request = vi.spyOn(controller, "request").mockImplementation(() => new Promise(resolve => { acknowledge = resolve; }));
    const disconnect = vi.spyOn(controller, "disconnect").mockImplementation(() => {});
    const disconnectVoice = vi.spyOn(useVoiceController(), "disconnect").mockResolvedValue(undefined);
    const replace = vi.fn().mockResolvedValue(undefined);
    const leaving = methods.leaveSession.call({ isApiRoom: true, $router: { replace } });
    useSessionStore().inputResolver(true);
    await flushPromises();
    expect(request).toHaveBeenCalledWith(SocketClientEvent.LeaveRoom);
    expect(disconnect).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    acknowledge({ status: 200 });
    await leaving;
    expect(disconnect).toHaveBeenCalledOnce();
    expect(disconnectVoice).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith({ name: "RoomList" });
  });

  test("cancelling exit leaves the socket and room unchanged", async () => {
    const controller = useGameController();
    const request = vi.spyOn(controller, "request");
    const replace = vi.fn();
    const leaving = methods.leaveSession.call({ isApiRoom: true, $router: { replace } });
    useSessionStore().inputResolver(false);
    await leaving;
    expect(request).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  test("routes timer settings to the extracted timer component", () => {
    const setTimer = vi.fn().mockResolvedValue(undefined);

    methods.openLocalTimerSettings.call({
      $refs: { localTimerControls: { setTimer } },
    });

    expect(setTimer).toHaveBeenCalledOnce();
  });

  test("routes distribution commands to the extracted controls", () => {
    const controls = {
      openRoles: vi.fn(),
      openTypes: vi.fn().mockResolvedValue(undefined),
      openBluffs: vi.fn(),
      openGrimoire: vi.fn(),
    };
    const context = { $refs: { roleDistributionControls: controls } };

    methods.openRoleDistribution.call(context);
    methods.openTypeDistribution.call(context);
    methods.openBluffDistribution.call(context);
    methods.openGrimoireDistribution.call(context);

    expect(controls.openRoles).toHaveBeenCalledOnce();
    expect(controls.openTypes).toHaveBeenCalledOnce();
    expect(controls.openBluffs).toHaveBeenCalledOnce();
    expect(controls.openGrimoire).toHaveBeenCalledOnce();
  });

  test("routes player and seat commands to the extracted controls", () => {
    const controls = {
      addPlayer: vi.fn().mockResolvedValue(undefined),
      randomizeSeatings: vi.fn().mockResolvedValue(undefined),
      clearPlayers: vi.fn().mockResolvedValue(undefined),
      clearRoles: vi.fn().mockResolvedValue(undefined),
    };
    const context = { $refs: { playerSeatControls: controls } };

    methods.addPlayer.call(context, null, "说书人");
    methods.randomizeSeatings.call(context);
    methods.clearPlayers.call(context);
    methods.clearRoles.call(context);

    expect(controls.addPlayer).toHaveBeenCalledWith(null, "说书人");
    expect(controls.randomizeSeatings).toHaveBeenCalledOnce();
    expect(controls.clearPlayers).toHaveBeenCalledOnce();
    expect(controls.clearRoles).toHaveBeenCalledOnce();
  });

  test("routes display controls directly through the app store", () => {
    const appStore = useAppStore();
    const toggleGrimoire = vi.spyOn(appStore, "toggleGrimoire");
    const toggleForwardEvilInfo = vi.spyOn(appStore, "toggleForwardEvilInfo");
    const toggleMuted = vi.spyOn(appStore, "toggleMuted");
    const toggleNightOrder = vi.spyOn(appStore, "toggleNightOrder");
    const toggleStatic = vi.spyOn(appStore, "toggleStatic");
    const setZoom = vi.spyOn(appStore, "setZoom");

    methods.toggleGrimoire(true);
    methods.toggleForwardEvilInfo(true);
    methods.toggleMuted(true);
    methods.toggleNightOrder(true);
    methods.toggleStatic(true);
    methods.setZoom(1.25);

    expect(toggleGrimoire).toHaveBeenCalledWith(true);
    expect(toggleForwardEvilInfo).toHaveBeenCalledWith(true);
    expect(toggleMuted).toHaveBeenCalledWith(true);
    expect(toggleNightOrder).toHaveBeenCalledWith(true);
    expect(toggleStatic).toHaveBeenCalledWith(true);
    expect(setZoom).toHaveBeenCalledWith(1.25);
  });

  test("routes room lifecycle commands to the extracted controls", () => {
    const controls = {
      hostSession: vi.fn().mockResolvedValue(undefined),
      joinSession: vi.fn().mockResolvedValue(undefined),
      copySessionUrl: vi.fn(),
      leaveSession: vi.fn().mockResolvedValue(undefined),
      backToLobby: vi.fn().mockResolvedValue(undefined),
    };
    const context = { $refs: { roomSessionControls: controls } };

    methods.hostSession.call(context);
    methods.joinSession.call(context);
    methods.copySessionUrl.call(context);
    methods.leaveSession.call(context);
    methods.backToLobby.call(context);

    expect(controls.hostSession).toHaveBeenCalledOnce();
    expect(controls.joinSession).toHaveBeenCalledOnce();
    expect(controls.copySessionUrl).toHaveBeenCalledOnce();
    expect(controls.leaveSession).toHaveBeenCalledOnce();
    expect(controls.backToLobby).toHaveBeenCalledOnce();
  });

  test("routes game table flow commands to the extracted controls", () => {
    const controls = {
      toggleNight: vi.fn(),
      goNight: vi.fn().mockResolvedValue(undefined),
      showTownSquare: vi.fn(),
      returnEveryoneToTown: vi.fn().mockResolvedValue(undefined),
      toggleIsReview: vi.fn().mockResolvedValue(undefined),
      toggleRaiseHand: vi.fn(),
    };
    const context = { $refs: { gameTableFlowControls: controls } };

    methods.toggleNight.call(context);
    methods.goNight.call(context);
    methods.showTownSquare.call(context);
    methods.returnEveryoneToTown.call(context);
    methods.toggleIsReview.call(context);
    methods.toggleRaiseHand.call(context);

    expect(controls.toggleNight).toHaveBeenCalledOnce();
    expect(controls.goNight).toHaveBeenCalledOnce();
    expect(controls.showTownSquare).toHaveBeenCalledOnce();
    expect(controls.returnEveryoneToTown).toHaveBeenCalledOnce();
    expect(controls.toggleIsReview).toHaveBeenCalledOnce();
    expect(controls.toggleRaiseHand).toHaveBeenCalledOnce();
  });

  test("closes chat before opening the menu through the stores", () => {
    const appStore = useAppStore();
    const sessionStore = useSessionStore();
    const toggleMenu = vi.spyOn(appStore, "toggleMenu");
    const setChatOpen = vi.spyOn(sessionStore, "setChatOpen");

    methods.toggleMenu.call(
      {
        grimoire: { isMenuOpen: false },
        session: { isChatOpen: true },
      },
      true,
    );

    expect(setChatOpen).toHaveBeenCalledWith(false);
    expect(toggleMenu).toHaveBeenCalledWith(true);
  });

  test("closes the menu before routing a modal through the app store", () => {
    const appStore = useAppStore();
    const toggleModal = vi.spyOn(appStore, "toggleModal");
    const toggleMenu = vi.fn();

    methods.toggleModal.call(
      {
        grimoire: { isMenuOpen: true },
        toggleMenu,
      },
      "settings",
    );

    expect(toggleMenu).toHaveBeenCalledWith(false);
    expect(toggleModal).toHaveBeenCalledWith("settings");
  });

  test("removes legacy-only commands from authoritative API rooms", () => {
    const appStore = useAppStore();
    const sessionStore = useSessionStore();
    const gameStore = useGameStore();
    sessionStore.setApiRoomSession({
      roomId: "ROOM12",
      gameServerId: "game-1",
    });
    gameStore.currentPlayer = { isDM: true };
    appStore.toggleMenu(true);

    const wrapper = shallowMount(Menu, {
      global: {
        stubs: {
          "font-awesome-icon": true,
        },
      },
    });

    expect(wrapper.text()).not.toContain("暂未同步");
    expect(wrapper.text()).not.toContain("请求私聊");
    expect(wrapper.text()).not.toContain("举手");
    expect(wrapper.text()).not.toContain("角色列表");
    expect(wrapper.text()).not.toContain("前往夜晚阶段");
    expect(wrapper.findComponent({ name: "PlayerRoomMenu" }).exists()).toBe(true);
    expect(wrapper.find(".room-menu-panel").exists()).toBe(false);
    wrapper.unmount();
  });

});


test('storyteller setup commands work during play through shortcuts and retain role checks', async () => {
  const context = {
    isApiRoom: true, gameStore: { currentIsDm: false, level: 'prepare' },
    toggleMenu: vi.fn(), openSeatEditor: vi.fn(), toggleModal: vi.fn(),
    clearRoles: vi.fn(), openLocalTimerSettings: vi.fn(),
  }
  await methods.runStorytellerAction.call(context, 'seats')
  expect(context.openSeatEditor).not.toHaveBeenCalled()
  context.gameStore.currentIsDm = true
  await methods.runStorytellerAction.call(context, 'seats')
  expect(context.openSeatEditor).toHaveBeenCalledOnce()
  await methods.runStorytellerAction.call(context, 'script')
  expect(context.toggleModal).toHaveBeenCalledWith('edition')
  context.gameStore.level = 'day'
  context.toggleModal.mockClear()
  for (const action of ['seats', 'roles', 'script', 'npc', 'clear']) await methods.runStorytellerAction.call(context, action)
  expect(context.openSeatEditor).toHaveBeenCalledTimes(2)
  expect(context.toggleModal.mock.calls).toEqual([['roles'], ['edition'], ['fabled']])
  expect(context.clearRoles).not.toHaveBeenCalled()
  await methods.runStorytellerAction.call(context, 'timer')
  expect(context.openLocalTimerSettings).toHaveBeenCalledOnce()
})

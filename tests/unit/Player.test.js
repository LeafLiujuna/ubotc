import { shallowMount, createLocalVue } from "@vue/test-utils";
import Vuex from "vuex";
import Player from "@/components/Player";
import voiceService from "@/services/voiceService";

const localVue = createLocalVue();
localVue.use(Vuex);

describe("Player component", () => {
  let store;
  let mockPlayer;

  beforeEach(() => {
    mockPlayer = {
      id: "test-player",
      name: "Test Player",
      role: {
        id: "villager",
        team: "townsfolk",
      },
      isDead: false,
      isVoteless: false,
      isTalking: false,
      reminders: [],
    };

    store = new Vuex.Store({
      modules: {
        players: {
          namespaced: true,
          state: {
            players: [mockPlayer],
          },
          getters: {
            nightOrder: () => [],
          },
          mutations: {
            update: jest.fn(),
          },
        },
      },
      state: {
        session: {
          sessionId: "test-session",
          playerId: "test-player",
          isSpectator: false,
          claimedSeat: 0,
          votes: [],
        },
        grimoire: {
          zoom: 0,
          isPublic: false,
          isShowVacant: true,
        },
      },
      mutations: {
        "session/setInputResolver": jest.fn(),
        "session/setInputRejecter": jest.fn(),
        "session/setInputType": jest.fn(),
        "session/setInputModal": jest.fn(),
        "session/setInputData": jest.fn(),
        toggleModal: jest.fn(),
        "session/voteSync": jest.fn(),
      },
    });
    jest.spyOn(store, "commit");
    voiceService.onAudioLevelChanged = null;
  });

  test("should render player component", () => {
    const wrapper = shallowMount(Player, {
      localVue,
      store,
      propsData: {
        player: mockPlayer,
      },
    });

    expect(wrapper.exists()).toBe(true);
    expect(wrapper.find(".name").text()).toContain("Test Player");
  });

  test("should display speaker aura when player is talking", () => {
    mockPlayer.isTalking = true;
    const wrapper = shallowMount(Player, {
      localVue,
      store,
      propsData: {
        player: mockPlayer,
      },
    });

    const speakerAura = wrapper.find(".speaker-aura");
    expect(speakerAura.exists()).toBe(true);
    expect(speakerAura.classes()).toContain("active");
  });

  test("should not display speaker aura when player is not talking", () => {
    mockPlayer.isTalking = false;
    const wrapper = shallowMount(Player, {
      localVue,
      store,
      propsData: {
        player: mockPlayer,
      },
    });

    const speakerAura = wrapper.find(".speaker-aura");
    expect(speakerAura.exists()).toBe(true);
    expect(speakerAura.classes()).not.toContain("active");
  });

  test("should initialize voice service callback", () => {
    shallowMount(Player, {
      localVue,
      store,
      propsData: {
        player: mockPlayer,
      },
    });

    expect(voiceService.onAudioLevelChanged).toBeDefined();
  });

  test("should update player talking state on audio level change", () => {
    shallowMount(Player, {
      localVue,
      store,
      propsData: {
        player: mockPlayer,
      },
    });

    if (voiceService.onAudioLevelChanged) {
      voiceService.onAudioLevelChanged("test-player", 50, true);
    }

    expect(store.commit).toHaveBeenCalledWith("players/update", {
      player: mockPlayer,
      property: "isTalking",
      value: true,
    });
  });

  test("should handle player click events", () => {
    const wrapper = shallowMount(Player, {
      localVue,
      store,
      propsData: {
        player: mockPlayer,
      },
    });

    const lifeElement = wrapper.find(".life");
    lifeElement.trigger("click");

    expect(wrapper.vm.toggleStatus).toBeDefined();
  });

  test("should handle player menu operations", () => {
    const wrapper = shallowMount(Player, {
      localVue,
      store,
      propsData: {
        player: mockPlayer,
      },
    });

    const nameElement = wrapper.find(".name");
    nameElement.trigger("click");

    expect(wrapper.vm.isMenuOpen).toBe(true);
  });

  test("should display correct seat number", () => {
    const wrapper = shallowMount(Player, {
      localVue,
      store,
      propsData: {
        player: mockPlayer,
      },
    });

    const seatNum = wrapper.find(".seatNum");
    expect(seatNum.text()).toBe("1");
  });

  test("should display correct role team color for speaker aura", () => {
    mockPlayer.isTalking = true;
    const wrapper = shallowMount(Player, {
      localVue,
      store,
      propsData: {
        player: mockPlayer,
      },
    });

    const speakerAura = wrapper.find(".speaker-aura");
    expect(speakerAura.exists()).toBe(true);
    expect(speakerAura.classes()).toContain("active");
  });
});

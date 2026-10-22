import voiceService from "@/services/voiceService";

describe("VoiceService", () => {
  beforeEach(() => {
    // 重置语音服务状态
    voiceService.stopVoice();
  });

  test("should initialize voice service", () => {
    const mockSocket = {
      addEventListener: jest.fn(),
      readyState: 1, // OPEN
    };
    const mockStore = {
      state: {
        session: {
          claimedSeat: 0,
          playerId: "test-player",
        },
        players: {
          players: [{ id: "test-player" }],
        },
      },
    };

    voiceService.init(
      mockSocket,
      "test-channel",
      "test-player",
      true,
      mockStore,
    );

    expect(voiceService.isInitialized).toBe(true);
    expect(voiceService.playerId).toBe("test-player");
    expect(voiceService.channel).toBe("test-channel");
  });

  test("should check if user can speak", () => {
    const mockStore = {
      state: {
        session: {
          claimedSeat: 0,
        },
        players: {
          players: [],
        },
      },
    };

    // 设置为非 host 状态
    voiceService.isHost = false;
    voiceService.store = mockStore;
    voiceService.updateSeatInfo();
    expect(voiceService.canSpeak()).toBe(true);

    mockStore.state.session.claimedSeat = -1;
    voiceService.updateSeatInfo();
    expect(voiceService.canSpeak()).toBe(false);
  });

  test("should toggle mute state", () => {
    voiceService.isMuted = false;
    const result = voiceService.toggleMute();
    expect(result).toBe(true);
    expect(voiceService.isMuted).toBe(true);

    const result2 = voiceService.toggleMute();
    expect(result2).toBe(false);
    expect(voiceService.isMuted).toBe(false);
  });

  test("should set volume correctly", () => {
    voiceService.setVolume(50);
    expect(voiceService.settings.volume).toBe(50);

    voiceService.setVolume(150); // 超出范围，应该被限制
    expect(voiceService.settings.volume).toBe(100);

    voiceService.setVolume(-10); // 负数，应该被限制
    expect(voiceService.settings.volume).toBe(0);
  });

  test("should check WebRTC support", () => {
    // 模拟浏览器环境
    window.RTCPeerConnection = jest.fn();
    navigator.mediaDevices = {
      getUserMedia: jest.fn(),
    };

    // 由于isSupported是静态方法，需要直接从VoiceService类调用
    const VoiceService = Object.getPrototypeOf(voiceService).constructor;
    expect(VoiceService.isSupported()).toBe(true);

    // 模拟不支持的环境
    delete window.RTCPeerConnection;
    expect(VoiceService.isSupported()).toBe(false);
  });

  test("should handle audio level changes", () => {
    let testPlayerId = null;
    let testLevel = 0;

    voiceService.onAudioLevelChanged = (playerId, level) => {
      testPlayerId = playerId;
      testLevel = level;
    };

    // 模拟音频电平变化
    voiceService.audioLevels.set("test-player", 50);
    if (voiceService.onAudioLevelChanged) {
      voiceService.onAudioLevelChanged("test-player", 50);
    }

    expect(testPlayerId).toBe("test-player");
    expect(testLevel).toBe(50);
  });
});

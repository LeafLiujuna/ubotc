import apiClient from "@/services/api";
import roomService, { normalizeRoom } from "@/services/services/room";

vi.mock("@/services/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("@/config/env", () => ({
  isMockEnabled: () => false,
}));

describe("roomService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("normalizes room list items from lobby API", async () => {
    apiClient.get.mockResolvedValue([
      {
        roomId: "ABC123",
        name: "周末新手局",
        host: "host-1",
        level: "prepare",
        playerCount: 3,
        maxPlayer: 8,
        tags: [{ tag: "difficulty", detail: "新手" }],
      },
    ]);

    await expect(roomService.getRooms()).resolves.toEqual([
      expect.objectContaining({
        id: "ABC123",
        name: "周末新手局",
        host: "host-1",
        status: "等待开局",
        playerCount: 3,
        maxPlayers: 8,
      }),
    ]);
  });

  test("maps create form data to backend payload", async () => {
    apiClient.post.mockResolvedValue({
      roomId: "ROOM01",
      gameServerId: "server-1",
      isPrivate: true,
      maxOnline: 12,
    });

    const result = await roomService.createRoom({
      name: "进阶局",
      isPrivate: true,
      password: "secret",
      difficulty: "Intermediate",
      maxPlayers: 12,
    });

    expect(apiClient.post).toHaveBeenCalledWith("/rooms", {
      name: "进阶局",
      tags: [{ tag: "difficulty", detail: "进阶" }],
      isPrivate: true,
      password: "secret",
      maxOnline: 12,
    });
    expect(result).toEqual(expect.objectContaining({ id: "ROOM01", maxPlayers: 12 }));
  });

  test("posts join password to lobby API", async () => {
    apiClient.post.mockResolvedValue({
      token: "game-token",
      roomId: "ROOM01",
      gameServerId: "server-1",
      gameServerUrl: "http://127.0.0.1:8087",
    });

    await expect(roomService.joinRoom("ROOM01", "secret")).resolves.toEqual(
      expect.objectContaining({ token: "game-token" }),
    );
    expect(apiClient.post).toHaveBeenCalledWith("/room/ROOM01/join", { password: "secret" });
  });

  test("normalizes detail response", () => {
    expect(
      normalizeRoom({
        roomId: "ROOM02",
        name: "详情测试",
        gameServerId: "server-2",
        maxOnline: 10,
        createdAt: 1760000000,
      }),
    ).toEqual(
      expect.objectContaining({
        id: "ROOM02",
        gameServerId: "server-2",
        maxPlayers: 10,
        createdAt: 1760000000,
      }),
    );
  });
});

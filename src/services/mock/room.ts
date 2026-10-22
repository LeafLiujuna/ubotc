import type { CreateRoomInput, JoinRoomResponse, NormalizedRoom } from "../services/types";

const mockRoomService = {
  getRooms(): NormalizedRoom[] {
    console.warn("后端服务不可用，使用模拟数据");
    return [
      {
        id: "1",
        roomId: "1",
        name: "测试房间 1",
        editionId: "custom",
        edition: "自定义剧本",
        gameServerId: "mock-game-server",
        host: "未知",
        playerCount: 2,
        onlineCount: 2,
        maxPlayers: 4,
        isPrivate: false,
        status: "等待开局",
        tags: [],
        createdAt: new Date().toISOString(),
      },
      {
        id: "2",
        roomId: "2",
        name: "测试房间 2",
        editionId: "custom",
        edition: "自定义剧本",
        gameServerId: "mock-game-server",
        host: "未知",
        playerCount: 3,
        onlineCount: 3,
        maxPlayers: 6,
        isPrivate: true,
        status: "等待开局",
        tags: [],
        createdAt: new Date().toISOString(),
      },
    ];
  },

  createRoom(roomData: CreateRoomInput): NormalizedRoom {
    console.warn("后端服务不可用，使用模拟数据");
    const id = Math.random().toString(36).slice(2, 11);
    return {
      id,
      roomId: id,
      name: roomData.name,
      editionId: "custom",
      edition: "自定义剧本",
      gameServerId: "mock-game-server",
      host: "未知",
      playerCount: 1,
      onlineCount: 1,
      maxPlayers: Number(roomData.maxPlayers ?? roomData.maxOnline ?? 12),
      isPrivate: Boolean(roomData.isPrivate),
      status: "等待开局",
      tags: [],
      createdAt: new Date().toISOString(),
    };
  },

  joinRoom(roomId: string, password: string | null = null): JoinRoomResponse {
    void password;
    console.warn("后端服务不可用，使用模拟数据");
    return {
      token: "mock-game-token",
      roomId,
      gameServerId: "mock-game-server",
      gameServerUrl: window.location.origin,
    };
  },

  leaveRoom(roomId: string): { success: boolean; message: string; roomId: string } {
    console.warn("后端服务不可用，使用模拟数据");
    return {
      success: true,
      message: "成功离开房间",
      roomId,
    };
  },
};

export default mockRoomService;
import voiceRoomService from "@/services/voiceRoomService";

describe("VoiceRoomService", () => {
  beforeEach(() => {
    // 重置房间服务状态
    voiceRoomService.rooms.clear();
    voiceRoomService.currentRoomId = null;
  });

  test("should initialize voice room service", () => {
    voiceRoomService.init("test-player", "Test Player");

    expect(voiceRoomService.playerId).toBe("test-player");
    expect(voiceRoomService.playerName).toBe("Test Player");
    expect(voiceRoomService.rooms.size).toBeGreaterThan(0); // 应该创建默认房间
  });

  test("should create public room", () => {
    voiceRoomService.init("test-player", "Test Player");
    const publicRoom = voiceRoomService.rooms.get(
      voiceRoomService.PUBLIC_ROOM_ID,
    );

    expect(publicRoom).toBeDefined();
    expect(publicRoom.isPublic).toBe(true);
    expect(publicRoom.name).toBe("公共语音");
  });

  test("should create private room", () => {
    voiceRoomService.init("test-player", "Test Player");
    const roomId = voiceRoomService.createPrivateRoom("Test Room");
    const room = voiceRoomService.rooms.get(roomId);

    expect(room).toBeDefined();
    expect(room.isPublic).toBe(false);
    expect(room.name).toBe("Test Room");
    expect(room.creatorId).toBe("test-player");
  });

  test("should join room", () => {
    voiceRoomService.init("test-player", "Test Player");
    const roomId = voiceRoomService.createPrivateRoom("Test Room");
    const result = voiceRoomService.joinRoom(roomId);

    expect(result).toBe(true);
    expect(voiceRoomService.currentRoomId).toBe(roomId);
    const room = voiceRoomService.rooms.get(roomId);
    expect(room.members.has("test-player")).toBe(true);
  });

  test("should leave room", () => {
    voiceRoomService.init("test-player", "Test Player");
    const roomId = voiceRoomService.createPrivateRoom("Test Room");
    voiceRoomService.joinRoom(roomId);

    const result = voiceRoomService.leaveRoom(roomId);
    expect(result).toBe(true);
    expect(voiceRoomService.currentRoomId).toBe(
      voiceRoomService.PUBLIC_ROOM_ID,
    );

    const room = voiceRoomService.rooms.get(roomId);
    expect(room).toBeUndefined(); // 私有房间为空时应该被删除
  });

  test("should get room list", () => {
    voiceRoomService.init("test-player", "Test Player");
    voiceRoomService.createPrivateRoom("Test Room");
    const roomList = voiceRoomService.getRoomList();

    expect(Array.isArray(roomList)).toBe(true);
    expect(roomList.length).toBeGreaterThan(0);
  });

  test("should get room members", () => {
    voiceRoomService.init("test-player", "Test Player");
    const roomId = voiceRoomService.createPrivateRoom("Test Room");
    const members = voiceRoomService.getRoomMembers(roomId);

    expect(Array.isArray(members)).toBe(true);
    expect(members.length).toBe(1); // 创建者应该自动加入
    expect(members[0].id).toBe("test-player");
  });

  test("should get current room", () => {
    voiceRoomService.init("test-player", "Test Player");
    const roomId = voiceRoomService.createPrivateRoom("Test Room");
    voiceRoomService.joinRoom(roomId);
    const currentRoom = voiceRoomService.getCurrentRoom();

    expect(currentRoom).toBeDefined();
    expect(currentRoom.id).toBe(roomId);
  });

  test("should close room", () => {
    voiceRoomService.init("test-player", "Test Player");
    const roomId = voiceRoomService.createPrivateRoom("Test Room");
    const result = voiceRoomService.closeRoom(roomId);

    expect(result).toBe(true);
    expect(voiceRoomService.rooms.has(roomId)).toBe(false);
    expect(voiceRoomService.currentRoomId).toBe(
      voiceRoomService.PUBLIC_ROOM_ID,
    );
  });

  test("should handle player join", () => {
    voiceRoomService.init("test-player", "Test Player");
    const roomId = voiceRoomService.createPrivateRoom("Test Room");

    voiceRoomService.handlePlayerJoin(roomId, {
      id: "other-player",
      name: "Other Player",
      joinedAt: Date.now(),
    });

    const room = voiceRoomService.rooms.get(roomId);
    expect(room.members.has("other-player")).toBe(true);
  });

  test("should handle player leave", () => {
    voiceRoomService.init("test-player", "Test Player");
    const roomId = voiceRoomService.createPrivateRoom("Test Room");

    voiceRoomService.handlePlayerJoin(roomId, {
      id: "other-player",
      name: "Other Player",
      joinedAt: Date.now(),
    });

    voiceRoomService.handlePlayerLeave(roomId, "other-player");
    const room = voiceRoomService.rooms.get(roomId);
    expect(room.members.has("other-player")).toBe(false);
  });
});

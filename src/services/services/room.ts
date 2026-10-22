import apiClient from "../api";
import mockRoomService from "../mock/room";
import { isMockEnabled } from "../../config/env";
import type { CreateRoomInput, GameRoomTag, JoinRoomResponse, NormalizedRoom, RawRoom } from "./types";

const difficultyLabels: Record<string, string> = {
  Beginner: "新手",
  Intermediate: "进阶",
  Veteran: "老手",
};

export function normalizeRoom(room: RawRoom): NormalizedRoom {
  const roomId = room.roomId || room.id || "";
  return {
    id: roomId,
    roomId,
    name: room.name || roomId,
    editionId: room.gameScriptId || "custom",
    edition: room.gameScriptId || "自定义剧本",
    gameServerId: room.gameServerId || "",
    host: room.host || "未知",
    playerCount: Number(room.playerCount || room.onlineCount || room.currentPlayers || 0),
    onlineCount: Number(room.onlineCount || room.playerCount || room.currentPlayers || 0),
    maxPlayers: Number(room.maxPlayer || room.maxPlayers || room.maxOnline || 12),
    isPrivate: Boolean(room.isPrivate),
    status: room.level === "prepare" ? "等待开局" : room.level || "等待开局",
    tags: Array.isArray(room.tags) ? room.tags : [],
    createdAt: room.createdAt || null,
  };
}

function normalizeRoomList(rooms: RawRoom[] | unknown): NormalizedRoom[] {
  return Array.isArray(rooms) ? rooms.map((room) => normalizeRoom(room as RawRoom)) : [];
}

function toCreateRoomPayload(roomData: CreateRoomInput): {
  name: string;
  tags: GameRoomTag[];
  isPrivate: boolean;
  password: string | null;
  maxOnline: number;
} {
  const difficulty = roomData.difficulty || "Beginner";
  const tags: GameRoomTag[] = [
    {
      tag: "difficulty",
      detail: difficultyLabels[difficulty] || difficulty,
    },
  ];

  return {
    name: roomData.name,
    tags,
    isPrivate: Boolean(roomData.isPrivate),
    password: roomData.isPrivate ? roomData.password || null : null,
    maxOnline: Number(roomData.maxPlayers || roomData.maxOnline || 12),
  };
}

const roomService = {
  async getRooms(): Promise<NormalizedRoom[]> {
    try {
      const rooms = await apiClient.get<unknown, RawRoom[]>("/rooms");
      return normalizeRoomList(rooms);
    } catch (error) {
      if (isMockEnabled()) {
        return normalizeRoomList(mockRoomService.getRooms());
      }
      throw error;
    }
  },

  async getRoom(roomId: string): Promise<NormalizedRoom> {
    try {
      const room = await apiClient.get<unknown, RawRoom>(`/room/${roomId}`);
      return normalizeRoom(room);
    } catch (error) {
      console.warn("获取房间详情失败:", error);
      throw error;
    }
  },

  async createRoom(roomData: CreateRoomInput): Promise<NormalizedRoom> {
    try {
      const payload = toCreateRoomPayload(roomData);
      const created = await apiClient.post<unknown, RawRoom>("/rooms", payload);
      return normalizeRoom({
        ...created,
        name: roomData.name,
        tags: payload.tags,
        maxOnline: payload.maxOnline,
      });
    } catch (error) {
      if (isMockEnabled()) {
        return normalizeRoom(mockRoomService.createRoom(roomData));
      }
      throw error;
    }
  },

  async joinRoom(roomId: string, password: string | null = null): Promise<JoinRoomResponse> {
    try {
      const payload = password ? { password } : {};
      return await apiClient.post<unknown, JoinRoomResponse>(`/room/${roomId}/join`, payload);
    } catch (error) {
      if (isMockEnabled()) {
        return mockRoomService.joinRoom(roomId, password);
      }
      throw error;
    }
  },

  async leaveRoom(roomId: string): Promise<unknown> {
    if (isMockEnabled()) {
      return mockRoomService.leaveRoom(roomId);
    }
    return { status: 200, data: { roomId } };
  },

  async discardRoom(roomId: string): Promise<unknown> {
    try {
      return await apiClient.post(`/rooms/${roomId}/discard`);
    } catch (error) {
      console.warn("放弃房间所有权失败:", error);
      throw error;
    }
  },
};

export default roomService;
import apiClient from "../api";
import type { RankingItem, ServerLoadResponse, UploadGameScriptResponse } from "./types";

type JwksResponse = {
  keys: Array<Record<string, unknown>>;
};

const gameService = {
  async getGameResult(gameId: string): Promise<Record<string, unknown>> {
    try {
      return await apiClient.get<unknown, Record<string, unknown>>(`/game-result/${gameId}`);
    } catch (error) {
      console.warn("获取对局记录失败:", error);
      throw error;
    }
  },

  async getGameScript(scriptId: string): Promise<Record<string, unknown>> {
    try {
      return await apiClient.get<unknown, Record<string, unknown>>(`/game-script/${scriptId}`);
    } catch (error) {
      console.warn("获取游戏剧本失败:", error);
      throw error;
    }
  },

  async uploadGameScript(script: Record<string, unknown>, isPublic = false): Promise<UploadGameScriptResponse> {
    try {
      return await apiClient.post<unknown, UploadGameScriptResponse>("/game-scripts", {
        gameScript: script,
        isPublic,
      });
    } catch (error) {
      console.warn("上传游戏剧本失败:", error);
      throw error;
    }
  },

  async getServerLoad(): Promise<ServerLoadResponse> {
    try {
      return await apiClient.get<unknown, ServerLoadResponse>("/servers");
    } catch (error) {
      console.warn("获取服务器信息失败:", error);
      throw error;
    }
  },

  async getRankings(limit = 50): Promise<RankingItem[]> {
    try {
      const params = new URLSearchParams();
      params.set("limit", limit.toString());
      return await apiClient.get<unknown, RankingItem[]>(`/rankings?${params.toString()}`);
    } catch (error) {
      console.warn("获取排行榜失败:", error);
      throw error;
    }
  },

  async healthCheck(): Promise<{ status: string }> {
    try {
      return await apiClient.get<unknown, { status: string }>("/health");
    } catch (error) {
      console.warn("健康检查失败:", error);
      throw error;
    }
  },

  async getJwks(): Promise<JwksResponse> {
    try {
      return await apiClient.get<unknown, JwksResponse>("/.well-known/jwks.json");
    } catch (error) {
      console.warn("获取JWKS失败:", error);
      throw error;
    }
  },
};

export default gameService;
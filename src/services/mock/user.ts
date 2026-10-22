import type { MeResponse } from "../services/types";

const mockUserService = {
  getCurrentUser(): MeResponse {
    console.warn("后端服务不可用，使用模拟数据");
    return {
      id: "mock-user-id",
      displayName: "测试用户",
      avatarUrl: undefined,
      level: 5,
      storytellerLevel: 2,
      isCertifiedStoryteller: false,
    };
  },

  getUser(userId: string): MeResponse {
    console.warn("后端服务不可用，使用模拟数据");
    return {
      id: userId,
      displayName: `用户${userId}`,
      avatarUrl: undefined,
      level: Math.floor(Math.random() * 10) + 1,
      storytellerLevel: Math.floor(Math.random() * 5),
      isCertifiedStoryteller: Math.random() > 0.7,
    };
  },

  updateUser(userId: string, userData: Partial<MeResponse>): MeResponse {
    console.warn("后端服务不可用，使用模拟数据");
    return {
      id: userId,
      displayName: userData.displayName || `用户${userId}`,
      avatarUrl: userData.avatarUrl,
      level: Math.floor(Math.random() * 10) + 1,
      storytellerLevel: Math.floor(Math.random() * 5),
      isCertifiedStoryteller: Math.random() > 0.7,
    };
  },

  deleteUser(userId: string): { success: boolean; message: string } {
    void userId;
    console.warn("后端服务不可用，使用模拟数据");
    return {
      success: true,
      message: "用户删除成功",
    };
  },
};

export default mockUserService;
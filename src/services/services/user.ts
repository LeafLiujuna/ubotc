import apiClient from "../api";
import type { MeResponse } from "./types";

const userService = {
  async getCurrentUser(): Promise<MeResponse> {
    try {
      return await apiClient.get<unknown, MeResponse>("/user/me");
    } catch (error) {
      console.warn("Failed to get current user:", error);
      throw error;
    }
  },

  async getUser(userId: string): Promise<MeResponse> {
    try {
      return await apiClient.get<unknown, MeResponse>(`/user/${userId}`);
    } catch (error) {
      console.warn("Failed to get user:", error);
      throw error;
    }
  },

  async updateUser(userId: string, userData: Partial<MeResponse>): Promise<never> {
    void userId;
    void userData;
    throw new Error("User update API is not implemented by the lobby server");
  },

  async deleteUser(userId: string): Promise<never> {
    void userId;
    throw new Error("User delete API is not implemented by the lobby server");
  },
};

export default userService;
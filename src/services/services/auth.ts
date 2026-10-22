import apiClient from "../api";
import { AuthHelper } from "@/helpers/auth";
import { buildAuthLoginUrl, sanitizeAuthReturnTo } from "@/auth/session";
import { getLoginProvider, isDev } from "@/config/env";
import type { DevLoginIdentity } from "@/types/auth";
import type { DevLoginResponse, MeResponse } from "./types";

const authApiService = {
  async getMe(): Promise<MeResponse> {
    try {
      return await apiClient.get<unknown, MeResponse>("/auth/me");
    } catch (error) {
      console.warn("获取用户信息失败:", error);
      throw error;
    }
  },

  async logout(): Promise<unknown> {
    try {
      const response = await apiClient.post("/auth/logout");
      AuthHelper.clearToken();
      return response;
    } catch (error) {
      console.warn("登出失败:", error);
      AuthHelper.clearToken();
      throw error;
    }
  },

  async refreshToken(): Promise<unknown> {
    try {
      return await apiClient.post("/auth/refresh-token");
    } catch (error) {
      console.warn("刷新token失败:", error);
      throw error;
    }
  },

  async devLogin(identity: DevLoginIdentity = "host", clientId?: string): Promise<DevLoginResponse> {
    if (!isDev()) {
      throw new Error("Development login is disabled in production builds.");
    }
    const result = await apiClient.post<unknown, DevLoginResponse>("/auth/dev-login", {
      identity,
      ...(clientId ? { clientId } : {}),
    });
    AuthHelper.token = result.token;
    return result;
  },

  getLoginUrl(callbackMode = "redirect", redirectUrl: string | undefined = undefined): string {
    if (callbackMode === "redirect") return buildAuthLoginUrl(redirectUrl);
    const params = new URLSearchParams({ callbackMode, frontendOrigin: window.location.origin, provider: getLoginProvider() });
    if (redirectUrl) params.set("redirectUrl", sanitizeAuthReturnTo(redirectUrl));
    return `/auth/login?${params.toString()}`;
  },

  getEditProfileUrl(): string {
    return "/auth/edit-profile";
  },
};

export default authApiService;

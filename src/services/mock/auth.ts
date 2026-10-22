import type { MeResponse } from "../services/types";

type LogoutResponse = {
  status: number;
  data: {
    ok: boolean;
    logoutUrl: string | null;
  };
};

const mockAuthService = {
  getMe(): MeResponse {
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

  logout(): LogoutResponse {
    console.warn("后端服务不可用，使用模拟数据");
    return {
      status: 200,
      data: {
        ok: true,
        logoutUrl: null,
      },
    };
  },

  refreshToken(): { status: number } {
    console.warn("后端服务不可用，使用模拟数据");
    return {
      status: 200,
    };
  },

  getLoginUrl(callbackMode = "redirect", redirectUrl: string | undefined = undefined): string {
    const params = new URLSearchParams();
    params.set("callbackMode", callbackMode);
    if (redirectUrl) {
      params.set("redirectUrl", redirectUrl);
    }
    return `/auth/login?${params.toString()}`;
  },

  getEditProfileUrl(): string {
    return "/api/auth/edit-profile";
  },
};

export default mockAuthService;
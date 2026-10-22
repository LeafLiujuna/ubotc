import { apiClient } from "@/transport/http";
import { buildAuthLoginUrl, sanitizeAuthReturnTo } from "@/auth/session";
import { getLoginProvider, isDev } from "@/config/env";
import type {
  AuthCallbackMode,
  AuthDevLoginResponse,
  AuthLogoutResponse,
  AuthMeResponse,
  AuthRefreshTokenResponse,
  AuthCompleteLoginResponse,
  DevLoginIdentity,
  AuthEmailCodeResponse,
  AuthAccountResponse,
  EmailCodePurpose,
  AccountRegistration,
  AccountEmailProof,
} from "../../types/auth";

export const AuthApi = {
  async sendEmailCode(email: string, purpose: EmailCodePurpose): Promise<AuthEmailCodeResponse> {
    const { data } = await apiClient.post<AuthEmailCodeResponse>("/api/auth/email/code", { email, purpose }, {
      baseURL: window.location.origin, timeout: 45_000,
    });
    return data;
  },

  async passwordLogin(account: string, password: string, redirectUrl?: string): Promise<AuthAccountResponse> {
    const { data } = await apiClient.post<AuthAccountResponse>("/api/auth/account/login", {
      account, password, redirectUrl: sanitizeAuthReturnTo(redirectUrl),
    }, { baseURL: window.location.origin });
    return data;
  },

  async register(input: AccountRegistration, redirectUrl?: string): Promise<AuthAccountResponse> {
    const { data } = await apiClient.post<AuthAccountResponse>("/api/auth/account/register", {
      ...input, redirectUrl: sanitizeAuthReturnTo(redirectUrl),
    }, { baseURL: window.location.origin });
    return data;
  },

  async resetPassword(input: AccountEmailProof & { password: string }) {
    const { data } = await apiClient.post<{ status: number; data?: { ok: boolean }; message?: string }>("/api/auth/account/reset-password", input, {
      baseURL: window.location.origin,
    });
    return data;
  },
  async devLogin(identity: DevLoginIdentity = "host", clientId?: string): Promise<AuthDevLoginResponse> {
    if (!isDev()) {
      throw new Error("Development login is disabled in production builds.");
    }
    const { data } = await apiClient.post<AuthDevLoginResponse>("/auth/dev-login", {
      identity,
      ...(clientId ? { clientId } : {}),
    });
    return data;
  },

  async logout(): Promise<AuthLogoutResponse> {
    const { data } = await apiClient.post<AuthLogoutResponse>("/auth/logout");
    return data;
  },

  async me(): Promise<AuthMeResponse> {
    const { data } = await apiClient.get<AuthMeResponse>("/auth/me");
    return data;
  },

  async refreshToken(): Promise<AuthRefreshTokenResponse> {
    const { data } = await apiClient.post<AuthRefreshTokenResponse>("/auth/refresh-token");
    return data;
  },

  async completeLogin(ticket: string): Promise<AuthCompleteLoginResponse> {
    // Use the frontend proxy so the initiation cookie remains on the same
    // browser origin, even if the API/callback has a separate host or port.
    const { data } = await apiClient.post<AuthCompleteLoginResponse>("/api/auth/complete", { ticket }, {
      baseURL: window.location.origin,
    });
    return data;
  },

  async linkQq(redirectUrl?: string): Promise<string> {
    const { data } = await apiClient.post<{ status: number; data?: { authorizationUrl: string }; message?: string }>("/api/auth/qq/link", {
      redirectUrl: sanitizeAuthReturnTo(redirectUrl),
    }, { baseURL: window.location.origin });
    if (data.status !== 200 || !data.data?.authorizationUrl) throw new Error(data.message || "QQ 绑定暂不可用");
    return data.data.authorizationUrl;
  },

  getLoginUrl(callbackMode: AuthCallbackMode = "redirect", redirectUrl?: string): string {
    if (callbackMode === "redirect") return buildAuthLoginUrl(redirectUrl);
    const params = new URLSearchParams({ callbackMode, frontendOrigin: window.location.origin, provider: getLoginProvider() });
    if (redirectUrl) params.set("redirectUrl", sanitizeAuthReturnTo(redirectUrl));
    return `/auth/login?${params.toString()}`;
  },

  getEditProfileUrl(): string {
    return "/auth/edit-profile";
  },
};

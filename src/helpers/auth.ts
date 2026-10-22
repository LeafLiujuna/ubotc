import { AuthApi } from "@/api/http/auth";
import type { AuthRefreshTokenResponse } from "@/types";
import {
  buildAuthLoginUrl,
  clearAuthToken,
  getAuthToken,
  migrateLegacyAuthToken,
  sanitizeAuthReturnTo,
  saveAuthReturnTo,
  setAuthToken,
} from "@/auth/session";

export const AuthHelper = {
  get token(): string | null {
    return getAuthToken();
  },
  set token(value: string | null) {
    setAuthToken(value);
  },
  migrateLegacyToken(): string | null {
    return migrateLegacyAuthToken();
  },
  clearToken() {
    clearAuthToken();
  },
  async refreshToken(): Promise<AuthRefreshTokenResponse> {
    const data = await AuthApi.refreshToken();
    if (data.errorCode === "ERR::SESSION_EXPIRED") {
      this.clearToken();
    }
    return data;
  },
  doLogin(returnTo?: string): void {
    const safeReturnTo = sanitizeAuthReturnTo(returnTo);
    saveAuthReturnTo(safeReturnTo);

    window.location.assign(buildAuthLoginUrl(safeReturnTo));
  },
  async logout() {
    let remoteError: unknown;
    let logoutUrl: string | null = null;
    try {
      const response = await AuthApi.logout();
      if (response.status < 200 || response.status >= 300) {
        throw new Error(response.message || "退出登录失败，请稍后重试");
      }
      logoutUrl = response.data?.logoutUrl ?? null;
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      // An expired/revoked session is already logged out on the server.
      if (status !== 401) remoteError = error;
    } finally {
      this.clearToken();
      const { useUserStore } = await import("@/stores/user");
      useUserStore().setCurrentUser(null);
    }
    if (remoteError) throw remoteError;
    return logoutUrl;
  }
}

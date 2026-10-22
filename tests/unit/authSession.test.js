import {
  AUTH_RETURN_TO_KEY,
  AUTH_TOKEN_KEY,
  buildAuthLoginUrl,
  buildOAuthLoginUrl,
  migrateLegacyAuthToken,
  sanitizeAuthReturnTo,
  saveAuthReturnTo,
  setAuthToken,
  getAuthToken,
  clearAuthToken,
} from "@/auth/session";
import { AuthApi } from "@/api/http/auth";
import { AuthHelper } from "@/helpers/auth";
import { createPinia, setActivePinia } from "pinia";
import { useUserStore } from "@/stores/user";
import { UserApi } from "@/api/http/user";
import { apiClient } from "@/transport/http";
import { getLoginLabel } from "@/config/env";

describe("auth session", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.restoreAllMocks();
    vi.stubEnv("VITE_AUTH_MODE", "oidc");
    vi.stubEnv("DEV", true);
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, "", "/rooms?query=night#open");
  });

  afterEach(() => vi.unstubAllEnvs());

  test("local login returns to the requested room without contacting OIDC", () => {
    vi.stubEnv("VITE_AUTH_MODE", "local");
    expect(buildAuthLoginUrl("/rooms?room=ABC#open")).toBe("/rooms?room=ABC#open");
    expect(buildAuthLoginUrl("/game/ABC")).toBe("/game/ABC");
    expect(buildAuthLoginUrl("/")).toBe("/rooms");
    expect(buildAuthLoginUrl("//example.com")).toBe("/rooms");
  });

  test("production disables development login and opens the email sign-in page", () => {
    vi.stubEnv("VITE_AUTH_MODE", "local");
    vi.stubEnv("DEV", false);
    expect(buildAuthLoginUrl("/rooms")).toBe("/login?redirectUrl=%2Frooms");
    expect(getLoginLabel()).toBe("登录");
  });

  test("QQ uses the same provider for full-page and iframe login and preserves the room", () => {
    vi.stubEnv("VITE_AUTH_MODE", "qq");
    for (const url of [buildOAuthLoginUrl("qq", "/game/ABC?invite=1"), AuthApi.getLoginUrl("iframe", "/game/ABC?invite=1")]) {
      const parsed = new URL(url, window.location.origin);
      expect(parsed.pathname).toBe("/auth/login");
      expect(parsed.searchParams.get("provider")).toBe("qq");
      expect(parsed.searchParams.get("redirectUrl")).toBe("/game/ABC?invite=1");
      expect(parsed.searchParams.get("frontendOrigin")).toBe(window.location.origin);
    }
    expect(getLoginLabel()).toBe("登录");
  });

  test("QQ binding uses an authenticated same-origin POST and sanitizes the return path", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ data: { status: 200, data: { authorizationUrl: "https://graph.qq.com/oauth2.0/authorize?state=test" } } });
    await expect(AuthApi.linkQq("//evil.test/")).resolves.toMatch(/^https:\/\/graph.qq.com/);
    expect(post).toHaveBeenCalledWith("/api/auth/qq/link", { redirectUrl: "/" }, { baseURL: window.location.origin });
    post.mockResolvedValue({ data: { status: 503, message: "QQ 绑定暂不可用" } });
    await expect(AuthApi.linkQq("/rooms")).rejects.toThrow("QQ 绑定暂不可用");
  });

  test("migrates the legacy token once and removes the legacy key", () => {
    localStorage.setItem("token", "legacy-token");
    expect(migrateLegacyAuthToken()).toBe("legacy-token");
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe("legacy-token");
    expect(localStorage.getItem("token")).toBeNull();
  });

  test("transient sessions survive reload without becoming remembered and logout clears both stores", () => {
    localStorage.setItem(AUTH_TOKEN_KEY, "previous-account");
    setAuthToken("temporary-session", false);
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(getAuthToken()).toBe("temporary-session");
    expect(migrateLegacyAuthToken()).toBe("temporary-session");
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    setAuthToken("remembered-session", true);
    expect(sessionStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe("remembered-session");
    clearAuthToken();
    expect(getAuthToken()).toBeNull();
  });

  test("does not overwrite an existing canonical token", () => {
    localStorage.setItem(AUTH_TOKEN_KEY, "canonical-token");
    localStorage.setItem("token", "legacy-token");
    expect(migrateLegacyAuthToken()).toBe("canonical-token");
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBe("canonical-token");
    expect(localStorage.getItem("token")).toBeNull();
  });

  test("accepts root-relative routes and rejects external redirects", () => {
    expect(sanitizeAuthReturnTo("/rooms?query=night#open")).toBe("/rooms?query=night#open");
    expect(sanitizeAuthReturnTo("https://example.com/phishing")).toBe("/");
    expect(sanitizeAuthReturnTo("//example.com/phishing")).toBe("/");
    expect(sanitizeAuthReturnTo("/\\example.com/phishing")).toBe("/");
    expect(sanitizeAuthReturnTo("/a/..//example.com/phishing")).toBe("/");
    expect(sanitizeAuthReturnTo("/rooms?devLogin=1&devIdentity=player&room=ABC")).toBe("/rooms?room=ABC");
  });

  test("defaults to the current route and persists a safe return target", () => {
    const loginUrl = buildAuthLoginUrl();
    saveAuthReturnTo("/rooms?query=night#open");
    expect(loginUrl).toMatch(/^\/login\?/);
    expect(loginUrl).toContain("redirectUrl=%2Frooms%3Fquery%3Dnight%23open");
    expect(localStorage.getItem(AUTH_RETURN_TO_KEY)).toBe("/rooms?query=night#open");
  });

  test("clears local identity but reports an unconfirmed server logout", async () => {
    localStorage.setItem(AUTH_TOKEN_KEY, "current-token");
    const user = useUserStore();
    user.setCurrentUser({ id: "current-user", displayName: "Current user" });
    vi.spyOn(AuthApi, "logout").mockRejectedValue(new Error("Network unavailable"));
    await expect(AuthHelper.logout()).rejects.toThrow("Network unavailable");
    expect(localStorage.getItem(AUTH_TOKEN_KEY)).toBeNull();
    expect(user.current).toBeNull();
  });

  test("treats an already expired session as logged out", async () => {
    localStorage.setItem(AUTH_TOKEN_KEY, "expired-token");
    vi.spyOn(AuthApi, "logout").mockRejectedValue({ response: { status: 401 } });
    await expect(AuthHelper.logout()).resolves.toBeNull();
    expect(AuthHelper.token).toBeNull();
  });

  test("an older failed profile request cannot clear a newly logged-in user", async () => {
    let rejectProfile;
    vi.spyOn(UserApi, "getMe").mockImplementation(() => new Promise((_, reject) => { rejectProfile = reject; }));
    AuthHelper.token = "old-token";
    const user = useUserStore();
    const pending = user.refreshCurrentUserInfo();
    AuthHelper.token = "new-token";
    user.setCurrentUser({ id: "new-user", displayName: "New user" });
    rejectProfile({ response: { status: 401 } });
    await pending;
    expect(AuthHelper.token).toBe("new-token");
    expect(user.current.id).toBe("new-user");
  });

  test("clears expired login on reload without silently switching to a development account", async () => {
    AuthHelper.token = "expired-token";
    vi.spyOn(UserApi, "getMe").mockRejectedValue({ response: { status: 401 } });
    const devLogin = vi.spyOn(AuthApi, "devLogin");
    await useUserStore().refreshCurrentUserInfo();
    expect(AuthHelper.token).toBeNull();
    expect(useUserStore().isLoggedIn).toBe(false);
    expect(devLogin).not.toHaveBeenCalled();
  });
});

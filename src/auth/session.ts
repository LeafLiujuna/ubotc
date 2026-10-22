import { getLoginProvider, isLocalLoginEnabled } from "@/config/env";

export const AUTH_TOKEN_KEY = "ubotc_token";
export const AUTH_RETURN_TO_KEY = "ubotc_return_to";
export const AUTH_LOGIN_KIND_KEY = "ubotc_login_kind";

const LEGACY_TOKEN_KEYS = ["token", "ubotcUserToken"] as const;

function getStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function migrateLegacyAuthToken(): string | null {
  const storage = getStorage();
  if (!storage) return null;

  let token = window.sessionStorage.getItem(AUTH_TOKEN_KEY) || storage.getItem(AUTH_TOKEN_KEY);
  if (!token) {
    for (const key of LEGACY_TOKEN_KEYS) {
      const legacyToken = storage.getItem(key);
      if (legacyToken) {
        token = legacyToken;
        storage.setItem(AUTH_TOKEN_KEY, legacyToken);
        break;
      }
    }
  }

  for (const key of LEGACY_TOKEN_KEYS) {
    storage.removeItem(key);
  }

  return token;
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(AUTH_TOKEN_KEY) || window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string | null, remember = true): void {
  const storage = getStorage();
  if (!storage) return;
  clearAuthToken();
  if (token) {
    (remember ? storage : window.sessionStorage).setItem(AUTH_TOKEN_KEY, token);
  }
}

export function clearAuthToken(): void {
  const storage = getStorage();
  if (!storage) return;

  storage.removeItem(AUTH_TOKEN_KEY);
  window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
  storage.removeItem(AUTH_LOGIN_KIND_KEY);
  for (const key of LEGACY_TOKEN_KEYS) {
    storage.removeItem(key);
  }
}

function currentRelativeUrl(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/** Accept only root-relative, same-origin application routes. */
export function sanitizeAuthReturnTo(returnTo?: string): string {
  const candidate = returnTo ?? currentRelativeUrl();
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    Array.from(candidate).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    return "/";
  }

  if (typeof window === "undefined") return candidate;

  try {
    const url = new URL(candidate, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname.startsWith("//")) return "/";
    url.searchParams.delete("devLogin");
    url.searchParams.delete("devIdentity");
    url.searchParams.delete("authError");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export function saveAuthReturnTo(returnTo: string): void {
  getStorage()?.setItem(AUTH_RETURN_TO_KEY, sanitizeAuthReturnTo(returnTo));
}

export function buildAuthLoginUrl(returnTo?: string): string {
  const safeReturnTo = sanitizeAuthReturnTo(returnTo);
  if (isLocalLoginEnabled()) {
    return safeReturnTo === "/" ? "/rooms" : safeReturnTo;
  }
  return `/login?${new URLSearchParams({ redirectUrl: safeReturnTo }).toString()}`;
}

export function buildOAuthLoginUrl(provider: "qq" | "oidc" = getLoginProvider(), returnTo?: string): string {
  const params = new URLSearchParams({
    callbackMode: "redirect",
    redirectUrl: sanitizeAuthReturnTo(returnTo),
    frontendOrigin: window.location.origin,
    provider,
  });
  return `/auth/login?${params.toString()}`;
}

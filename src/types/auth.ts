import type { ApiResponse as ApiResponse } from "./http";

export type AuthCallbackMode = "redirect" | "iframe";
export type DevLoginIdentity = "host" | "player";

export interface AuthMeData {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  storytellerLevel: number;
  isCertifiedStoryteller: boolean;
}

export interface AuthDevLoginData {
  token: string;
  user: AuthMeData;
}

export interface AuthLogoutData {
  ok: boolean;
  logoutUrl: string | null;
}

export type AuthMeResponse = ApiResponse<AuthMeData>;
export type AuthEmailCodeResponse = ApiResponse<{ challengeId: string; expiresIn: number; retryAfter: number }>;
export type AuthAccountResponse = ApiResponse<{ token: string; redirectUrl: string; provider: "password" }>;
export type EmailCodePurpose = "register" | "reset";
export interface AccountEmailProof { email: string; challengeId: string; code: string }
export interface AccountRegistration extends AccountEmailProof { username: string; displayName: string; password: string }
export type AuthDevLoginResponse = ApiResponse<AuthDevLoginData>;
export type AuthLogoutResponse = ApiResponse<AuthLogoutData>;
export type AuthRefreshTokenResponse = ApiResponse<unknown>;
export type AuthCompleteLoginResponse = ApiResponse<{ token: string; redirectUrl: string; provider?: "qq" | "oidc" }>;

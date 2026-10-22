import { readSettings } from "@/utils/settingsStorage";

export function resolveProfileAvatar(value?: string | null): string {
  if (!value || value === "default.webp" || value.startsWith("builtin:")) return "";
  if (/^(https?:\/\/|data:image\/|blob:|\/)/.test(value)) return value;
  return `https://botcgrimoire.top/avatars/${value}`;
}

export function preferredProfileAvatar(userId: string | null, fallback?: string): string {
  const saved = readSettings(`ts-user-appearance:v1:${userId || "guest"}`, { avatar: "", frame: 0 }).avatar;
  return resolveProfileAvatar(saved) ? saved : fallback || "";
}

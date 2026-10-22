/** 设备设置按默认值白名单和类型恢复；房间状态与登录凭据不进入此缓存。 */
export function readSettings<T extends object>(key: string, defaults: T): T {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    const result = { ...defaults };
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return result;
    for (const field of Object.keys(defaults) as Array<keyof T>) {
      const value = saved[field];
      if (typeof value === typeof defaults[field]
        && (typeof value !== "number" || Number.isFinite(value))) result[field] = value;
    }
    return result;
  } catch { return { ...defaults }; }
}

export function writeSettings(key: string, value: object): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private mode still supports session changes. */ }
}

export const DISPLAY_SETTINGS_KEY = "ts-display-settings:v1";
export const displayDefaults = {
  avatarScale: 100, tokenScale: 100, reminderScale: 145, grimoireOffset: 0,
  colorblindMode: 0, showDecorations: true, showAnimations: true, showCustomImages: true,
  isStatic: false, isMuted: false, isImageOptIn: true, background: "",
  allowTabMove: true, soundVolume: 100,
  showTutorial: true, showEnglishNames: true, reminderStacking: "auto",
  showWakeOrder: false, voteDuration: 600, nominationMode: "normal", allowTextWhispers: true,
  showNightClouds: true, showTeams: true, showTableAvatars: true,
  customCssEnabled: false, customCss: "", hotkeysEnabled: true,
};

export type DisplayPreferences = typeof displayDefaults;

import { watch } from "vue";
import { useAppStore } from "@/stores/app";
import { displayDefaults, DISPLAY_SETTINGS_KEY, writeSettings } from "@/utils/settingsStorage";
import { setAppMotionEnabled } from "@/composables/useMotion";

export function installDisplayPreferences(): void {
  const app = useAppStore();
  const style = document.createElement("style");
  style.id = "ts-custom-settings-css";
  document.head.appendChild(style);
  const preferenceKeys = Object.keys(displayDefaults) as Array<keyof typeof displayDefaults>;
  // 仅持久化设备偏好白名单，不监听整个魔典对象中的临时界面状态。
  watch(() => Object.fromEntries(preferenceKeys.map(key => [key, app.grimoire[key]])), saved => {
    writeSettings(DISPLAY_SETTINGS_KEY, { ...saved, background: saved.background || "" });
  }, { immediate: true });

  // 各副作用只依赖相关设置；拖动尺寸或音量滑块时无需重写 CSS、重新解析样式。
  watch(() => app.grimoire.showAnimations && !app.grimoire.isStatic, enabled => {
    setAppMotionEnabled(enabled);
    document.documentElement.classList.toggle("ts-reduce-motion", !enabled);
  }, { immediate: true });
  watch(() => app.grimoire.customCssEnabled ? app.grimoire.customCss : "", css => {
    style.textContent = css ? `@scope (#townsquare) { ${css} }` : "";
  }, { immediate: true });
}

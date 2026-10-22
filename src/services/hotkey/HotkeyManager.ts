const HotkeySymbolMap = {
  mac: {
    "Control": "⌘",
    "Alt": "⌥",
    "Shift": "⇧",
  },
  default: {
    "Control": "Ctrl",
    "Alt": "Alt",
    "Shift": "Shift",
  },
}

export interface HotkeyInfo {
  /** 热键功能名 */
  name: string;
  /** 帮助信息 */
  helpText?: string;
  /** 显示的热键组合 */
  displayHotkey?: string[];
  /** 场景限制，null为全局热键 */
  scene?: string | null;
  callback: () => void | Promise<void>;
}

export class HotkeyManager {
  private hotkeys: Map<string, HotkeyInfo> = new Map();

  registerHotkey(hotkey: string, hotkeyInfo: HotkeyInfo) {
  }

  removeHotkey(hotkey: string) {
    this.hotkeys.delete(hotkey);
  }

  enterScene(scene: string) {

  }

  exitScene(scene: string) {

  }
}
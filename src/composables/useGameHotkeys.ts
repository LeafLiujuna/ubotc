/**
 * Declarative hotkey table for the game view.
 *
 * `Game.vue` used to hold these bindings as a bare `switch` in its keyup
 * handler, which meant the cheat-sheet overlay would have needed a second,
 * hand-maintained copy of the same list. Moving the table here gives dispatch
 * and the cheat sheet one source of truth, and makes the guard logic testable
 * without a DOM.
 *
 * Order matters: the first entry whose `when(ctx)` passes wins the key. That is
 * how one physical key can mean different things by room type or moment —
 * e.g. `S` skips the current voter while a vote is live, and falls back to the
 * night-order modal otherwise.
 *
 * The table is intentionally free of imports from stores or components: the
 * caller assembles a `HotkeyContext` snapshot per keystroke. Keeping the
 * dependencies inverted this way is what lets the unit test drive every branch
 * with plain objects.
 */

export interface HotkeyActions {
  storytellerAction?(action: string): void;
  playerAction?(action: string): void;
  leaveGame?(): void;
  toggleMenu(): void;
  toggleGrimoire(): void;
  hostSession(): void;
  joinSession(): void;
  returnEveryoneToTown(): void;
  /** Legacy rooms only — flips the local day/night flag. */
  goNightLegacy(): void;
  /** API rooms — the storyteller's confirmed phase-advance flow. */
  goNightApi(): void;
  openModal(name: string): void;
  openRealtimeVote(): void;
  openDayNomination(): void;
  showTownSquare(): void;
  setTimer(): void;
  skipVoter(): void;
  pauseVote(): void;
  resumeVote(): void;
  closeActiveSurface(): void;
  rejectInputDialog(): void;
  toggleCheatSheet(): void;
  closeCheatSheet(): void;
}

export interface HotkeyContext {
  isApiRoom: boolean;
  isSpectator: boolean;
  isDm: boolean;
  /** A realtime vote is currently running (DM vote controls are shown). */
  voteActive: boolean;
  votePaused: boolean;
  hasVoteHistory: boolean;
  inputDialogVisible: boolean;
  cheatSheetOpen: boolean;
  actions: HotkeyActions;
}

/** The subset of KeyboardEvent that dispatch needs; tests pass plain objects. */
export interface HotkeyKeystroke {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey?: boolean;
  /** The user is typing, or the event target is an interactive element. */
  typingGuard: boolean;
}

export interface GameHotkey {
  /** Normalized `event.key.toLowerCase()`. */
  key: string;
  /** What the cheat sheet prints. */
  label: string;
  group: "通用" | "说书人" | "本地房间";
  when(ctx: HotkeyContext): boolean;
  run(ctx: HotkeyContext): void;
  /**
   * Cheat-sheet visibility when it should differ from dispatchability —
   * e.g. `H`/`J` still work in API rooms for legacy reasons but would only
   * confuse the listing there.
   */
  listed?(ctx: HotkeyContext): boolean;
}

export const GAME_HOTKEYS: GameHotkey[] = [
  ...([
    ["1", "添加玩家", "seats"], ["2", "选择剧本", "script"],
    ["3", "阅读游戏规则", "rules"], ["4", "添加 NPC", "npc"],
    ["5", "选择角色", "roles"], ["g", "揭晓 / 隐藏魔典", "reveal"],
  ] as const).map(([key, label, action]): GameHotkey => ({
    key, label, group: "说书人",
    when: ctx => ctx.isApiRoom && ctx.isDm,
    run: ctx => ctx.actions.storytellerAction?.(action),
  })),
  ...([
    ["enter", "请求私聊", "chat"], [" ", "举手 / 放下手", "hand"],
    ["c", "查看角色列表", "roles"], ["u", "查看用户列表", "users"],
    ["q", "打开设置", "settings"], ["f", "切换全屏", "fullscreen"],
    ["l", "离开游戏", "leave"],
  ] as const).map(([key, label, action]): GameHotkey => ({
    key, label, group: "通用",
    when: ctx => ctx.isApiRoom && ctx.isDm,
    run: ctx => action === "leave" ? ctx.actions.leaveGame?.() : ctx.actions.playerAction?.(action),
  })),
  {
    key: "n", label: "前往下一昼夜阶段", group: "说书人",
    when: ctx => ctx.isApiRoom && ctx.isDm,
    run: ctx => ctx.actions.goNightApi(),
  },
  ...([
    ["enter", "请求私聊", "chat"], [" ", "举手 / 放下手", "hand"],
    ["t", "返回城镇广场", "town"], ["c", "查看角色列表", "roles"],
    ["u", "查看用户列表", "users"], ["q", "打开设置", "settings"],
    ["f", "切换全屏", "fullscreen"], ["l", "离开游戏", "leave"],
  ] as const).map(([key, label, action]): GameHotkey => ({
    key, label, group: "通用",
    when: ctx => ctx.isApiRoom && !ctx.isDm,
    run: ctx => action === "leave" ? ctx.actions.leaveGame?.() : ctx.actions.playerAction?.(action),
  })),
  {
    key: "?",
    label: "打开 / 关闭本速查",
    group: "通用",
    when: () => true,
    run: (ctx) => ctx.actions.toggleCheatSheet(),
  },
  {
    key: "escape",
    label: "关闭当前浮层",
    group: "通用",
    when: () => true,
    run: (ctx) => {
      if (ctx.cheatSheetOpen) {
        ctx.actions.closeCheatSheet();
      } else if (ctx.inputDialogVisible) {
        ctx.actions.rejectInputDialog();
      } else {
        ctx.actions.closeActiveSurface();
      }
    },
  },
  {
    key: "m",
    label: "打开 / 关闭菜单",
    group: "通用",
    when: () => true,
    run: (ctx) => ctx.actions.toggleMenu(),
  },
  {
    key: "g",
    label: "公开 / 隐藏魔典",
    group: "通用",
    when: () => true,
    run: (ctx) => ctx.actions.toggleGrimoire(),
  },
  {
    key: "t",
    label: "回到城镇广场视图",
    group: "通用",
    when: () => true,
    run: (ctx) => ctx.actions.showTownSquare(),
  },
  {
    key: "u",
    label: "打开设置",
    group: "通用",
    when: () => true,
    run: (ctx) => ctx.actions.openModal("settings"),
  },
  {
    key: "r",
    label: "召集所有人回到城镇广场",
    group: "说书人",
    when: (ctx) => !ctx.isSpectator,
    run: (ctx) => ctx.actions.returnEveryoneToTown(),
  },

  /* ── One key, several moments ─────────────────────────────────────────── */

  // S: skip the current voter while a vote runs; night order otherwise.
  {
    key: "s",
    label: "跳过当前投票席",
    group: "说书人",
    when: (ctx) => ctx.isApiRoom && ctx.isDm && ctx.voteActive,
    run: (ctx) => ctx.actions.skipVoter(),
  },
  {
    key: "s",
    label: "打开夜间行动顺序",
    group: "说书人",
    when: (ctx) => ctx.isApiRoom && !ctx.isSpectator,
    run: (ctx) => ctx.actions.openModal("nightOrder"),
    listed: () => false, // N already lists this surface
  },
  {
    key: "s",
    label: "切换昼夜（本地）",
    group: "本地房间",
    when: (ctx) => !ctx.isApiRoom && !ctx.isSpectator,
    run: (ctx) => ctx.actions.goNightLegacy(),
    listed: () => false, // N is the listed binding for the same action
  },

  // P: pause/resume the vote countdown while one runs; legacy edition modal.
  {
    key: "p",
    label: "暂停 / 继续投票倒计时",
    group: "说书人",
    when: (ctx) => ctx.isApiRoom && ctx.isDm && ctx.voteActive,
    run: (ctx) =>
      ctx.votePaused ? ctx.actions.resumeVote() : ctx.actions.pauseVote(),
  },
  {
    key: "p",
    label: "选择剧本",
    group: "本地房间",
    when: (ctx) => !ctx.isApiRoom && !ctx.isSpectator,
    run: (ctx) => ctx.actions.openModal("edition"),
  },

  // D: the storyteller's confirmed phase advance; legacy group chat.
  {
    key: "d",
    label: "切换昼夜阶段（弹出确认）",
    group: "说书人",
    when: (ctx) => ctx.isApiRoom && ctx.isDm,
    run: (ctx) => ctx.actions.goNightApi(),
  },
  {
    key: "d",
    label: "打开群聊",
    group: "本地房间",
    when: (ctx) => !ctx.isApiRoom && !ctx.isSpectator,
    run: (ctx) => ctx.actions.openModal("groupChat"),
  },

  // N: night order in API rooms; day/night flip in legacy ones.
  {
    key: "n",
    label: "打开夜间行动顺序",
    group: "说书人",
    when: (ctx) => ctx.isApiRoom && !ctx.isSpectator,
    run: (ctx) => ctx.actions.openModal("nightOrder"),
  },
  {
    key: "n",
    label: "切换昼夜（本地）",
    group: "本地房间",
    when: (ctx) => !ctx.isApiRoom && !ctx.isSpectator,
    run: (ctx) => ctx.actions.goNightLegacy(),
  },

  // V: the live vote surface, or the legacy vote history.
  {
    key: "v",
    label: "打开投票面板",
    group: "通用",
    when: (ctx) => ctx.isApiRoom,
    run: (ctx) => ctx.actions.openRealtimeVote(),
  },
  {
    key: "v",
    label: "查看投票历史",
    group: "本地房间",
    when: (ctx) => !ctx.isApiRoom && (ctx.hasVoteHistory || !ctx.isSpectator),
    run: (ctx) => ctx.actions.openModal("voteHistory"),
  },

  {
    key: "a",
    label: "发起提名",
    group: "说书人",
    when: (ctx) => ctx.isApiRoom && !ctx.isSpectator,
    run: (ctx) => ctx.actions.openDayNomination(),
  },
  {
    key: "o",
    label: "打开夜间行动顺序",
    group: "说书人",
    when: (ctx) => !ctx.isSpectator,
    run: (ctx) => ctx.actions.openModal("nightOrder"),
  },
  {
    key: "z",
    label: "设置计时器",
    group: "说书人",
    when: (ctx) => !ctx.isSpectator,
    run: (ctx) => ctx.actions.setTimer(),
  },
  // H/J only mean anything in a local room. They used to fire everywhere
  // (inherited from the old switch), and in an API room `J` fell through
  // joinSession's "already in a session" branch into leaveSession — a key
  // absent from the cheat sheet popping a "离开/解散" confirm at a player.
  {
    key: "h",
    label: "以说书人身份开局",
    group: "本地房间",
    when: (ctx) => !ctx.isApiRoom,
    run: (ctx) => ctx.actions.hostSession(),
  },
  {
    key: "j",
    label: "加入本地对局",
    group: "本地房间",
    when: (ctx) => !ctx.isApiRoom,
    run: (ctx) => ctx.actions.joinSession(),
  },
  {
    key: "c",
    label: "查看角色列表",
    group: "本地房间",
    when: (ctx) => !ctx.isApiRoom && !ctx.isSpectator,
    run: (ctx) => ctx.actions.openModal("roles"),
  },
  {
    key: "f",
    label: "查看传奇角色",
    group: "本地房间",
    when: (ctx) => !ctx.isApiRoom && !ctx.isSpectator,
    run: (ctx) => ctx.actions.openModal("fabled"),
  },
  {
    key: "enter",
    label: "打开群聊",
    group: "本地房间",
    when: (ctx) => !ctx.isApiRoom && !ctx.isSpectator,
    run: (ctx) => ctx.actions.openModal("groupChat"),
    listed: () => false, // D already lists this surface
  },
];

/**
 * Route one keystroke through the table. Returns true when a binding ran, so
 * the caller knows to `preventDefault()`.
 */
export function dispatchGameHotkey(
  keystroke: HotkeyKeystroke,
  ctx: HotkeyContext,
): boolean {
  if (keystroke.ctrlKey || keystroke.metaKey || keystroke.altKey) return false;

  const key = keystroke.key.toLowerCase();
  // While typing (or focused on a control), only Escape keeps its meaning —
  // anything else would fire hotkeys mid-sentence in the chat box.
  if (keystroke.typingGuard && key !== "escape") return false;

  const hotkey = GAME_HOTKEYS.find(
    (entry) => entry.key === key && entry.when(ctx),
  );
  if (!hotkey) return false;
  hotkey.run(ctx);
  return true;
}

export interface CheatSheetEntry {
  key: string;
  label: string;
  group: GameHotkey["group"];
}

/** What the cheat sheet should print for the current room and role. */
export function cheatSheetEntries(ctx: HotkeyContext): CheatSheetEntry[] {
  const seen = new Set<string>();
  const entries: CheatSheetEntry[] = [];
  for (const hotkey of GAME_HOTKEYS) {
    if (!(hotkey.listed ?? hotkey.when)(ctx)) continue;
    // Dispatch gives a key to its first passing entry; the sheet must agree.
    if (seen.has(hotkey.key) || !hotkey.when(ctx)) continue;
    seen.add(hotkey.key);
    entries.push({
      key: hotkey.key === "escape" ? "Esc" : hotkey.key === " " ? "Space" : hotkey.key.toUpperCase(),
      label: hotkey.label,
      group: hotkey.group,
    });
  }
  return entries;
}

/**
 * Phase-transition choreography.
 *
 * A phase change in Blood on the Clocktower is a beat of theatre, not a state
 * flag: the hall goes dark, a banner announces the night, then play resumes.
 * This module owns that beat as an explicit three-stage machine
 * (`enter → hold → exit`) so the overlay component stays a pure renderer and
 * the sequencing has one testable home.
 *
 * Why a machine rather than a `<Transition>`: two phase changes can land within
 * a second of each other (a storyteller clicking through, or a reconnect
 * replaying state). Without a queue the second one either interrupts the first
 * mid-word or is dropped entirely. Here a newer cue supersedes whatever is
 * pending and cuts the current cue's hold short, so the player always ends on
 * the *current* phase and never on a stale one.
 *
 * Timing follows the reference: a settled entrance on a decelerating curve, a
 * ~1.7s hold that is long enough to read a four-character title without
 * stalling play, then a fade upward. Reduced-motion collapses the two motion
 * stages to zero and keeps a shortened hold, so the announcement is still
 * *made* — it simply appears and disappears instead of sliding.
 */
import { useDemoStore } from '@/stores/demo';
import { computed, ref, watch, onBeforeUnmount, type ComputedRef } from "vue";
import { motionEnabled } from "@/composables/useMotion";
import { playChime, type ChimeVoice } from "@/utils/chime";
import { useAppStore } from "@/stores/app";
import { useGameStore } from "@/stores/game";
import { useSessionStore } from "@/stores/session";

export type PhaseCueKind = "night" | "day" | "final" | "return";

export interface PhaseCue {
  /** Monotonic id; doubles as the overlay's `:key` so a superseding cue remounts. */
  id: number;
  kind: PhaseCueKind;
  /** Latin small-caps line above the title, e.g. `NIGHT 1`. */
  eyebrow: string;
  /** The headline, in Chinese, e.g. `第一夜`. */
  title: string;
  /** One quiet line of flavour beneath the rule. */
  subtitle: string;
  /** Optional Latin word under the banner, e.g. `TOWN SQUARE`. */
  footer?: string;
  /** Whether the hall itself should jolt as the cue lands. */
  shake: boolean;
  chime: ChimeVoice;
}

export type PhaseStage = "idle" | "enter" | "hold" | "exit";

/** Stage durations in ms when motion is allowed. */
export const PHASE_TIMING = {
  enter: 640,
  hold: 1700,
  exit: 520,
} as const;

/** Reduced-motion durations: no travel, a shortened but still readable hold. */
export const PHASE_TIMING_REDUCED = {
  enter: 0,
  hold: 1100,
  exit: 0,
} as const;

/**
 * A burst of phase changes this soon after (re)connecting is state catch-up,
 * not gameplay — announcing it would greet every reconnecting player with a
 * banner for a night that started ten minutes ago.
 */
export const PHASE_PRIME_GRACE_MS = 900;

const CN_DIGITS = "零一二三四五六七八九";

/** 1–99 as Chinese numerals; anything else falls back to digits. */
export const cnNumeral = (value: number): string => {
  if (!Number.isInteger(value) || value < 1 || value > 99) return String(value);
  if (value < 10) return CN_DIGITS[value];
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  const tensPart = tens === 1 ? "十" : `${CN_DIGITS[tens]}十`;
  return ones === 0 ? tensPart : `${tensPart}${CN_DIGITS[ones]}`;
};

let nextCueId = 1;

const makeCue = (cue: Omit<PhaseCue, "id">): PhaseCue => ({ id: nextCueId++, ...cue });

export const buildNightCue = (night: number | null): PhaseCue =>
  makeCue({
    kind: "night",
    eyebrow: night ? `NIGHT ${night}` : "NIGHTFALL",
    title: night ? `第${cnNumeral(night)}夜` : "夜幕降临",
    subtitle: "闭上眼睛，钟楼开始低语。",
    shake: false,
    chime: "night",
  });

export const buildDayCue = (day: number | null): PhaseCue =>
  makeCue({
    kind: "day",
    eyebrow: day ? `DAY ${day}` : "DAYBREAK",
    title: day ? `第${cnNumeral(day)}天` : "天亮了",
    subtitle: "睁开眼睛，请所有人回到广场。",
    footer: "TOWN SQUARE",
    shake: false,
    chime: "day",
  });

export const buildFinalCue = (): PhaseCue =>
  makeCue({
    kind: "final",
    eyebrow: "FINAL JUDGEMENT",
    title: "终局",
    subtitle: "钟声落定，真相自此揭晓。",
    shake: true,
    chime: "toll",
  });

export const buildReturnCue = (): PhaseCue =>
  makeCue({
    kind: "return",
    eyebrow: "RETURN TO TOWN SQUARE",
    title: "回到城镇广场",
    subtitle: "说书人召集了所有人。",
    shake: true,
    chime: "double",
  });

interface PhaseTransitionMachine {
  cue: ComputedRef<PhaseCue | null>;
  stage: ComputedRef<PhaseStage>;
  /** True while the overlay should swallow pointer input. */
  inputLocked: ComputedRef<boolean>;
  /** True for the handful of frames the hall should jolt. */
  shaking: ComputedRef<boolean>;
  announce: (cue: PhaseCue) => void;
  /** Cut the current cue short — bound to a click on the overlay. */
  skip: () => void;
  /** Tear everything down immediately, e.g. when leaving the room. */
  reset: () => void;
}

const cue = ref<PhaseCue | null>(null);
const stage = ref<PhaseStage>("idle");
const lockable = ref(false);
const pending = ref<PhaseCue | null>(null);

let timer: ReturnType<typeof setTimeout> | null = null;

const clearTimer = (): void => {
  if (timer === null) return;
  clearTimeout(timer);
  timer = null;
};

const after = (ms: number, run: () => void): void => {
  clearTimer();
  timer = setTimeout(() => {
    timer = null;
    run();
  }, ms);
};

const timing = (): typeof PHASE_TIMING | typeof PHASE_TIMING_REDUCED =>
  motionEnabled.value ? PHASE_TIMING : PHASE_TIMING_REDUCED;

/**
 * A cue must never trap a player behind a modal. `tsModalLockCount` is the
 * body-level counter `Modal.vue` maintains; when anything is open we still show
 * the banner but leave it click-through, because the dialog owns the pointer.
 */
const modalIsOpen = (): boolean =>
  typeof document !== "undefined" && Boolean(document.body?.dataset?.tsModalLockCount);

const finish = (): void => {
  clearTimer();
  cue.value = null;
  stage.value = "idle";
  lockable.value = false;

  const next = pending.value;
  if (!next) return;
  pending.value = null;
  start(next);
};

const toExit = (): void => {
  if (stage.value === "idle" || stage.value === "exit") return;
  stage.value = "exit";
  after(timing().exit, finish);
};

const toHold = (): void => {
  if (stage.value !== "enter") return;
  stage.value = "hold";
  after(timing().hold, toExit);
};

function start(next: PhaseCue): void {
  cue.value = next;
  stage.value = "enter";
  lockable.value = !modalIsOpen();
  playChime(next.chime, { muted: useAppStore().grimoire.isMuted, volume: useAppStore().grimoire.soundVolume });
  after(timing().enter, toHold);
}

const announce = (next: PhaseCue): void => {
  if (stage.value === "idle") {
    pending.value = null;
    start(next);
    return;
  }
  // Something is already on screen. Queue the newer cue (replacing any earlier
  // queued one — only the latest phase matters) and hurry the current one off.
  pending.value = next;
  toExit();
};

const skip = (): void => {
  if (stage.value === "idle") return;
  if (stage.value === "exit") {
    finish();
    return;
  }
  toExit();
};

const reset = (): void => {
  clearTimer();
  pending.value = null;
  cue.value = null;
  stage.value = "idle";
  lockable.value = false;
};

const machine: PhaseTransitionMachine = {
  cue: computed(() => cue.value),
  stage: computed(() => stage.value),
  inputLocked: computed(() => stage.value !== "idle" && lockable.value),
  shaking: computed(() => stage.value === "enter" && Boolean(cue.value?.shake)),
  announce,
  skip,
  reset,
};

/** The shared machine. Safe to call from any component; there is only one hall. */
export const usePhaseTransition = (): PhaseTransitionMachine => machine;

/**
 * Wire the machine to the authoritative phase state.
 *
 * Two sources, never both: API rooms take `gameStore.level` / `levelDays`
 * (the server's word), legacy peer-to-peer rooms take `grimoire.isNight`
 * (the storyteller's local toggle, which has no day counter).
 *
 * Call once, from the room view's `setup()`.
 */
export const usePhaseTransitionSource = (): void => {
  const appStore = useAppStore();
  const gameStore = useGameStore();
  const sessionStore = useSessionStore();
  const demo = useDemoStore();
  const level = computed(() => demo.active ? demo.level : gameStore.level);
  const levelDays = computed(() => demo.active ? demo.levelDays : gameStore.levelDays);

  const isApiRoom = computed(() =>
    demo.active || Boolean(sessionStore.sessionId && sessionStore.gameServerId),
  );

  // `primedKey === null` means "we have not seen a phase yet"; the first value
  // observed only establishes the baseline. `primedAt` then opens a short grace
  // window during which further changes are treated as catch-up.
  let primedKey: string | null = null;
  let primedAt = 0;

  const prime = (key: string | null): void => {
    primedKey = key;
    primedAt = Date.now();
  };

  /**
   * @returns true when this change is a real, in-session transition worth
   *   announcing (as opposed to the first read, a no-op, or reconnect replay).
   */
  const shouldAnnounce = (key: string): boolean => {
    if (primedKey === null) {
      prime(key);
      return false;
    }
    if (primedKey === key) return false;
    const settled = Date.now() - primedAt >= PHASE_PRIME_GRACE_MS;
    prime(key);
    return settled;
  };

  // Registration order matters: Vue flushes watchers in creation order, so both
  // re-priming watchers must run *before* the phase watchers see the new value.
  // A different room, or the handover from the legacy source to the server's,
  // is a different hall — forget the baseline so the first read re-primes
  // instead of announcing a night that started before this client arrived.
  watch(
    () => sessionStore.sessionId,
    () => {
      prime(null);
      machine.reset();
    },
  );

  watch(isApiRoom, () => prime(null));

  watch(
    () => (isApiRoom.value ? `${level.value}:${levelDays.value}` : null),
    (key) => {
      if (key === null) return;
      if (!shouldAnnounce(key)) return;

      const days = Math.max(1, Number(levelDays.value) || 1);
      switch (level.value) {
        case "night":
          machine.announce(buildNightCue(days));
          break;
        case "day":
          machine.announce(buildDayCue(days));
          break;
        case "end":
          if (!demo.active && !gameStore.grimoireReveal) machine.announce(buildFinalCue());
          break;
        default:
          // `prepare` is a lobby state, not a phase. No banner.
          break;
      }
    },
    { immediate: true },
  );

  watch(
    () => (isApiRoom.value ? null : appStore.grimoire.isNight),
    (isNight) => {
      if (isNight === null) return;
      if (!shouldAnnounce(`legacy:${isNight}`)) return;
      machine.announce(isNight ? buildNightCue(null) : buildDayCue(null));
    },
    { immediate: true },
  );

  onBeforeUnmount(() => machine.reset());
};

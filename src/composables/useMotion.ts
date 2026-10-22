/**
 * Single gate for JS-driven animation.
 *
 * CSS animations are already collapsed by the global `prefers-reduced-motion`
 * block in `styles/theme.scss`, but Web Animations API calls bypass CSS
 * entirely — so every `animate()` in the app goes through here instead of
 * importing `motion` directly. When motion is disabled the helpers jump to the
 * final value synchronously, which keeps layout identical between the two modes.
 */
import { computed, getCurrentScope, onScopeDispose, ref } from "vue";
import { animate, inView } from "motion";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Playback handle. Derived from `animate` because `motion` does not re-export the type. */
export type MotionPlayback = ReturnType<typeof animate>;

const motionEnabledRef = ref(true);

// jsdom only has matchMedia when a test stubs it, and SSR has no window at all —
// default to "motion allowed" so component logic stays on a single code path.
if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  motionEnabledRef.value = !query.matches;
  const onChange = (event: MediaQueryListEvent): void => {
    motionEnabledRef.value = !event.matches;
  };
  if (typeof query.addEventListener === "function") {
    query.addEventListener("change", onChange);
  } else if (typeof query.addListener === "function") {
    // Safari < 14 exposes only the deprecated listener API.
    query.addListener(onChange);
  }
}

/** True when animation should actually play. Reactive: honours live OS changes. */
const appMotionEnabled = ref(true);
export function setAppMotionEnabled(enabled: boolean): void { appMotionEnabled.value = enabled; }
export const motionEnabled = computed(() => motionEnabledRef.value && appMotionEnabled.value);

export type AnimationTarget = Element | Element[] | null | undefined;

/** Style values to snap to when motion is disabled. Custom properties allowed. */
export type RestingStyles = Record<string, string | number>;

const toElements = (target: AnimationTarget): Element[] => {
  if (!target) return [];
  return (Array.isArray(target) ? target : [target]).filter(Boolean) as Element[];
};

/** Write final values straight to the element, bypassing animation entirely. */
export const applyResting = (
  target: AnimationTarget,
  resting: RestingStyles,
): void => {
  for (const element of toElements(target)) {
    const style = (element as HTMLElement).style;
    if (!style) continue;
    for (const [property, value] of Object.entries(resting)) {
      style.setProperty(property, typeof value === "number" ? String(value) : value);
    }
  }
};

/**
 * Animate `target`, or snap straight to `resting` when the user asked for
 * reduced motion. Returns the playback handle so callers can pause a countdown;
 * returns `null` when nothing was animated.
 */
export const animateIfAllowed = (
  target: AnimationTarget,
  keyframes: Parameters<typeof animate>[1],
  options?: Parameters<typeof animate>[2],
  resting?: RestingStyles,
): MotionPlayback | null => {
  const elements = toElements(target);
  if (elements.length === 0) return null;

  if (!motionEnabled.value) {
    if (resting) applyResting(elements, resting);
    return null;
  }

  return animate(elements, keyframes, options);
};

/**
 * Reveal a group of elements with a staggered rise once they scroll into view.
 * Returns a stop function; a no-op when motion is disabled, in which case the
 * elements are never hidden in the first place.
 *
 * Delays are computed per element rather than via the library's `stagger()`,
 * whose type declaration is not re-exported by the `motion` entry point.
 */
export const revealOnEnter = (
  target: Element | null | undefined,
  children: Element[],
  options: { delayStep?: number; duration?: number } = {},
): (() => void) => {
  if (!target || children.length === 0) return () => {};
  if (!motionEnabled.value) return () => {};

  const { delayStep = 0.08, duration = 0.32 } = options;

  for (const child of children) {
    (child as HTMLElement).style.opacity = "0";
    (child as HTMLElement).style.transform = "translateY(14px)";
  }

  return inView(
    target,
    () => {
      children.forEach((child, index) => {
        animate(
          child,
          { opacity: [0, 1], transform: ["translateY(14px)", "translateY(0px)"] },
          { duration, delay: index * delayStep, ease: [0.16, 1, 0.3, 1] },
        );
      });
      // Returning nothing means inView will not re-trigger when the element leaves.
      return undefined;
    },
    { amount: 0.2 },
  );
};

/**
 * Run a callback while `target` is on screen. Used by the decorative homepage
 * clock so it stops ticking off-screen.
 *
 * Returns the disposer, which the caller owns: this is typically called from a
 * watcher waiting on a template ref, and watcher callbacks run outside the
 * component's effect scope, so the `onScopeDispose` below only fires when there
 * happens to be an active scope. Do not rely on it alone.
 */
export const observeInView = (
  target: Element | null | undefined,
  onEnter: () => void,
  onLeave?: () => void,
): (() => void) => {
  if (!target) return () => {};
  if (!motionEnabledRef.value) {
    onEnter();
    return () => {};
  }
  const stop = inView(
    target,
    () => {
      onEnter();
      return () => onLeave?.();
    },
    { amount: 0.1 },
  );
  if (getCurrentScope()) onScopeDispose(stop);
  return stop;
};

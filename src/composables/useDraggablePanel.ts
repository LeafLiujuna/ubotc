import { onBeforeUnmount, onMounted, watch, type Ref } from "vue";

/**
 * Draggable HUD panels for the game table.
 *
 * The table's floating surfaces (vote panel, bluffs, fabled, script sidebar,
 * chat) each have a fixed CSS home. This module lets the storyteller drag them
 * out of the way — the anti-occlusion mechanism the fixed layout can't provide
 * when the seat ring fills up. A panel that has never been dragged keeps its
 * stylesheet position; the first drag switches it to an inline left/top and the
 * spot is persisted, so the layout survives reloads.
 *
 * Grab area: the whole `surface` — a panel's header strip or top edge — starts a
 * drag, not just the grip button. A 26px button was a needle to thread with a
 * mouse; a title bar is what every windowing system trained people to aim at.
 * The small `handle` stays as the visible affordance and the keyboard entry
 * point. Interactive descendants of the surface (close, collapse, channel
 * switches) keep their own clicks: pointerdown on them never starts a drag.
 *
 * Deliberate limits:
 * - Drag is desktop/tablet-wide only (`isHudDragViewport`). Below 901px the
 *   panels either join the document flow or use hand-tuned fixed spots with
 *   collapse toggles — dragging there fights scrolling and helps nobody.
 * - The drag core is a plain function (`attachDraggablePanel`) so the Options
 *   API components can attach it imperatively; `useDraggablePanel` is the
 *   script-setup wrapper.
 *
 * Keyboard: the handle is a real button — arrow keys nudge 8px (32px with
 * Shift), Home resets, double-click resets. All positions are clamped so at
 * least a hand-width of panel stays reachable on every edge.
 */

const STORAGE_KEY = "ts-hud-layout:v1";
const RESET_EVENT = "ts-hud-layout-reset";
/** Minimum sliver of panel that must remain inside the viewport. */
const MIN_VISIBLE = 48;
/** Focus band: above the resting overlays (70-78), below tooltips (80). */
const Z_BASE = 72;
const Z_MAX = 79;
/**
 * Pointer travel before a press on the surface counts as a drag. Without it,
 * every click on a header would nudge the panel by a pixel or two and swallow
 * the click; 4px is below the noise floor of a deliberate click and well under
 * an intentional drag.
 */
const DRAG_THRESHOLD = 4;
/** Descendants of the surface that own their clicks and must not start a drag. */
const INTERACTIVE = "button, a, input, select, textarea, [role='button'], [contenteditable='true']";

type PanelSpot = { x: number; y: number };
type LayoutStore = Record<string, PanelSpot>;

let focusZ = Z_BASE;

function loadStore(): LayoutStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LayoutStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveStore(store: LayoutStore): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage full or blocked — dragging still works for the session.
  }
}

export function isHudDragViewport(): boolean {
  return window.matchMedia?.("(min-width: 901px)")?.matches ?? true;
}

function clampSpot(spot: PanelSpot, rect: { width: number; height: number }): PanelSpot {
  const maxX = window.innerWidth - MIN_VISIBLE;
  const minX = MIN_VISIBLE - rect.width;
  const maxY = window.innerHeight - MIN_VISIBLE;
  return {
    x: Math.min(Math.max(spot.x, minX), maxX),
    y: Math.min(Math.max(spot.y, 0), maxY),
  };
}

export function attachDraggablePanel(options: {
  id: string;
  panel: HTMLElement;
  handle: HTMLElement;
  /** Grab area. Defaults to the handle; pass a header to widen it. */
  surface?: HTMLElement;
}): () => void {
  const { id, panel, handle } = options;
  const surface = options.surface ?? handle;
  let hasCustomSpot = false;

  /** Place the panel so its top-left lands at viewport coordinates (x, y). */
  function place(spot: PanelSpot): void {
    const rect = panel.getBoundingClientRect();
    const clamped = clampSpot(spot, rect);
    // Inline left/top are relative to the offset parent; a fixed-position
    // panel has none, so its frame of reference is the viewport itself.
    const parent = panel.offsetParent instanceof HTMLElement
      ? panel.offsetParent.getBoundingClientRect()
      : { left: 0, top: 0 };
    panel.style.left = `${clamped.x - parent.left}px`;
    panel.style.top = `${clamped.y - parent.top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
    hasCustomSpot = true;
  }

  function persist(): void {
    const rect = panel.getBoundingClientRect();
    const store = loadStore();
    store[id] = { x: rect.left, y: rect.top };
    saveStore(store);
  }

  function bringToFront(): void {
    focusZ = focusZ >= Z_MAX ? Z_BASE + 1 : focusZ + 1;
    panel.style.zIndex = String(focusZ);
  }

  function reset(): void {
    const store = loadStore();
    if (store[id]) {
      delete store[id];
      saveStore(store);
    }
    panel.style.left = "";
    panel.style.top = "";
    panel.style.right = "";
    panel.style.bottom = "";
    panel.style.zIndex = "";
    hasCustomSpot = false;
  }

  // Restore a saved spot on attach.
  const saved = loadStore()[id];
  if (saved && isHudDragViewport()) {
    place(saved);
  }

  /**
   * Pending state: pointer is down but hasn't crossed DRAG_THRESHOLD yet.
   * Once we cross the threshold we flip to `dragging = true`, add the CSS
   * class and stop the _next_ click on the surface (so a header click that
   * turns into a drag doesn't also trigger a "maximise" or "open channel").
   */
  let pending = false;
  let dragging = false;
  let suppressNextClick = false;
  let startPointer = { x: 0, y: 0 };
  let startRect = { x: 0, y: 0 };
  let captureTarget: HTMLElement | null = null;

  function onSurfacePointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !isHudDragViewport()) return;
    // Don't grab interactive descendants — only the handle itself and the
    // background of the surface strip are fair game.
    const target = event.target as HTMLElement;
    if (target !== handle && target.closest(INTERACTIVE)) return;
    pending = true;
    startPointer = { x: event.clientX, y: event.clientY };
    const rect = panel.getBoundingClientRect();
    startRect = { x: rect.left, y: rect.top };
    bringToFront();
    captureTarget = target instanceof HTMLElement ? target : null;
    // Capture on the element that received the event so pointermove arrives
    // here even when the pointer leaves the surface before threshold.
    try {
      captureTarget?.setPointerCapture(event.pointerId);
    } catch {
      // jsdom / older engines — window listeners still track.
    }
    // No preventDefault: would suppress synthesized mouse events, killing
    // dblclick reset. CSS handles selection (is-hud-dragging) and touch
    // scrolling (touch-action: none on the surface).
  }

  function onPointerMove(event: PointerEvent): void {
    if (!pending && !dragging) return;
    const dx = event.clientX - startPointer.x;
    const dy = event.clientY - startPointer.y;
    if (!dragging) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      // Threshold crossed — start the actual drag.
      dragging = true;
      pending = false;
      suppressNextClick = true;
      panel.classList.add("is-hud-dragging");
    }
    place({
      x: startRect.x + dx,
      y: startRect.y + dy,
    });
  }

  function onPointerUp(): void {
    if (!pending && !dragging) return;
    const wasDragging = dragging;
    pending = false;
    dragging = false;
    captureTarget = null;
    panel.classList.remove("is-hud-dragging");
    if (wasDragging) persist();
  }

  /** Eat the click that follows a drag-release on the surface. */
  function onSurfaceClick(event: MouseEvent): void {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    event.stopPropagation();
    event.preventDefault();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (!isHudDragViewport()) return;
    const step = event.shiftKey ? 32 : 8;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (event.key === "Home") {
      reset();
      event.preventDefault();
      return;
    }
    const move = moves[event.key];
    if (!move) return;
    const rect = panel.getBoundingClientRect();
    place({ x: rect.left + move[0], y: rect.top + move[1] });
    persist();
    event.preventDefault();
  }

  function onResize(): void {
    if (!hasCustomSpot) return;
    const rect = panel.getBoundingClientRect();
    place({ x: rect.left, y: rect.top });
  }

  function onResetAll(): void {
    reset();
  }

  // Marks the grab area for the cursor and touch-action rules in
  // townsquare-ui.scss. Set from JS so the class can never drift out of sync
  // with which element is actually listening.
  const widened = surface !== handle;
  if (widened) surface.classList.add("ts-drag-surface");

  surface.addEventListener("pointerdown", onSurfacePointerDown);
  // Capture phase: the suppressor has to run before the panel's own header
  // click handler (chat's "maximise on title click") gets the event.
  if (widened) surface.addEventListener("click", onSurfaceClick, true);
  surface.addEventListener("dblclick", reset);
  handle.addEventListener("keydown", onKeydown);
  if (widened) handle.addEventListener("dblclick", reset);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("resize", onResize);
  window.addEventListener(RESET_EVENT, onResetAll);

  return () => {
    if (widened) surface.classList.remove("ts-drag-surface");
    surface.removeEventListener("pointerdown", onSurfacePointerDown);
    if (widened) surface.removeEventListener("click", onSurfaceClick, true);
    surface.removeEventListener("dblclick", reset);
    handle.removeEventListener("keydown", onKeydown);
    if (widened) handle.removeEventListener("dblclick", reset);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    window.removeEventListener("resize", onResize);
    window.removeEventListener(RESET_EVENT, onResetAll);
  };
}

/** Clear every saved spot and snap all live panels back to their CSS homes. */
export function resetAllPanelLayouts(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best effort — live panels are still reset via the event below.
  }
  window.dispatchEvent(new CustomEvent(RESET_EVENT));
}

/** script-setup wrapper: attaches once all refs resolve, detaches on unmount. */
export function useDraggablePanel(
  id: string,
  panel: Ref<HTMLElement | null>,
  handle: Ref<HTMLElement | null>,
  surface?: Ref<HTMLElement | null>,
): void {
  let detach: (() => void) | null = null;

  function tryAttach(): void {
    if (detach || !panel.value || !handle.value) return;
    if (surface && !surface.value) return;
    detach = attachDraggablePanel({
      id,
      panel: panel.value,
      handle: handle.value,
      surface: surface?.value ?? undefined,
    });
  }

  onMounted(tryAttach);
  watch([panel, handle, ...(surface ? [surface] : [])], tryAttach);
  onBeforeUnmount(() => {
    detach?.();
    detach = null;
  });
}

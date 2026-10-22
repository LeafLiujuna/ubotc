// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  attachDraggablePanel,
  isHudDragViewport,
  resetAllPanelLayouts,
} from "@/composables/useDraggablePanel";

const STORAGE_KEY = "ts-hud-layout:v1";

/**
 * jsdom reports zero-size rects, so the panel fakes its own: the rect tracks
 * the inline style the composable writes, starting from a CSS "home" spot —
 * exactly how a real absolutely-positioned panel behaves.
 */
function createPanel(
  home: { left: number; top: number; width: number; height: number },
  options: { withSurface?: boolean } = {},
) {
  const panel = document.createElement("div");
  const handle = document.createElement("button");
  // With a surface, the grip lives inside a header strip — the real layout.
  let surface: HTMLElement | undefined;
  if (options.withSurface) {
    surface = document.createElement("header");
    surface.appendChild(handle);
    panel.appendChild(surface);
  } else {
    panel.appendChild(handle);
  }
  document.body.appendChild(panel);
  panel.getBoundingClientRect = () => {
    const left = panel.style.left === "" ? home.left : Number.parseFloat(panel.style.left);
    const top = panel.style.top === "" ? home.top : Number.parseFloat(panel.style.top);
    return {
      left,
      top,
      width: home.width,
      height: home.height,
      right: left + home.width,
      bottom: top + home.height,
      x: left,
      y: top,
      toJSON: () => ({}),
    } as DOMRect;
  };
  return { panel, handle, surface };
}

function pointer(type: string, x: number, y: number): MouseEvent {
  return new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true });
}

let detachers: Array<() => void> = [];

function attach(options: Parameters<typeof attachDraggablePanel>[0]): void {
  detachers.push(attachDraggablePanel(options));
}

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
});

afterEach(() => {
  detachers.forEach((detach) => detach());
  detachers = [];
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("useDraggablePanel", () => {
  test("wide viewports allow dragging and the guard reads matchMedia", () => {
    expect(isHudDragViewport()).toBe(true);
  });

  test("dragging the handle moves the panel and persists the spot", () => {
    const { panel, handle } = createPanel({ left: 100, top: 80, width: 300, height: 200 });
    attach({ id: "vote", panel, handle });

    handle.dispatchEvent(pointer("pointerdown", 110, 90));
    window.dispatchEvent(pointer("pointermove", 190, 150));
    expect(panel.style.left).toBe("180px");
    expect(panel.style.top).toBe("140px");
    expect(panel.style.right).toBe("auto");
    expect(panel.classList.contains("is-hud-dragging")).toBe(true);

    window.dispatchEvent(pointer("pointerup", 190, 150));
    expect(panel.classList.contains("is-hud-dragging")).toBe(false);
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored.vote).toEqual({ x: 180, y: 140 });
  });

  test("a saved spot is restored on attach, clamped to the viewport", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ bluffs: { x: 5000, y: -50 } }),
    );
    const { panel, handle } = createPanel({ left: 10, top: 700, width: 300, height: 200 });
    attach({ id: "bluffs", panel, handle });

    // At least 48px must stay reachable: x caps at innerWidth-48, y floors at 0.
    expect(panel.style.left).toBe(`${window.innerWidth - 48}px`);
    expect(panel.style.top).toBe("0px");
  });

  test("arrow keys nudge the panel, Shift widens the step, and the spot persists", () => {
    const { panel, handle } = createPanel({ left: 200, top: 100, width: 300, height: 200 });
    attach({ id: "fabled", panel, handle });

    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(panel.style.left).toBe("208px");
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", shiftKey: true }));
    expect(panel.style.top).toBe("132px");
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored.fabled).toEqual({ x: 208, y: 132 });
  });

  test("double-clicking the handle resets the panel to its CSS home", () => {
    const { panel, handle } = createPanel({ left: 100, top: 80, width: 300, height: 200 });
    attach({ id: "chat", panel, handle });

    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    expect(panel.style.left).not.toBe("");

    handle.dispatchEvent(new MouseEvent("dblclick"));
    expect(panel.style.left).toBe("");
    expect(panel.style.top).toBe("");
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored.chat).toBeUndefined();
  });

  test("resetAllPanelLayouts clears storage and snaps live panels home", () => {
    const first = createPanel({ left: 100, top: 80, width: 300, height: 200 });
    const second = createPanel({ left: 400, top: 300, width: 200, height: 150 });
    attach({ id: "vote", panel: first.panel, handle: first.handle });
    attach({ id: "side", panel: second.panel, handle: second.handle });

    first.handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    second.handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    resetAllPanelLayouts();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(first.panel.style.left).toBe("");
    expect(second.panel.style.top).toBe("");
  });

  test("the whole surface drags, not just the grip inside it", () => {
    const { panel, handle, surface } = createPanel(
      { left: 100, top: 80, width: 300, height: 200 },
      { withSurface: true },
    );
    attach({ id: "vote", panel, handle, surface });
    expect(surface!.classList.contains("ts-drag-surface")).toBe(true);

    // Press the strip's own background, well away from the grip button.
    surface!.dispatchEvent(pointer("pointerdown", 260, 92));
    window.dispatchEvent(pointer("pointermove", 300, 132));
    expect(panel.style.left).toBe("140px");
    expect(panel.style.top).toBe("120px");
    window.dispatchEvent(pointer("pointerup", 300, 132));
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored.vote).toEqual({ x: 140, y: 120 });
  });

  test("interactive children of the surface keep their clicks", () => {
    const { panel, handle, surface } = createPanel(
      { left: 100, top: 80, width: 300, height: 200 },
      { withSurface: true },
    );
    const close = document.createElement("button");
    const clicks: string[] = [];
    close.addEventListener("click", () => clicks.push("close"));
    surface!.appendChild(close);
    attach({ id: "chat", panel, handle, surface });

    close.dispatchEvent(pointer("pointerdown", 380, 92));
    window.dispatchEvent(pointer("pointermove", 460, 152));
    window.dispatchEvent(pointer("pointerup", 460, 152));
    // Never started: the panel stayed at its CSS home.
    expect(panel.style.left).toBe("");
    close.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(clicks).toEqual(["close"]);
  });

  test("a press that stays under the threshold is a click, not a drag", () => {
    const { panel, handle, surface } = createPanel(
      { left: 100, top: 80, width: 300, height: 200 },
      { withSurface: true },
    );
    const clicks: string[] = [];
    surface!.addEventListener("click", () => clicks.push("header"));
    attach({ id: "side", panel, handle, surface });

    surface!.dispatchEvent(pointer("pointerdown", 260, 92));
    window.dispatchEvent(pointer("pointermove", 262, 93));
    window.dispatchEvent(pointer("pointerup", 262, 93));
    expect(panel.style.left).toBe("");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    // The header's own handler (chat's "maximise on title click") still fires.
    surface!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(clicks).toEqual(["header"]);
  });

  test("the click that ends a drag is swallowed by the surface", () => {
    const { panel, handle, surface } = createPanel(
      { left: 100, top: 80, width: 300, height: 200 },
      { withSurface: true },
    );
    const clicks: string[] = [];
    surface!.addEventListener("click", () => clicks.push("header"));
    attach({ id: "side", panel, handle, surface });

    surface!.dispatchEvent(pointer("pointerdown", 260, 92));
    window.dispatchEvent(pointer("pointermove", 340, 152));
    window.dispatchEvent(pointer("pointerup", 340, 152));
    expect(panel.style.left).toBe("180px");

    // Dragging a title bar must not also trigger what clicking it does.
    surface!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(clicks).toEqual([]);

    // Only the one click is eaten; the next is a real click again.
    surface!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(clicks).toEqual(["header"]);
  });

  test("narrow viewports ignore drag and keyboard moves", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    const { panel, handle } = createPanel({ left: 100, top: 80, width: 300, height: 200 });
    attach({ id: "vote", panel, handle });

    handle.dispatchEvent(pointer("pointerdown", 110, 90));
    window.dispatchEvent(pointer("pointermove", 190, 150));
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(panel.style.left).toBe("");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

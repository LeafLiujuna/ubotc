import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useTitleNotification } from "../../src/composables/useTitleNotification";

describe("useTitleNotification", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.title = "血染钟楼";
    Object.defineProperty(document, "hidden", { value: false, writable: true, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    document.title = "血染钟楼";
  });

  test("does nothing when the page is visible", () => {
    const { flash } = useTitleNotification();
    flash("轮到你投票了");
    vi.advanceTimersByTime(2000);
    expect(document.title).toBe("血染钟楼");
  });

  test("flashes the title when the page is hidden", () => {
    Object.defineProperty(document, "hidden", { value: true, writable: true });
    const { flash } = useTitleNotification();
    flash("轮到你投票了");

    expect(document.title).toBe("血染钟楼");
    vi.advanceTimersByTime(1200);
    expect(document.title).toBe("🔔 轮到你投票了");
    vi.advanceTimersByTime(1200);
    expect(document.title).toBe("血染钟楼");
    vi.advanceTimersByTime(1200);
    expect(document.title).toBe("🔔 轮到你投票了");
  });

  test("stops flashing when the page becomes visible", () => {
    Object.defineProperty(document, "hidden", { value: true, writable: true });
    const { flash } = useTitleNotification();
    flash("轮到你投票了");

    vi.advanceTimersByTime(1200);
    expect(document.title).toBe("🔔 轮到你投票了");

    Object.defineProperty(document, "hidden", { value: false, writable: true });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(document.title).toBe("血染钟楼");
    vi.advanceTimersByTime(2400);
    expect(document.title).toBe("血染钟楼");
  });

  test("replaces an active flash with a newer one", () => {
    Object.defineProperty(document, "hidden", { value: true, writable: true });
    const { flash } = useTitleNotification();
    flash("轮到你投票了");

    vi.advanceTimersByTime(1200);
    expect(document.title).toBe("🔔 轮到你投票了");

    flash("游戏已结束");
    vi.advanceTimersByTime(1200);
    expect(document.title).toBe("🔔 游戏已结束");
  });

  test("stop() clears the flash and restores the original title", () => {
    Object.defineProperty(document, "hidden", { value: true, writable: true });
    const { flash, stop } = useTitleNotification();
    flash("轮到你投票了");

    vi.advanceTimersByTime(1200);
    expect(document.title).toBe("🔔 轮到你投票了");

    stop();
    expect(document.title).toBe("血染钟楼");
    vi.advanceTimersByTime(2400);
    expect(document.title).toBe("血染钟楼");
  });
});

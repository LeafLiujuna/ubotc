import { onBeforeUnmount } from "vue";

/**
 * Flash the document title to signal an event that needs the player's attention
 * when the page is in a background tab — "轮到你投票了" when your turn starts,
 * "游戏已结束" when the session ends, etc.
 *
 * The flash stops as soon as the user returns to the tab. If the page is already
 * visible when you call `flash()`, nothing happens — visible state doesn't need
 * a title notification.
 *
 * **Usage:**
 * ```ts
 * const { flash, stop } = useTitleNotification();
 * watch(() => realtimeVote.currentVoterUserId, (id) => {
 *   if (id === session.userId) flash("轮到你投票了");
 * });
 * ```
 *
 * Cleanup is automatic on unmount when called inside a component context.
 * Outside components (tests, service workers), call `stop()` manually.
 * Multiple concurrent flashes are replaced by the newest one — the last
 * `flash()` wins.
 */
export function useTitleNotification() {
  let originalTitle = document.title;
  let intervalHandle: number | null = null;
  let visibilityHandler: (() => void) | null = null;

  function stop(): void {
    if (intervalHandle !== null) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
    if (visibilityHandler) {
      document.removeEventListener("visibilitychange", visibilityHandler);
      visibilityHandler = null;
    }
    document.title = originalTitle;
  }

  function flash(message: string): void {
    // Already visible — the user can see the change on the page itself.
    if (!document.hidden) return;

    stop();
    originalTitle = document.title;
    let show = true;

    intervalHandle = window.setInterval(() => {
      document.title = show ? `🔔 ${message}` : originalTitle;
      show = !show;
    }, 1200);

    visibilityHandler = () => {
      if (!document.hidden) stop();
    };
    document.addEventListener("visibilitychange", visibilityHandler);
  }

  // Auto-cleanup only fires when inside a component context; tests and service
  // workers must call stop() manually.
  try {
    onBeforeUnmount(stop);
  } catch {
    // Not in a component; manual cleanup required.
  }

  return { flash, stop };
}

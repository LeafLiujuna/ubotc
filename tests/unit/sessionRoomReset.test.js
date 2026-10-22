import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSessionStore } from "@/stores/session";

describe("session room cleanup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears room state and timers while preserving the local identity", () => {
    const sessionStore = useSessionStore();
    const reject = vi.fn();

    sessionStore.setPlayerId("dev-user");
    sessionStore.setPlayerName("本地开发用户");
    sessionStore.updatePlayerAvatar("avatar.webp");
    sessionStore.setApiRoomSession({ roomId: "ABC123", gameServerId: "server-1" });
    sessionStore.setNomination([0, 1]);
    sessionStore.groupChats.push({ id: "chat-1" });
    sessionStore.setInputRejecter(reject);
    sessionStore.startTimer(30);

    expect(sessionStore.interval).not.toBeNull();

    sessionStore.resetRoomScopedState();

    expect(reject).toHaveBeenCalledWith(null);
    expect(sessionStore.sessionId).toBe("");
    expect(sessionStore.gameServerId).toBe("");
    expect(sessionStore.nomination).toBe(false);
    expect(sessionStore.groupChats).toEqual([]);
    expect(sessionStore.interval).toBeNull();
    expect(sessionStore.playerId).toBe("dev-user");
    expect(sessionStore.playerName).toBe("本地开发用户");
    expect(sessionStore.playerAvatar).toBe("avatar.webp");
  });
});

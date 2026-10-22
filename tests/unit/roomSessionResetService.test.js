import { beforeEach, describe, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { resetRoomSessionState } from "@/services/roomSessionResetService";
import { usePlayersStore } from "@/stores/players";
import { useSessionStore } from "@/stores/session";

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("room session reset service", () => {
  test("clears all room-scoped local state and every queued group chat", () => {
    const playersStore = usePlayersStore();
    const sessionStore = useSessionStore();
    const clearPlayers = vi.spyOn(playersStore, "clear");
    sessionStore.$patch({
      claimedSeat: 2,
      isRoomActive: true,
      isSpectator: true,
      sessionId: "room-12",
      isHostAllowed: true,
      isJoinAllowed: false,
      nomination: [0, 1],
      bootlegger: "自定义规则",
      playerVotes: 3,
      isSecretVote: true,
      isReview: true,
      isChatOpen: true,
      groupChats: [
        { id: "group-1", players: [] },
        { id: "group-2", players: [] },
      ],
      messageQueue: [{ id: 1 }, { id: 2 }],
      isRole: {
        wraith: {
          active: true,
          using: true,
          st: 0,
          player: 0,
          prob: 0.05,
          probMax: 0.1,
        },
      },
    });

    resetRoomSessionState({ deactivateRoom: true });

    expect(sessionStore.claimedSeat).toBe(-1);
    expect(sessionStore.isRoomActive).toBe(false);
    expect(sessionStore.isSpectator).toBe(false);
    expect(sessionStore.sessionId).toBe("");
    expect(sessionStore.isHostAllowed).toBeNull();
    expect(sessionStore.isJoinAllowed).toBeNull();
    expect(sessionStore.nomination).toBe(false);
    expect(clearPlayers).toHaveBeenCalledWith(true);
    expect(sessionStore.bootlegger).toBe("");
    expect(sessionStore.playerVotes).toBe(1);
    expect(sessionStore.isSecretVote).toBe(false);
    expect(sessionStore.isReview).toBe(false);
    expect(sessionStore.isChatOpen).toBe(false);
    expect(sessionStore.groupChats).toEqual([]);
    expect(sessionStore.messageQueue).toEqual([]);
    expect(sessionStore.isRole.wraith.active).toBe(false);
    expect(sessionStore.isRole.wraith.using).toBe(false);
  });

  test("preserves room activity when returning to the lobby", () => {
    const sessionStore = useSessionStore();
    sessionStore.setRoomActive(true);

    resetRoomSessionState();

    expect(sessionStore.isRoomActive).toBe(true);
  });
});

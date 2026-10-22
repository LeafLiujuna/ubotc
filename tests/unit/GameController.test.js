import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useGameController } from "@/controllers/GameController";

const { sockets } = vi.hoisted(() => ({ sockets: [] }));

vi.mock("@/api/socket/game", () => ({
  GameSocket: class MockGameSocket {
    constructor(url, token) {
      this.url = url;
      this.receivedToken = token;
      this.closed = false;
      this.handlers = new Map();
      this.requests = [];
      sockets.push(this);
    }

    on(event, handler) {
      const handlers = this.handlers.get(event) ?? [];
      handlers.push(handler);
      this.handlers.set(event, handlers);
    }

    emit(event, payload) {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(payload);
      }
    }

    close() {
      this.closed = true;
      this.emit("socket:disconnected", "client close");
    }

    request(...args) {
      this.requests.push(args);
      return Promise.resolve({ status: 200 });
    }
  },
}));

describe("GameController", () => {
  beforeEach(() => {
    sockets.length = 0;
    setActivePinia(createPinia());
  });

  test("tracks metadata and the complete transport lifecycle", () => {
    const store = useGameController();

    expect(store.connectionStatus).toBe("idle");
    expect(store.roomId).toBeNull();

    const socket = store.connectToGameServer({
      roomId: "ROOM01",
      gameServerId: "server-1",
      gameServerUrl: "http://127.0.0.1:8086",
      token: "secret-token",
    });

    expect(store.connectionStatus).toBe("connecting");
    expect(store.isConnected).toBe(false);
    expect(store.roomId).toBe("ROOM01");
    expect(store.gameServerId).toBe("server-1");
    expect(store.gameServerUrl).toBe("http://127.0.0.1:8086");
    expect(store).not.toHaveProperty("token");

    socket.emit("socket:connected");
    expect(store.connectionStatus).toBe("connected");
    expect(store.isConnected).toBe(true);

    socket.emit("socket:disconnected", "transport close");
    expect(store.connectionStatus).toBe("disconnected");
    expect(store.isConnected).toBe(false);
    expect(store.disconnectReason).toBe("transport close");

    socket.emit("socket:reconnecting", 2);
    expect(store.connectionStatus).toBe("reconnecting");
    expect(store.reconnectAttempt).toBe(2);

    socket.emit("socket:error", new Error("network unavailable"));
    expect(store.connectionStatus).toBe("error");
    expect(store.errorMessage).toBe("network unavailable");

    socket.emit("socket:connected");
    expect(store.connectionStatus).toBe("connected");
    expect(store.errorMessage).toBeNull();
    expect(store.reconnectAttempt).toBe(0);
  });

  test("routes typed game actions through the canonical socket", async () => {
    const store = useGameController();
    const socket = store.connectToGameServer({
      roomId: "ROOM03",
      gameServerId: "server-3",
      gameServerUrl: "http://127.0.0.1:8086",
      token: "secret-token",
    });

    await expect(store.refreshGameState()).rejects.toThrow("Not connected");

    socket.emit("socket:connected");
    await store.refreshGameState();
    await store.enterSeat(4);
    await store.leaveSeat();
    await store.updatePlayer({ userId: "user-1", characterId: "washerwoman" });
    await store.swapPlayers({
      seat1: 2,
      seat1UserId: "user-1",
      seat2: 5,
      seat2UserId: "user-2",
    });
    await store.forceLeaveSeat({ userId: "user-2" });
    await store.kickUser({ userId: "user-3", reason: "由说书人移出房间" });
    await store.changeLevel({ nextLevel: "night" });
    await store.assignRandomCharacters({
      teamPlayerCount: { townsfolk: 5, outsider: 0, minion: 1, demon: 1 },
    });
    await store.updateConfig({
      showWhisperMessageHistory: true,
      messageAutoDismiss: false,
    });
    await store.setFabled({ fabledRoleIds: ["angel"] });
    await store.invitePlayer({ toUserId: "spectator-1" });
    await store.endGame({
      isComplete: true,
      result: "team-win",
      winningTeam: "townsfolk",
    });
    await store.setSeatCount({ seatCount: 10 });
    await store.startVote({ nominatorUserId: "user-1", nomineeUserId: "user-2" });
    await store.submitVote({ vote: "yes" });
    await store.submitVote({ vote: "no" });
    await store.submitVote({ vote: "abstain" });
    await store.finalizeDay({ decision: "execute", nomineeUserId: "user-2" });

    expect(socket.requests).toEqual([
      ["refreshGameState"],
      ["enterSit", { seat: 4 }],
      ["leaveSit"],
      ["dmUpdatePlayer", { userId: "user-1", characterId: "washerwoman" }],
      ["dmSwapPlayer", {
        seat1: 2,
        seat1UserId: "user-1",
        seat2: 5,
        seat2UserId: "user-2",
      }],
      ["dmForceLeaveSit", { userId: "user-2" }],
      ["dmKickUser", { userId: "user-3", reason: "由说书人移出房间" }],
      ["dmChangeLevel", { nextLevel: "night" }],
      ["dmAssignRandomCharacter", {
        teamPlayerCount: { townsfolk: 5, outsider: 0, minion: 1, demon: 1 },
      }],
      ["dmUpdateConfig", {
        showWhisperMessageHistory: true,
        messageAutoDismiss: false,
      }],
      ["dmSetFabled", { fabledRoleIds: ["angel"] }],
      ["dmInvitePlayer", { toUserId: "spectator-1" }],
      ["dmEndGame", {
        isComplete: true,
        result: "team-win",
        winningTeam: "townsfolk",
      }],
      ["dmSetSeatCount", { seatCount: 10 }],
      ["dmStartVote", { nominatorUserId: "user-1", nomineeUserId: "user-2" }],
      ["submitVote", { vote: "yes" }],
      ["submitVote", { vote: "no" }],
      ["submitVote", { vote: "abstain" }],
      ["dmFinalizeDay", { decision: "execute", nomineeUserId: "user-2" }],
    ]);
  });

  test("ignores events emitted by a replaced socket", () => {
    const store = useGameController();
    const first = store.connectToGameServer({
      roomId: "OLD",
      gameServerId: "server-old",
      gameServerUrl: "http://old.example",
      token: "old-token",
    });

    const second = store.connectToGameServer({
      roomId: "NEW",
      gameServerId: "server-new",
      gameServerUrl: "http://new.example",
      token: "new-token",
    });

    expect(first.closed).toBe(true);
    expect(store.connectionStatus).toBe("connecting");
    expect(store.roomId).toBe("NEW");

    first.emit("socket:error", new Error("stale failure"));
    first.emit("socket:connected");
    expect(store.connectionStatus).toBe("connecting");
    expect(store.errorMessage).toBeNull();

    second.emit("socket:connected");
    expect(store.connectionStatus).toBe("connected");
  });

  test("disconnect preserves metadata while reset clears the session", () => {
    const store = useGameController();
    const socket = store.connectToGameServer(
      "http://127.0.0.1:8086",
      "secret-token",
      { roomId: "ROOM02", gameServerId: "server-2" },
    );

    store.disconnect();
    expect(socket.closed).toBe(true);
    expect(store.gameSocket).toBeNull();
    expect(store.connectionStatus).toBe("disconnected");
    expect(store.roomId).toBe("ROOM02");
    expect(store.gameServerId).toBe("server-2");

    socket.emit("socket:connected");
    expect(store.connectionStatus).toBe("disconnected");

    store.reset();
    expect(store.connectionStatus).toBe("idle");
    expect(store.roomId).toBeNull();
    expect(store.gameServerId).toBeNull();
    expect(store.gameServerUrl).toBeNull();
    expect(store.errorMessage).toBeNull();
    expect(store.disconnectReason).toBeNull();
  });
});

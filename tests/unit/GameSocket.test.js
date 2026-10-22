import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GameSocket, SocketRequestError } from "@/api/socket/game";
import { SocketClientEvent, SocketServerEvent } from "@/types/socket";
import { io } from "socket.io-client";
import { resolveBrowserReachableUrl } from "@/config/serverEndpoints";

const socketHarness = vi.hoisted(() => {
  const handlers = new Map();
  const managerHandlers = new Map();

  const socket = {
    on: vi.fn((event, handler) => {
      const eventHandlers = handlers.get(event) ?? [];
      eventHandlers.push(handler);
      handlers.set(event, eventHandlers);
      return socket;
    }),
    emit: vi.fn(),
    disconnect: vi.fn(),
    io: {
      on: vi.fn((event, handler) => {
        const eventHandlers = managerHandlers.get(event) ?? [];
        eventHandlers.push(handler);
        managerHandlers.set(event, eventHandlers);
      }),
    },
  };

  return {
    handlers,
    managerHandlers,
    socket,
    receive(event, ...args) {
      for (const handler of handlers.get(event) ?? []) {
        handler(...args);
      }
    },
  };
});

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => socketHarness.socket),
}));

vi.mock("@/config/serverEndpoints", () => ({
  resolveBrowserReachableUrl: vi.fn((url) => `resolved:${url}`),
}));

vi.mock("@/utils/random", () => ({
  randomString: vi.fn(() => "request-id"),
}));

describe("GameSocket requests", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    socketHarness.handlers.clear();
    socketHarness.managerHandlers.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("forwards independent hand snapshots through the transport whitelist", () => {
    const socket = new GameSocket("http://game.example", "token");
    const listener = vi.fn();
    socket.on(SocketServerEvent.HandSignals, listener);
    socketHarness.receive(SocketServerEvent.HandSignals, { signals: { a: "✋" } });
    expect(listener).toHaveBeenCalledWith({ signals: { a: "✋" } });
    socket.close();
  });

  test("forwards private invitation results from the transport to the voice controller", () => {
    const socket = new GameSocket("http://game.example", "token");
    const listener = vi.fn();
    socket.on(SocketServerEvent.VoiceRoomInviteResult, listener);
    const result = { chatRoomId: 'private', userId: 'b', status: 'rejected' };
    socketHarness.receive(SocketServerEvent.VoiceRoomInviteResult, result);
    expect(listener).toHaveBeenCalledWith(result);
    socket.close();
  });

  test("normalizes loopback game server URLs before connecting", () => {
    const gameSocket = new GameSocket("http://127.0.0.1:8086", "secret-token");

    expect(resolveBrowserReachableUrl).toHaveBeenCalledWith("http://127.0.0.1:8086");
    expect(io).toHaveBeenCalledWith(
      "resolved:http://127.0.0.1:8086",
      expect.objectContaining({ auth: { token: "secret-token" } }),
    );

    gameSocket.close();
  });

  test("resolves successful responses without changing the payload", async () => {
    const gameSocket = new GameSocket("http://game.example", "secret-token");
    const response = {
      status: 200,
      message: "ok",
      data: { seat: 3 },
    };

    const request = gameSocket.request(SocketClientEvent.EnterSit, { seat: 3 });

    expect(socketHarness.socket.emit).toHaveBeenCalledWith(
      SocketClientEvent.EnterSit,
      "request-id",
      { seat: 3 },
    );

    socketHarness.receive(SocketServerEvent.Response, "request-id", response);

    await expect(request).resolves.toBe(response);
  });

  test("rejects a 403 response with structured socket error details", async () => {
    const gameSocket = new GameSocket("http://game.example", "secret-token");
    const response = {
      status: 403,
      message: "只有说书人能使用此功能",
      error: "ERR::DM_PERMISSION_REQUIRED",
      data: { action: "dmUpdatePlayer" },
    };

    const request = gameSocket.request(SocketClientEvent.DMUpdatePlayer, {
      userId: "user-1",
      characterId: "washerwoman",
    });
    const capturedError = request.catch((error) => error);

    socketHarness.receive(SocketServerEvent.Response, "request-id", response);

    const error = await capturedError;
    expect(error).toBeInstanceOf(SocketRequestError);
    expect(error).toMatchObject({
      name: "SocketRequestError",
      status: 403,
      message: response.message,
      error: response.error,
      data: response.data,
    });
  });

  test("forwards the authoritative daily nomination ledger", () => {
    const gameSocket = new GameSocket("http://game.example", "secret-token");
    const listener = vi.fn();
    const payload = {
      levelDays: 1,
      nominations: [],
      highestYesVotes: 0,
      tiedCandidateUserIds: [],
      finalized: false,
      updatedAt: 100,
    };
    gameSocket.on(SocketServerEvent.DayNominationState, listener);

    socketHarness.receive(SocketServerEvent.DayNominationState, payload);

    expect(listener).toHaveBeenCalledWith(payload);
  });

  test("times out after 15 seconds by default", async () => {
    vi.useFakeTimers();
    const gameSocket = new GameSocket("http://game.example", "secret-token");
    let outcome;

    const observedRequest = gameSocket
      .request(SocketClientEvent.RefreshGameState)
      .then(
        (value) => {
          outcome = { status: "resolved", value };
        },
        (error) => {
          outcome = { status: "rejected", error };
        },
      );

    await vi.advanceTimersByTimeAsync(14_999);
    expect(outcome).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    await observedRequest;

    expect(outcome).toMatchObject({
      status: "rejected",
      error: new Error(`Socket request timeout: ${SocketClientEvent.RefreshGameState}`),
    });
  });

  test("honors an explicit timeout override", async () => {
    vi.useFakeTimers();
    const gameSocket = new GameSocket("http://game.example", "secret-token");
    let outcome;

    const observedRequest = gameSocket
      .request(SocketClientEvent.RefreshGameState, { timeout: 25 })
      .then(
        (value) => {
          outcome = { status: "resolved", value };
        },
        (error) => {
          outcome = { status: "rejected", error };
        },
      );

    await vi.advanceTimersByTimeAsync(24);
    expect(outcome).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    await observedRequest;

    expect(outcome).toMatchObject({
      status: "rejected",
      error: new Error(`Socket request timeout: ${SocketClientEvent.RefreshGameState}`),
    });
  });
});

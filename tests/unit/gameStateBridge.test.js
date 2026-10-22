import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { bindGameStateBridge } from "@/services/gameStateBridge";
import { useVoiceController } from "@/controllers/VoiceController";
import { useAppStore } from "@/stores/app";
import { useGameStore } from "@/stores/game";
import { useGameScriptStore } from "@/stores/gameScript";
import { usePlayersStore } from "@/stores/players";
import { useRealtimeVoteStore } from "@/stores/realtimeVote";
import { useRoomChatStore } from "@/stores/roomChat";
import { useRoomNotificationsStore } from "@/stores/roomNotifications";
import { useSessionStore } from "@/stores/session";
import { useUserStore } from "@/stores/user";
import { SocketClientEvent, SocketServerEvent } from "@/types/socket";

class FakeSocket {
  constructor() {
    this.handlers = new Map();
    this.requests = [];
    this.responseMessages = [];
  }

  on(event, handler) {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
  }

  off(event, handler) {
    const handlers = this.handlers.get(event) ?? [];
    this.handlers.set(
      event,
      handlers.filter((candidate) => candidate !== handler),
    );
  }

  emit(event, payload) {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(payload);
    }
  }

  request(event, payload) {
    this.requests.push([event, payload]);
    return Promise.resolve({
      status: 200,
      data: { messages: [...this.responseMessages] },
    });
  }
}

describe("gameStateBridge", () => {
  test('receives personalized storyteller approvals, clears ended applications and detaches on room exit', () => {
    const socket = new FakeSocket(), dispose = bindGameStateBridge(socket), game = useGameStore();
    socket.emit(SocketServerEvent.DMElectionUpdate, { electionId: 'first', applicantUserId: 'user-2', voteCount: 0, requiredVoteCount: 2, hasVoted: false });
    expect(game.dmElection).toMatchObject({ applicantUserId: 'user-2', hasVoted: false });
    socket.emit(SocketServerEvent.DMElectionUpdate, { electionId: 'first', applicantUserId: 'user-2', voteCount: 1, requiredVoteCount: 2, hasVoted: true });
    expect(game.dmElection.hasVoted).toBe(true);
    socket.emit(SocketServerEvent.DMElectionUpdate, { applicantUserId: '', voteCount: 0, requiredVoteCount: 0, hasVoted: false });
    expect(game.dmElection).toBeNull();
    dispose();
    socket.emit(SocketServerEvent.DMElectionUpdate, { applicantUserId: 'old-room' });
    expect(game.dmElection).toBeNull();
  });
  test('renders server-published empty-seat identities for ordinary players and clears them for the next game', () => {
    const socket = new FakeSocket(), dispose = bindGameStateBridge(socket);
    socket.emit(SocketServerEvent.GameState, { level: 'end', seatCount: 2, grimoireReveal: { id: 'reveal', revealedUserIds: ['@seat:1'], resultPublished: false } });
    socket.emit(SocketServerEvent.SeatRoles, { roles: { 1: { characterId: 'chef' } } });
    expect(usePlayersStore().players.map(player => player.role.id)).toEqual(['chef', '']);
    socket.emit(SocketServerEvent.SeatRoles, { roles: {} });
    expect(usePlayersStore().players.map(player => player.role.id)).toEqual(['', '']);
    dispose();
  });
  test('next game clears the old result and ballots while keeping the room, storyteller and seats connected', () => {
    const socket = new FakeSocket(), dispose = bindGameStateBridge(socket);
    const game = useGameStore(), session = useSessionStore(), players = usePlayersStore(), vote = useRealtimeVoteStore();
    const player = { userId: 'user-1', seat: 1, isAlive: false, characterId: 'imp', marks: ['中毒'], buffs: [], ping: 10, connected: true, voteChancesAfterDeath: 0 };
    const state = { level: 'end', levelDays: 2, levelStartFromDaytime: false, seatCount: 1, fabledRoleIds: [] };
    socket.emit(SocketServerEvent.GameState, state);
    socket.emit(SocketServerEvent.PlayerList, { isUpdate: false, players: [player] });
    socket.emit(SocketServerEvent.GameEnd, { result: 'team-win', winningTeam: 'good' });
    session.voteHistory = [{ nominee: '一号' }]; players.bluffs = [{ id: 'chef' }]; vote.isVisible = true;
    socket.emit(SocketServerEvent.GameState, { ...state, level: 'prepare', levelDays: 0, grimoireReveal: null });
    socket.emit(SocketServerEvent.PlayerList, { isUpdate: true, players: [{ ...player, isAlive: true, characterId: '', marks: [], voteChancesAfterDeath: 1 }] });
    expect(session.sessionId).toBe('ROOM01'); expect(session.gameServerId).toBe('server-1');
    expect(game.gameEnd).toBeNull(); expect(game.currentPlayer.userId).toBe('user-1'); expect(game.currentPlayer.seat).toBe(1);
    expect(game.currentPlayer.connected).toBe(true); expect(players.players[0]).toMatchObject({ id: 'user-1', isDead: false, isVoteless: false, role: { id: '' } });
    expect(vote.isVisible).toBe(false); expect(session.voteHistory).toEqual([]); expect(players.bluffs).toEqual([]);
    dispose();
  });
  test('keeps zero and one seat snapshots without inventing placeholder seats', () => {
    const socket = new FakeSocket();
    const dispose = bindGameStateBridge(socket);
    for (const seatCount of [0, 1, 0]) {
      socket.emit(SocketServerEvent.GameState, {
        level: 'prepare', levelDays: 0, levelStartFromDaytime: false,
        seatCount, fabledRoleIds: [],
      });
      socket.emit(SocketServerEvent.PlayerList, { isUpdate: false, players: [] });
      expect(usePlayersStore().players).toHaveLength(seatCount);
    }
    dispose();
  });

  beforeEach(() => {
    setActivePinia(createPinia());
    useUserStore().setCurrentUser({
      id: "user-1",
      displayName: "本地开发用户",
      avatarUrl: "https://example.test/avatar.png",
      level: 1,
      storytellerLevel: 1,
      lastSeenAt: 0,
    });
    useSessionStore().setApiRoomSession({
      roomId: "ROOM01",
      gameServerId: "server-1",
    });
  });

  test('room lifecycle notifications use server data and detach with the room bridge', () => {
    const socket = new FakeSocket();
    const dispose = bindGameStateBridge(socket);
    const notices = useRoomNotificationsStore();
    expect(notices.items[0].message).toContain('ROOM01');
    socket.emit(SocketServerEvent.RoomWillClose, { countdown: 60, reason: '房间空闲' });
    expect(notices.preview).toMatchObject({ tone: 'warning', sticky: true });
    expect(notices.preview.message).toContain('房间空闲');
    socket.emit('socket:disconnected');
    expect(notices.preview.message).toContain('连接已断开');
    socket.emit('socket:connected');
    expect(notices.preview.message).toContain('连接已恢复');
    expect(notices.items.filter(item => item.key === 'room-connection')).toHaveLength(1);
    dispose();
    const count = notices.items.length;
    socket.emit(SocketServerEvent.Error, { message: '旧房间的错误' });
    expect(notices.items).toHaveLength(count);
  });

  test("keeps virtual player names through full snapshots without fetching nonexistent profiles", () => {
    const socket = new FakeSocket();
    const profiles = vi.spyOn(useUserStore(), "getUsersInfo");
    const dispose = bindGameStateBridge(socket);
    const virtual = { userId: "test-player:1", seat: 2, isAlive: true, marks: [], buffs: [],
      connected: true, ping: 0, extras: { isTestPlayer: true, testPlayerName: "测试二号" } };
    for (const isUpdate of [false, true, false]) {
      socket.emit(SocketServerEvent.PlayerList, { isUpdate, players: [virtual] });
      expect(usePlayersStore().players[1]).toMatchObject({ id: virtual.userId, name: "测试二号" });
    }
    expect(profiles).not.toHaveBeenCalled();
    dispose();
  });

  test('projects public death markers, ghost vote consumption and revival for other players and reconnects', () => {
    const socket = new FakeSocket();
    const dispose = bindGameStateBridge(socket);
    const other = { userId: 'user-2', seat: 2, isAlive: false, ghostVoteUsed: false,
      marks: [], buffs: [], notes: '', connected: true, ping: 0 };
    socket.emit(SocketServerEvent.PlayerList, { isUpdate: false, players: [other] });
    const seat = () => usePlayersStore().players[1];
    expect(seat()).toMatchObject({ isDead: true, isVoteless: false, votes: 1 });
    socket.emit(SocketServerEvent.PlayerList, { isUpdate: true, players: [{ ...other, ghostVoteUsed: true }] });
    expect(seat()).toMatchObject({ isDead: true, isVoteless: true, votes: 0 });
    socket.emit(SocketServerEvent.PlayerList, { isUpdate: false, players: [{ ...other, ghostVoteUsed: true }] });
    expect(seat()).toMatchObject({ isDead: true, isVoteless: true, votes: 0 });
    socket.emit(SocketServerEvent.PlayerList, { isUpdate: true, players: [{ ...other, isAlive: true }] });
    expect(seat()).toMatchObject({ isDead: false, isVoteless: false, votes: 1 });
    // Older servers do not provide the public seal; missing private data must
    // not make an unused ghost vote look spent.
    const { ghostVoteUsed: _unused, ...legacy } = other;
    socket.emit(SocketServerEvent.PlayerList, { isUpdate: false, players: [legacy] });
    expect(seat()).toMatchObject({ isDead: true, isVoteless: false, votes: 1 });
    dispose();
  });

  test("syncs hands and voice directory before media is connected and detaches both on leave", () => {
    const socket = new FakeSocket();
    const detach = bindGameStateBridge(socket);
    socket.emit(SocketServerEvent.HandSignals, { signals: { "user-1": "✋" } });
    socket.emit(SocketServerEvent.VoiceRoomOverview, { isUpdate: false, rooms: [{ chatRoomId: "tower", scene: "塔楼", access: "open", users: [] }] });
    expect(useGameStore().handSignals).toEqual({ "user-1": "✋" });
    expect(useVoiceController().roomDirectory.tower.scene).toBe("塔楼");
    expect(useVoiceController().service).toBeNull();
    detach();
    socket.emit(SocketServerEvent.HandSignals, { signals: { other: "✊" } });
    expect(useGameStore().handSignals).toEqual({});
    expect(socket.handlers.get(SocketServerEvent.VoiceRoomOverview)).toHaveLength(0);
  });

  test("projects per-player alignment without changing the shared role definition", () => {
    const socket = new FakeSocket();
    const dispose = bindGameStateBridge(socket);
    const player = { userId: 'user-1', seat: 1, isAlive: true, characterId: 'washerwoman',
      marks: [], buffs: [], notes: '', connected: true, ping: 0 };
    socket.emit(SocketServerEvent.PlayerList, { isUpdate: false, players: [
      { ...player, privateExtras: { alignment: 'evil' } },
      { ...player, userId: 'user-2', seat: 2 },
    ] });
    expect(usePlayersStore().players[0].role.alignment).toBe('evil');
    expect(usePlayersStore().players[1].role.alignment).toBeUndefined();
    expect(useAppStore().rolesJSONbyId.get('washerwoman')?.alignment).toBeUndefined();
    dispose();
  });

  test("projects authoritative room, game and player state into Pinia", () => {
    const socket = new FakeSocket();
    const onRoomClose = vi.fn();
    const dispose = bindGameStateBridge(socket, { onRoomClose });

    socket.emit(SocketServerEvent.RoomMeta, {
      roomTitle: "周末新手局",
      roomTags: [{ tag: "difficulty", detail: "beginner" }],
      dmUserIds: [],
    });
    socket.emit(SocketServerEvent.GameState, {
      level: "night",
      levelDays: 1,
      levelStartFromDaytime: false,
      seatCount: 5,
      fabledRoleIds: ["angel"],
    });
    socket.emit(SocketServerEvent.PlayerList, {
      isUpdate: false,
      players: [
        {
          userId: "user-1",
          seat: 2,
          isAlive: true,
          marks: [],
          buffs: [],
          notes: "",
          characterId: "washerwoman",
          privateBuffs: [],
          hiddenBuffs: [],
          voteChancesAfterDeath: 1,
          ping: 24,
          connected: true,
        },
      ],
    });

    const appStore = useAppStore();
    const gameStore = useGameStore();
    const playersStore = usePlayersStore();
    const sessionStore = useSessionStore();

    expect(gameStore.roomMeta?.roomTitle).toBe("周末新手局");
    expect(gameStore.level).toBe("night");
    expect(gameStore.seatCount).toBe(5);
    expect(gameStore.fabledRoleIds).toEqual(["angel"]);
    expect(playersStore.fabled.map((role) => role.id)).toEqual(["angel"]);
    expect(appStore.grimoire.isNight).toBe(true);
    expect(sessionStore.gameLevel).toBe("night");
    expect(sessionStore.claimedSeat).toBe(1);
    expect(sessionStore.ping).toBe(24);
    expect(sessionStore.playerCount).toBe(1);
    expect(playersStore.players).toHaveLength(5);
    expect(playersStore.players[1]).toMatchObject({
      id: "user-1",
      name: "本地开发用户",
      isDead: false,
    });

    socket.emit(SocketServerEvent.RoomClose, { operator: "system" });
    expect(onRoomClose).toHaveBeenCalledOnce();

    dispose();
    socket.emit(SocketServerEvent.GameState, {
      level: "day",
      levelDays: 2,
      levelStartFromDaytime: true,
      seatCount: 8,
    });
    expect(gameStore.level).toBe("night");
    expect(gameStore.seatCount).toBe(5);
  });

  test("bridges public chat messages and cleanup events", async () => {
    const socket = new FakeSocket();
    bindGameStateBridge(socket);
    socket.emit("socket:connected");
    await Promise.resolve();

    expect(socket.requests).toContainEqual([
      SocketClientEvent.GetMessageHistory,
      { channel: "public" },
    ]);
    expect(socket.requests).toContainEqual([
      SocketClientEvent.RefreshGameState,
      undefined,
    ]);

    const message = {
      messageId: "message-1",
      senderUserId: "user-1",
      content: [{ type: "text", text: "今晚先验谁？" }],
      timestamp: 100,
    };
    socket.emit(SocketServerEvent.PublicMessage, message);
    expect(useSessionStore().publicMessages).toEqual([message]);

    socket.emit(SocketServerEvent.DeleteMessage, {
      channel: "public",
      messageId: "message-1",
    });
    expect(useSessionStore().publicMessages).toEqual([]);

    socket.emit(SocketServerEvent.PublicMessage, message);
    socket.emit(SocketServerEvent.LevelChangeClearMessage, { types: ["public"] });
    expect(useSessionStore().publicMessages).toEqual([]);
  });

  test("reloads and merges public history after a socket reconnect", async () => {
    const socket = new FakeSocket();
    const first = {
      messageId: "message-1",
      senderUserId: "user-1",
      content: [{ type: "text", text: "断线前" }],
      timestamp: 100,
    };
    const duringReconnect = {
      messageId: "message-2",
      senderUserId: "user-2",
      content: [{ type: "text", text: "断线期间" }],
      timestamp: 200,
    };
    socket.responseMessages = [first];
    bindGameStateBridge(socket);
    socket.emit("socket:connected");
    await Promise.resolve();
    expect(useSessionStore().publicMessages.map((message) => message.messageId))
      .toEqual(["message-1"]);

    socket.emit(SocketServerEvent.PublicMessage, duringReconnect);
    socket.responseMessages = [first, duringReconnect];
    socket.emit("socket:connected");
    await Promise.resolve();

    expect(useSessionStore().publicMessages.map((message) => message.messageId))
      .toEqual(["message-1", "message-2"]);
  });

  test("applies storyteller-only night progress and clears stale nights", () => {
    const socket = new FakeSocket();
    bindGameStateBridge(socket);
    const gameStore = useGameStore();

    socket.emit(SocketServerEvent.GameState, {
      level: "night",
      levelDays: 1,
      levelStartFromDaytime: false,
      seatCount: 8,
    });
    socket.emit(SocketServerEvent.NightActionProgress, {
      levelDays: 1,
      completedActionIds: ["character:washerwoman"],
      actionRecords: [{
        actionId: "character:washerwoman",
        targetUserIds: ["player-1", "player-2"],
        result: "展示厨师身份",
      }],
      updatedAt: 100,
    });
    expect(gameStore.nightActionProgress).toEqual({
      levelDays: 1,
      completedActionIds: ["character:washerwoman"],
      actionRecords: [{
        actionId: "character:washerwoman",
        targetUserIds: ["player-1", "player-2"],
        result: "展示厨师身份",
      }],
      updatedAt: 100,
    });

    const resolvedProgress = {
      levelDays: 1,
      completedActionIds: ["character:poisoner"],
      actionRecords: [{
        actionId: "character:poisoner",
        targetUserIds: ["player-2"],
        resolution: {
          effects: [{ targetUserId: "player-2", type: "poisoned" }],
          resolvedAt: 110,
          resolvedByUserId: "dm-1",
        },
      }],
      updatedAt: 120,
    };
    socket.emit(SocketServerEvent.NightActionProgress, resolvedProgress);
    resolvedProgress.actionRecords[0].resolution.effects[0].type = "dead";
    socket.emit(SocketServerEvent.NightActionProgress, {
      levelDays: 1,
      completedActionIds: [],
      actionRecords: [],
      updatedAt: 110,
    });
    expect(gameStore.nightActionProgress).toEqual({
      levelDays: 1,
      completedActionIds: ["character:poisoner"],
      actionRecords: [{
        actionId: "character:poisoner",
        targetUserIds: ["player-2"],
        resolution: {
          effects: [{ targetUserId: "player-2", type: "poisoned" }],
          resolvedAt: 110,
          resolvedByUserId: "dm-1",
        },
      }],
      updatedAt: 120,
    });

    socket.emit(SocketServerEvent.GameState, {
      level: "day",
      levelDays: 1,
      levelStartFromDaytime: false,
      seatCount: 8,
    });
    expect(gameStore.nightActionProgress).toBeNull();

    socket.emit(SocketServerEvent.NightActionProgress, {
      levelDays: 1,
      completedActionIds: ["character:washerwoman"],
      actionRecords: [],
      updatedAt: 200,
    });
    expect(gameStore.nightActionProgress).toBeNull();
  });

  test("forwards room approval requests and completion events", () => {
    const socket = new FakeSocket();
    const onReceiveApply = vi.fn();
    const onApplyDone = vi.fn();
    bindGameStateBridge(socket, { onReceiveApply, onApplyDone });

    const apply = {
      applyId: "apply-1",
      type: "dmInvitePlayer",
      fromUserId: "dm-1",
    };
    socket.emit(SocketServerEvent.ReceiveApply, apply);
    socket.emit(SocketServerEvent.ApplyDone, { applyId: "apply-1" });

    expect(onReceiveApply).toHaveBeenCalledWith(apply);
    expect(onApplyDone).toHaveBeenCalledWith({ applyId: "apply-1" });
  });

  test("keeps the connected room user directory current", () => {
    const socket = new FakeSocket();
    bindGameStateBridge(socket);
    const gameStore = useGameStore();

    socket.emit(SocketServerEvent.UserEnter, {
      userId: "spectator-1",
      displayName: "等待入座",
    });
    expect(gameStore.roomUsers["spectator-1"]?.displayName).toBe("等待入座");

    socket.emit(SocketServerEvent.UserLeave, { userId: "spectator-1" });
    expect(gameStore.roomUsers["spectator-1"]).toBeUndefined();
  });

  test("routes whisper and storyteller messages into private conversations", () => {
    const socket = new FakeSocket();
    bindGameStateBridge(socket);
    const roomChatStore = useRoomChatStore();

    const whisper = {
      messageId: "whisper-1",
      senderUserId: "user-2",
      toUserId: "user-1",
      content: [{ type: "text", text: "quiet" }],
      timestamp: 100,
    };
    socket.emit(SocketServerEvent.WhisperMessage, whisper);
    expect(roomChatStore.getMessages("whisper", "user-2")).toEqual([whisper]);

    const dmMessage = {
      messageId: "dm-1",
      senderUserId: "dm-1",
      isDM: true,
      playerUserId: "user-1",
      channel: "chat",
      content: [{ type: "text", text: "wake" }],
      timestamp: 200,
    };
    socket.emit(SocketServerEvent.DMMessage, dmMessage);
    expect(roomChatStore.getMessages("dm_chat", "user-1")).toEqual([dmMessage]);

    socket.emit(SocketServerEvent.DeleteMessage, {
      channel: "whisper",
      messageId: "whisper-1",
    });
    expect(roomChatStore.getMessages("whisper", "user-2")).toEqual([]);

    socket.emit(SocketServerEvent.LevelChangeClearMessage, { types: ["dm_chat"] });
    expect(roomChatStore.getMessages("dm_chat", "user-1")).toEqual([]);
  });

  test("stores the authoritative game result and clears it when a new round begins", () => {
    const socket = new FakeSocket();
    bindGameStateBridge(socket);
    const gameStore = useGameStore();
    const voteStore = useRealtimeVoteStore();

    voteStore.startVote({
      nominationId: "nomination-1",
      nominatorUserId: "user-1",
      nomineeUserId: "user-2",
      requiredVotes: 2,
      canVote: true,
    });
    socket.emit(SocketServerEvent.GameEnd, {
      result: "team-win",
      winningTeam: "townsfolk",
      winningPlayerIds: ["user-1"],
      isIncomplete: false,
    });

    expect(gameStore.gameEnd).toEqual({
      result: "team-win",
      winningTeam: "townsfolk",
      winningPlayerIds: ["user-1"],
      isIncomplete: false,
    });
    expect(voteStore.phase).toBe("idle");

    socket.emit(SocketServerEvent.GameState, {
      level: "prepare",
      levelDays: 0,
      levelStartFromDaytime: false,
      seatCount: 8,
    });
    expect(gameStore.gameEnd).toBeNull();
  });

  test("applies game script metadata and custom roles", () => {
    const socket = new FakeSocket();
    bindGameStateBridge(socket);

    socket.emit(SocketServerEvent.GameScript, {
      scriptId: "script-1",
      script: {
        name: "测试剧本",
        author: "Codex",
        characters: [
          {
            id: "custom-role",
            name: "守钟人",
            team: "townsfolk",
            ability: "测试能力",
          },
        ],
        teamPlayerNumTable: {},
      },
    });

    expect(useGameScriptStore().currentGameScriptId).toBe("script-1");
    expect(useGameScriptStore().title).toBe("测试剧本");
    expect(useAppStore().edition.name).toBe("测试剧本");
    expect(useAppStore().roles.has("customrole")).toBe(true);
  });

  test("projects the authoritative realtime vote lifecycle and detaches cleanly", () => {
    const socket = new FakeSocket();
    const dispose = bindGameStateBridge(socket);
    const voteStore = useRealtimeVoteStore();

    socket.emit(SocketServerEvent.StartVote, {
      nominationId: "nomination-1",
      nominatorUserId: "user-1",
      nomineeUserId: "user-2",
      requiredVotes: 2,
      canVote: true,
      remainingVotes: 1,
    });

    expect(voteStore).toMatchObject({
      isVisible: true,
      phase: "voting",
      nominationId: "nomination-1",
      initiatorUserId: "user-1",
      nomineeUserId: "user-2",
      requiredVotes: 2,
      canVote: true,
      remainingVotes: 1,
    });

    socket.emit(SocketServerEvent.PlayerVoteStart, {
      userId: "user-1",
      seat: 2,
    });
    expect(voteStore.currentVoterUserId).toBe("user-1");
    expect(voteStore.currentVoterSeat).toBe(2);

    socket.emit(SocketServerEvent.PlayerVoteResult, {
      userId: "user-1",
      seat: 2,
      vote: "yes",
    });
    socket.emit(SocketServerEvent.PlayerVoteResult, {
      userId: "user-3",
      seat: 4,
      vote: "skip",
    });
    expect(voteStore.currentVoterUserId).toBeNull();
    expect(voteStore.currentYesVotes).toBe(1);
    expect(voteStore.processedVotes).toBe(2);
    expect(voteStore.results["user-3"].vote).toBe("skip");

    socket.emit(SocketServerEvent.VoteResult, {
      nominationId: "nomination-1",
      nominatorUserId: "user-1",
      nomineeUserId: "user-2",
      totalVotes: 4,
      yesVotes: 2,
    });
    expect(voteStore.phase).toBe("complete");
    expect(voteStore.totalVotes).toBe(4);
    expect(voteStore.yesVotes).toBe(2);

    socket.emit(SocketServerEvent.DayNominationState, {
      levelDays: 2,
      nominations: [{
        nominationId: "nomination-1",
        levelDays: 2,
        nominatorUserId: "user-1",
        nomineeUserId: "user-2",
        requiredVotes: 2,
        totalVotes: 4,
        yesVotes: 2,
        status: "on-block",
        startedAt: 100,
        completedAt: 200,
      }],
      highestYesVotes: 2,
      executionCandidateUserId: "user-2",
      tiedCandidateUserIds: [],
      finalized: false,
      updatedAt: 200,
    });
    expect(voteStore.dayNominationState?.executionCandidateUserId).toBe("user-2");

    dispose();
    socket.emit(SocketServerEvent.StartVote, {
      nominationId: "nomination-2",
      nominatorUserId: "user-3",
      nomineeUserId: "user-4",
      requiredVotes: 3,
      canVote: false,
    });
    expect(voteStore.initiatorUserId).toBe("user-1");
    expect(voteStore.nomineeUserId).toBe("user-2");
  });
});

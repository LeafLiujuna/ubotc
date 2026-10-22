import { defineStore } from "pinia";
import type { SessionState } from "../types/store";
import { usePlayersStore } from "./players";

function createState(): SessionState {
  return {
    sessionId: "",
    seatId: null,
    rooms: null,
    isHostAllowed: null,
    hostTimeout: null,
    isJoinAllowed: null,
    joinTimeout: null,
    isRoomActive: false,
    gameServerId: "",
    roomTitle: "",
    gameLevel: "prepare",
    gameLevelDays: 0,
    isSpectator: false,
    isReconnecting: false,
    playerCount: 0,
    ping: 0,
    playerId: "",
    playerName: "",
    playerAvatar: "default.webp",
    claimedSeat: -1,
    nomination: false,
    playerVotes: 1,
    isRole: {
      wraith: {
        active: false,
        using: false,
        st: 0,
        player: 0,
        prob: 0.05,
        probMax: 0.1,
      },
    },
    votes: [],
    lockedVote: 0,
    votingSpeed: 500,
    isVoteInProgress: false,
    isSecretVote: false,
    voteHistory: [],
    voteSelected: [],
    markedPlayer: -1,
    isVoteHistoryAllowed: true,
    isRolesDistributed: false,
    roleAssignmentSnapshot: [],
    isTypesDistributed: false,
    isBluffsDistributed: false,
    isGrimoireDistributed: false,
    isUseOldOrder: {
      pithag: false,
      professor: false,
    },
    isUseOldRole: {
      balloonist: false,
      acrobat: false,
      lilmonsta: false,
      alchemist: false,
      lycanthrope: false,
    },
    isReview: false,
    isChatOpen: false,
    isTyping: false,
    messageQueue: [],
    messageUniqueQueue: [],
    chatHistory: [],
    publicMessages: [],
    newStMessage: [0],
    groupChats: [],
    inputType: "",
    inputModal: "",
    inputData: {},
    inputResolver: null,
    inputRejecter: null,
    bootlegger: "",
    timer: 480,
    startTime: null,
    lastUpdateTime: null,
    interval: null,
    isTalking: false,
    listeningFrame: null,
    seatStates: {},
    speakingPermissions: {
      enabled: true,
      onlyAlive: true,
      cooldown: 0,
      lastSpeakTime: 0,
    },
  };
}

function chatIndex(state: SessionState, playerId: string): number {
  for (let i = 0; i < state.chatHistory.length; i += 1) {
    if ((state.chatHistory[i] as { id: string }).id === playerId) {
      return i;
    }
  }
  return -1;
}

export const useSessionStore = defineStore("session", {
  state: createState,
  actions: {
    hydrateFromVuex(nextState: Partial<SessionState>): void {
      Object.assign(this, nextState);
    },
    setIsJoinAllowed(val: boolean | null): void {
      this.isJoinAllowed = val;
    },
    setIsHostAllowed(val: boolean | null): void {
      this.isHostAllowed = val;
    },
    setRoomActive(val: boolean): void {
      this.isRoomActive = val;
    },
    setPlayerId(val: string): void {
      this.playerId = val;
    },
    setStId(val: string | null): void {
      this.seatId = val;
    },
    setSpectator(val: boolean): void {
      this.isSpectator = val;
    },
    setReconnecting(val: boolean): void {
      this.isReconnecting = val;
    },
    setPlayerCount(val: number): void {
      this.playerCount = val;
    },
    setPing(val: number): void {
      this.ping = val;
    },
    setPlayerVotes(val: number): void {
      this.playerVotes = val;
    },
    setVotingSpeed(val: number): void {
      this.votingSpeed = val;
    },
    setVoteInProgress(val: boolean): void {
      this.isVoteInProgress = val;
    },
    setMarkedPlayer(payload: { val: number; force?: boolean }): void {
      if (!payload.force && this.isSecretVote && payload.val >= 0) return;
      this.markedPlayer = payload.val;
    },
    setNomination(val: unknown): void {
      this.nomination = val;
    },
    setVoteHistoryAllowed(val: boolean): void {
      this.isVoteHistoryAllowed = val;
    },
    setListeningFrame(val: unknown): void {
      this.listeningFrame = val;
    },
    setChatOpen(val: boolean): void {
      this.isChatOpen = val;
    },
    setTyping(val: boolean): void {
      this.isTyping = val;
    },
    setInputType(val: string): void {
      this.inputType = val;
    },
    setInputModal(val: string): void {
      this.inputModal = val;
    },
    setInputData(val: Record<string, unknown>): void {
      this.inputData = val;
    },
    setSecretVote(val: boolean): void {
      this.isSecretVote = val;
    },
    setBootlegger(val: string): void {
      this.bootlegger = val;
    },
    setUseOldOrder(val: Record<string, boolean>): void {
      this.isUseOldOrder = val;
    },
    setUseOldRole(val: Record<string, boolean>): void {
      this.isUseOldRole = val;
    },
    setIsReview(val: boolean): void {
      this.isReview = val;
    },
    setInputResolver(resolver: ((value: unknown) => void) | null): void {
      this.inputResolver = resolver;
    },
    setInputRejecter(rejecter: ((reason?: unknown) => void) | null): void {
      this.inputRejecter = rejecter;
    },
    clearInputHandlers(): void {
      this.inputResolver = null;
      this.inputRejecter = null;
    },
    claimSeat(val: number): void {
      this.claimedSeat = val;
    },
    distributeRoles(val: boolean): void {
      this.isRolesDistributed = val;
    },
    setRoleAssignmentSnapshot(roleIds: string[]): void {
      this.roleAssignmentSnapshot = roleIds.map((roleId) => String(roleId || ""));
    },
    distributeTypes(val: boolean): void {
      this.isTypesDistributed = val;
    },
    distributeBluffs(payload: { val: boolean }): void {
      this.isBluffsDistributed = payload.val;
    },
    distributeGrimoire(payload: { val: boolean }): void {
      this.isGrimoireDistributed = payload.val;
    },
    setSessionId(sessionId: string): void {
      const nextSessionId = sessionId.toLocaleLowerCase().replace(/[^0-9a-z]/g, "").substr(0, 10);
      if (nextSessionId !== this.sessionId) this.roleAssignmentSnapshot = [];
      this.sessionId = nextSessionId;
    },
    setApiRoomSession(payload: { roomId?: string; gameServerId?: string } = {}): void {
      this.sessionId = String(payload.roomId || "")
        .toLocaleUpperCase()
        .replace(/[^0-9A-Z]/g, "")
        .substr(0, 10);
      this.gameServerId = payload.gameServerId || "";
      this.roleAssignmentSnapshot = [];
    },
    setRoomMeta(payload: { roomTitle?: string } = {}): void {
      this.roomTitle = payload.roomTitle || "";
    },
    applyServerGameState(payload: { level: string; levelDays: number }): void {
      this.gameLevel = payload.level;
      this.gameLevelDays = payload.levelDays;
      this.isRoomActive = payload.level !== "end";
    },
    clearApiRoomSession(): void {
      this.sessionId = "";
      this.gameServerId = "";
      this.roomTitle = "";
      this.gameLevel = "prepare";
      this.gameLevelDays = 0;
      this.isRoomActive = false;
      this.isReconnecting = false;
      this.playerCount = 0;
      this.claimedSeat = -1;
      this.roleAssignmentSnapshot = [];
    },
    resetGameRoundState(): void {
      this.stopTimer();
      this.nominationUpdate({});
      this.clearVoteHistory();
      this.markedPlayer = -1;
      this.playerVotes = 1;
      this.isRolesDistributed = false;
      this.roleAssignmentSnapshot = [];
      this.isTypesDistributed = false;
      this.isBluffsDistributed = false;
      this.isGrimoireDistributed = false;
    },
    resetRoomScopedState(): void {
      const identity = {
        playerId: this.playerId,
        playerName: this.playerName,
        playerAvatar: this.playerAvatar,
      };

      this.stopTimer();
      this.inputRejecter?.(null);
      Object.assign(this, createState(), identity);
    },
    setPlayerName(name: string): void {
      this.playerName = name;
    },
    nominationUpdate(payload: {
      nomination?: unknown;
      votes?: unknown[];
      votingSpeed?: number;
      lockedVote?: number;
      isVoteInProgress?: boolean;
      nominatedPlayer?: { role?: { team?: string } };
    }): void {
      this.nomination = payload.nomination || false;
      const votes = payload.votes || [];
      if (
        payload.nomination &&
        payload.nominatedPlayer &&
        this.isSecretVote &&
        payload.nominatedPlayer.role?.team !== "traveler"
      ) {
        for (let i = 0; i < votes.length; i += 1) {
          if (i !== this.claimedSeat) {
            votes[i] = false;
          }
        }
      }
      this.votes = votes;
      this.votingSpeed = payload.votingSpeed || this.votingSpeed;
      this.lockedVote = payload.lockedVote || 0;
      this.isVoteInProgress = payload.isVoteInProgress || false;
    },
    addHistory(players: Array<{ role?: { team?: string }; id?: string; name?: string; isDead?: boolean }>): void {
      if (!this.isVoteHistoryAllowed && this.isSpectator) return;
      if (!this.nomination || this.lockedVote <= players.length) return;

      const nomination = this.nomination as [number, number];
      const isExile = players[nomination[1]].role?.team === "traveler";
      const votedPlayers = Array.from(players).filter((_, index) => this.votes[index]);

      votedPlayers.forEach((player) => {
        (player as Record<string, unknown>).seat = players.indexOf(player) + 1;
        (player as Record<string, unknown>).votes = this.votes[players.indexOf(player)];
      });

      this.addVotes({
        timestamp: new Date(),
        nominator: `${nomination[0] + 1}. ${players[nomination[0]].id ? players[nomination[0]].name : ""}`,
        nominee: `${nomination[1] + 1}. ${players[nomination[1]].id ? players[nomination[1]].name : ""}`,
        type: isExile ? "流放" : "处决",
        mode: this.isSecretVote ? "闭眼" : "睁眼",
        votes: this.votes
          .filter((item) => typeof item === "number")
          .reduce((acc, current) => Number(acc) + Number(current), 0),
        majority: Math.ceil(players.filter((player) => !player.isDead || isExile).length / 2),
        votedPlayers: votedPlayers.map(
          (item) =>
            `${(item as Record<string, unknown>).seat}. ${(item as { name?: string }).name || ""}${
              Number((item as Record<string, unknown>).votes || 0) > 1
                ? ` *${String((item as Record<string, unknown>).votes)}票`
                : ""
            }`,
        ),
        save: true,
      });
    },
    addVotes(payload: {
      timestamp: string | Date;
      nominator: string;
      nominee: string;
      type: string;
      mode: string;
      votes: number;
      majority: number;
      votedPlayers: string[];
      save?: boolean;
    }): void {
      const nextTime = payload.save ? payload.timestamp : new Date(payload.timestamp);
      this.voteHistory.push({
        timestamp: nextTime,
        nominator: payload.nominator,
        nominee: payload.nominee,
        type: payload.type,
        mode: payload.mode,
        votes: payload.votes,
        majority: payload.majority,
        votedPlayers: payload.votedPlayers,
      });
    },
    addVoteSelected(payload: {
      selected: unknown;
      players?: unknown[];
      save?: boolean;
    }): void {
      if (payload.save && !payload.players && !this.isVoteHistoryAllowed && this.isSpectator) {
        return;
      }
      this.voteSelected.push(payload.selected);
    },
    setVoteSelected(payload: { index: number; value: unknown }): void {
      this.voteSelected[payload.index] = payload.value;
    },
    clearVoteHistory(voteIndex: number[] | null = null): void {
      if (!voteIndex || voteIndex.length === 0) {
        this.voteHistory = [];
        this.voteSelected = [];
        return;
      }
      this.voteHistory = this.voteHistory.filter((_, index) => !voteIndex.includes(index));
      this.voteSelected = this.voteSelected.filter((_, index) => !voteIndex.includes(index));
    },
    vote(payload: [number, unknown]): void {
      if (!this.nomination) return;
      this.votes = [...this.votes];
      this.votes[payload[0]] = payload[1] === undefined ? 0 : payload[1];
    },
    voteSync(payload: [number, unknown]): void {
      this.vote(payload);
    },
    lockVote(lock?: number): void {
      this.lockedVote = lock !== undefined ? lock : this.lockedVote + 1;
    },
    createChatHistory(playerId: string): void {
      if (playerId === "") return;
      if (chatIndex(this, playerId) >= 0) return;
      this.chatHistory.push({ id: playerId, chat: [] });
    },
    updateChatReceived(payload: { message: unknown; playerId: string }): void {
      if (this.isSpectator && payload.playerId !== this.seatId) return;
      const playerIndex = chatIndex(this, payload.playerId);
      if (playerIndex < 0) return;
      const oldMessages = (this.chatHistory[playerIndex] as { chat: unknown[] }).chat;
      this.chatHistory[playerIndex] = {
        id: payload.playerId,
        chat: [...oldMessages, payload.message],
      };
    },
    setPublicMessages(messages: SessionState["publicMessages"]): void {
      const byId = new Map(
        messages.map((message) => [message.messageId, message]),
      );
      this.publicMessages = [...byId.values()]
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-100);
    },
    addPublicMessage(message: SessionState["publicMessages"][number]): void {
      this.setPublicMessages([...this.publicMessages, message]);
    },
    removePublicMessage(messageId: string): void {
      this.publicMessages = this.publicMessages.filter(
        (message) => message.messageId !== messageId,
      );
    },
    clearPublicMessages(): void {
      this.publicMessages = [];
    },
    updateChatSent(chatContent: {
      sendingPlayerId: string;
      receivingPlayerId: string;
      [key: string]: unknown;
    }): void {
      if (this.isSpectator && chatContent.sendingPlayerId !== this.playerId) return;
      this.addMessageQueue({
        type: "direct",
        playerId: chatContent.receivingPlayerId,
        command: "chat",
        params: chatContent,
        id: new Date().getTime(),
      });
    },
    addMessageQueue(payload: {
      type: string;
      playerId: string;
      command: string;
      params: unknown;
      id: number;
    }): void {
      this.messageQueue.push(payload);
    },
    deleteMessageQueue(index: number): void {
      if (this.messageQueue.length === 0) return;
      this.messageQueue.splice(index, 1);
    },
    checkUniqueMessage(feedback: string): void {
      const queue = this.messageUniqueQueue as unknown as Record<
        string,
        ReturnType<typeof setTimeout>
      >;
      if (queue[feedback]) {
        clearTimeout(queue[feedback]);
      }
      queue[feedback] = setTimeout(() => {
        delete queue[feedback];
      }, 1000 * 60 * 3);
    },
    setStMessage(num: number): void {
      const nextNum = num > 0 ? this.newStMessage[0] + num : num;
      this.newStMessage[0] = nextNum;
    },
    setPlayerAvatar(): void {
      this.playerAvatar = "";
    },
    updatePlayerAvatar(link: string): void {
      this.playerAvatar = link;
    },
    setIsRole(payload: { role: string; property: string; value: unknown; st?: boolean }): void {
      if (!(this.isRole as Record<string, unknown>)[payload.role]) return;
      if (payload.property === "using" && !payload.st) return;
      ((this.isRole[payload.role] as Record<string, unknown>)[payload.property] as unknown) = payload.value;
    },
    addGroupChat(payload: {
      chatId: string;
      players?: Array<{ id: string }>;
      playerIds?: string[];
      keep?: boolean;
    }): void {
      if (this.groupChats.length >= 20) return;

      const playersStore = usePlayersStore();
      let players = payload.players || [];
      if (payload.playerIds && !payload.players) {
        players = playersStore.players.filter((player) => payload.playerIds?.includes(player.id));
      }

      const groupChats = this.groupChats as Array<{
        id: string;
        name: string;
        keep: boolean;
        players: Array<{ id: string }>;
      }>;

      const groupIndex = groupChats.findIndex((group) => group.id === payload.chatId);
      if (groupIndex !== -1) {
        groupChats[groupIndex].players = [...groupChats[groupIndex].players, ...players];
        players.forEach((player) => {
          const matchedPlayer = playersStore.players.find((item) => item.id === player.id);
          if (matchedPlayer) {
            playersStore.update({ player: matchedPlayer, property: "chatGroup", value: payload.chatId });
          }
        });
        return;
      }

      const pattern = /^群聊(1[0-9]|20|[1-9])$/;
      const names = groupChats.map((group) => group.name);
      const allSuffixes = names
        .filter((name) => pattern.test(name))
        .map((name) => Number(name.replace(/^群聊/, "")));
      const maxIndex = allSuffixes.length > 0 ? Math.max(...allSuffixes) : 0;
      let nextName = `群聊${maxIndex + 1}`;
      if (maxIndex + 1 > 20 || names.includes(nextName)) {
        for (let i = 1; i <= 21; i += 1) {
          if (!allSuffixes.includes(i)) {
            nextName = `群聊${i}`;
            break;
          }
        }
      }

      groupChats.push({
        id: payload.chatId,
        name: names.length === 0 ? "群聊1" : nextName,
        keep: payload.keep === undefined ? false : payload.keep,
        players,
      });

      players.forEach((player) => {
        const matchedPlayer = playersStore.players.find((item) => item.id === player.id);
        if (matchedPlayer) {
          playersStore.update({ player: matchedPlayer, property: "chatGroup", value: payload.chatId });
        }
      });
    },
    removeGroupChat(payload: { chatId: string }): void {
      const groupChats = this.groupChats as Array<{
        id: string;
        players: Array<{ id: string }>;
      }>;
      const playersStore = usePlayersStore();
      const index = groupChats.findIndex((group) => group.id === payload.chatId);
      if (index === -1) return;

      groupChats[index].players.forEach((player) => {
        const matchedPlayer = playersStore.players.find((item) => item.id === player.id);
        if (matchedPlayer) {
          playersStore.update({ player: matchedPlayer, property: "chatGroup", value: "" });
        }
      });
      groupChats.splice(index, 1);
    },
    removeGroupChatMember(payload: {
      chatId: string;
      player?: { id: string };
      playerId?: string;
    }): void {
      const groupChats = this.groupChats as Array<{
        id: string;
        players: Array<{ id: string }>;
      }>;
      const playersStore = usePlayersStore();
      const groupIndex = groupChats.findIndex((group) => group.id === payload.chatId);
      if (groupIndex === -1) return;

      let player = payload.player;
      if (payload.playerId && !player) {
        player = playersStore.players.find((item) => item.id === payload.playerId);
      }
      if (!player) return;

      const playerIndex = groupChats[groupIndex].players.findIndex((item) => item.id === player?.id);
      if (playerIndex === -1) return;

      const matchedPlayer = playersStore.players.find((item) => item.id === player?.id);
      if (matchedPlayer) {
        playersStore.update({ player: matchedPlayer, property: "chatGroup", value: "" });
      }
      groupChats[groupIndex].players.splice(playerIndex, 1);
    },
    toggleGroupKeep(chatId: string): void {
      const groupChats = this.groupChats as Array<{ id: string; keep: boolean }>;
      const index = groupChats.findIndex((group) => group.id === chatId);
      if (index === -1) return;
      groupChats[index].keep = !groupChats[index].keep;
    },
    startTimer(time?: number): void {
      if (time) {
        this.timer = time;
      }
      this.startTime = Date.now();
      this.lastUpdateTime = Date.now();

      this.interval = setInterval(() => {
        const now = Date.now();
        const elapsedSinceLastUpdate = now - (this.lastUpdateTime || now);
        const secondsPassed = elapsedSinceLastUpdate / 1000;

        if (secondsPassed > 0) {
          this.timer -= secondsPassed;
          this.lastUpdateTime = now;
        }

        if (this.timer <= 0) {
          this.timer = 0;
          if (this.interval) {
            clearInterval(this.interval);
          }
        }
      }, 1000);
    },
    stopTimer(): void {
      if (this.interval) {
        clearInterval(this.interval);
      }
      this.interval = null;
    },
    setTalking(payload: { seatNum: number; isTalking: boolean }): void {
      const playersStore = usePlayersStore();
      if (payload.seatNum < 0 || payload.seatNum >= playersStore.players.length) return;
      const player = playersStore.players[payload.seatNum];
      if (!player.id || player.id !== this.playerId) return;
      this.isTalking = payload.isTalking;
      playersStore.setIsTalking(payload);
    },
    updateSeatState(payload: { seatIndex: number; state: unknown }): void {
      this.seatStates[String(payload.seatIndex)] = payload.state;
    },
    clearSeatStates(): void {
      this.seatStates = {};
    },
    setSpeakingPermission(payload: { key: string; value: unknown }): void {
      if (Object.prototype.hasOwnProperty.call(this.speakingPermissions, payload.key)) {
        (this.speakingPermissions as Record<string, unknown>)[payload.key] = payload.value;
      }
    },
    updateLastSpeakTime(time: number): void {
      this.speakingPermissions.lastSpeakTime = time;
    },
    validateSpeakingPermission(payload: { isAlive: boolean }): boolean {
      if (!this.speakingPermissions.enabled) return false;
      if (this.speakingPermissions.onlyAlive && !payload.isAlive) return false;
      const now = Date.now();
      const cooldown = this.speakingPermissions.cooldown * 1000;
      return now - this.speakingPermissions.lastSpeakTime >= cooldown;
    },
    reset(): void {
      this.$reset();
    },
  },
});

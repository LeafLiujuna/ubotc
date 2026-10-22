import { defineStore } from "pinia";
import type {
  ClientSubmitVoteMessage,
  ServerPlayerVoteResultMessage,
  ServerPlayerVoteStartMessage,
  ServerDayNominationStateMessage,
  ServerStartVoteMessage,
  ServerVoteResultMessage,
} from "@/types/socket";

export type RealtimeVotePhase = "idle" | "voting" | "complete";
export type RealtimeVoteSubmissionState = "idle" | "submitting" | "awaiting";

export type RealtimeVotePlayerResult = ServerPlayerVoteResultMessage;

const createRealtimeVoteState = () => ({
  sweepVote: false,
  stage: 'voting' as 'ready' | 'countdown' | 'voting',
  turnDurationMs: null as number | null,
  choices: {} as Record<string, RealtimeVotePlayerResult>,
  syncRevision: 0,
  submissionState: "idle" as RealtimeVoteSubmissionState,
  pendingChoice: null as ClientSubmitVoteMessage["vote"] | null,
  isVisible: false,
  privateVote: false,
  phase: "idle" as RealtimeVotePhase,
  nominationId: null as string | null,
  initiatorUserId: null as string | null,
  nomineeUserId: null as string | null,
  requiredVotes: 0,
  canVote: false,
  remainingVotes: null as number | null,
  currentVoterUserId: null as string | null,
  currentVoterSeat: null as number | null,
  turnIndex: null as number | null,
  totalTurns: null as number | null,
  turnRemainingMs: null as number | null,
  turnReceivedAt: null as number | null,
  paused: false,
  sequenceRevision: null as number | null,
  results: {} as Record<string, RealtimeVotePlayerResult>,
  yesVotes: 0,
  totalVotes: 0,
  dayNominationState: null as ServerDayNominationStateMessage | null,
});

export const useRealtimeVoteStore = defineStore("realtimeVote", {
  state: createRealtimeVoteState,
  getters: {
    isActive: (state): boolean => state.phase === "voting",
    isComplete: (state): boolean => state.phase === "complete",
    processedVotes: (state): number => Object.keys(state.results).length,
    currentYesVotes: (state): number => Object.values(state.results)
      .filter((result) => result.vote === "yes").length,
    canHide: (state): boolean => state.submissionState === "idle",
  },
  actions: {
    startVote(payload: ServerStartVoteMessage): void {
      const syncRevision = this.syncRevision + 1;
      const dayNominationState = this.dayNominationState;
      Object.assign(this, createRealtimeVoteState(), {
        syncRevision,
        isVisible: true,
        phase: "voting" as RealtimeVotePhase,
        sweepVote: payload.sweepVote ?? false,
        stage: payload.stage ?? 'voting',
        turnDurationMs: payload.turnDurationMs ?? null,
        nominationId: payload.nominationId,
        privateVote: payload.privateVote ?? false,
        initiatorUserId: payload.nominatorUserId,
        nomineeUserId: payload.nomineeUserId,
        requiredVotes: payload.requiredVotes,
        canVote: payload.canVote,
        remainingVotes: payload.remainingVotes ?? null,
        dayNominationState,
      });
    },
    startPlayerTurn(payload: ServerPlayerVoteStartMessage): void {
      if (this.phase !== "voting") return;
      if (payload.sequenceRevision != null && this.sequenceRevision != null
        && payload.sequenceRevision < this.sequenceRevision) return;
      this.stage = payload.stage ?? this.stage;
      this.turnDurationMs = payload.turnDurationMs ?? this.turnDurationMs;
      this.currentVoterUserId = payload.userId;
      this.currentVoterSeat = payload.seat;
      this.turnIndex = payload.turnIndex ?? null;
      this.totalTurns = payload.totalTurns ?? null;
      this.turnRemainingMs = payload.turnRemainingMs ?? null;
      this.turnReceivedAt = payload.turnRemainingMs !== undefined ? Date.now() : null;
      this.paused = payload.paused ?? false;
      this.sequenceRevision = payload.sequenceRevision ?? null;
    },
    recordPlayerVote(payload: ServerPlayerVoteResultMessage): void {
      if (this.phase !== "voting") return;
      if (payload.locked === false) {
        if (!this.results[payload.userId]) this.choices[payload.userId] = { ...payload };
        return;
      }
      delete this.choices[payload.userId];
      this.clearSubmission();
      this.results[payload.userId] = { ...payload };
      if (!this.sweepVote && this.currentVoterUserId === payload.userId) {
        this.currentVoterUserId = null;
        this.currentVoterSeat = null;
        this.turnIndex = null;
        this.totalTurns = null;
        this.turnRemainingMs = null;
        this.turnReceivedAt = null;
        this.paused = false;
        this.sequenceRevision = null;
      }
    },
    completeVote(payload: ServerVoteResultMessage): void {
      this.clearSubmission();
      this.phase = "complete";
      this.isVisible = !payload.dismissed;
      this.nominationId = payload.nominationId;
      this.initiatorUserId = payload.nominatorUserId;
      this.nomineeUserId = payload.nomineeUserId;
      this.currentVoterUserId = null;
      this.currentVoterSeat = null;
      this.turnIndex = null;
      this.totalTurns = null;
      this.turnRemainingMs = null;
      this.turnReceivedAt = null;
      this.paused = false;
      this.sequenceRevision = null;
      this.privateVote = payload.privateVote ?? this.privateVote;
      this.yesVotes = payload.yesVotes ?? 0;
      this.totalVotes = payload.totalVotes ?? 0;
    },
    syncDayNominationState(payload: ServerDayNominationStateMessage): void {
      const isNewDay = this.dayNominationState !== null
        && this.dayNominationState.levelDays !== payload.levelDays;
      if (isNewDay) {
        const syncRevision = this.syncRevision + 1;
        Object.assign(this, createRealtimeVoteState(), { syncRevision });
      }
      this.dayNominationState = {
        ...payload,
        nominations: payload.nominations.map((record) => ({ ...record })),
        tiedCandidateUserIds: [...payload.tiedCandidateUserIds],
      };
    },
    show(): void {
      if (this.phase !== "idle") this.isVisible = true;
    },
    hide(): boolean {
      if (!this.canHide) return false;
      this.isVisible = false;
      return true;
    },
    beginSubmission(choice: ClientSubmitVoteMessage["vote"]): void {
      this.submissionState = "submitting";
      this.pendingChoice = choice;
    },
    markSubmissionAwaiting(): void {
      if (this.submissionState !== "submitting") return;
      this.submissionState = "awaiting";
      this.pendingChoice = null;
    },
    clearSubmission(): void {
      this.submissionState = "idle";
      this.pendingChoice = null;
    },
    reset(): void {
      Object.assign(this, createRealtimeVoteState());
    },
  },
});

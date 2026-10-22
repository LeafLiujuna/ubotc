import { defineStore } from 'pinia';

type Phase = 'ready' | 'countdown' | 'voting' | 'paused' | 'complete';
type Seat = { isDead?: boolean; isVoteless?: boolean; votes?: number };

export const useTableNominationStore = defineStore('tableNomination', {
  state: () => ({
    open: false,
    privateVote: false,
    phase: 'ready' as Phase,
    nominator: 0,
    nominee: 0,
    selecting: null as 'nominator' | 'nominee' | null,
    votes: [] as boolean[],
    eligible: [] as boolean[],
    voterStates: [] as Seat[],
    locked: 0,
    alive: 0,
    duration: 750,
    deadline: 0,
    remaining: 0,
    countdown: 0,
    highestVotes: 0,
    markedSeat: -1,
  }),
  getters: {
    requiredVotes: (state) => Math.max(Math.ceil(state.alive / 2), state.highestVotes + 1),
    yesVotes: (state) => state.votes.filter((vote, index) => vote && (
      state.phase === 'ready' || state.phase === 'countdown'
      || (index - state.nominee - 1 + state.votes.length) % state.votes.length < state.locked
    )).length,
    currentSeat: (state) => state.votes.length ? (state.nominee + 1 + Math.min(state.locked, state.votes.length - 1)) % state.votes.length : 0,
    canEdit: (state) => state.phase === 'ready' || state.phase === 'complete',
  },
  actions: {
    begin(index: number, seats: Seat[], duration = 750) {
      if (!seats[index]) return;
      this.nominator = index;
      this.nominee = index;
      // Retain the seat objects so a counted ghost vote updates the table and
      // remains spent when the next nomination begins.
      this.voterStates = seats.slice();
      this.eligible = seats.map(seat => !seat.isVoteless);
      this.alive = seats.filter(seat => !seat.isDead).length;
      this.duration = Math.max(250, Math.min(10000, duration));
      this.votes = seats.map(() => false);
      this.resetRound();
      this.open = true;
    },
    resetRound() {
      this.refreshBallots();
      this.phase = 'ready';
      this.locked = 0;
      this.deadline = 0;
      this.remaining = 0;
      this.countdown = 0;
      this.selecting = null;
    },
    refreshBallots() {
      this.eligible = this.voterStates.map(seat => !seat.isVoteless);
      this.votes = this.votes.map((raised, index) => raised && this.eligible[index]);
    },
    selectSeat(index: number, side?: 'nominator' | 'nominee' | null) {
      if (side === undefined) side = this.selecting;
      if (!this.canEdit || !side || index < 0 || index >= this.votes.length) return;
      this[side] = index;
      this.votes.fill(false);
      this.resetRound();
    },
    isLocked(index: number) {
      return (index - this.nominee - 1 + this.votes.length) % this.votes.length < this.locked;
    },
    toggleVote(index: number) {
      if (!this.open || this.selecting || !this.eligible[index] || this.isLocked(index) || this.phase === 'complete') return;
      this.votes[index] = !this.votes[index];
    },
    start(withCountdown = false, now = Date.now()) {
      if (!this.open || !this.votes.length || !this.canEdit) return;
      this.refreshBallots();
      this.locked = 0;
      this.selecting = null;
      this.phase = withCountdown ? 'countdown' : 'voting';
      this.countdown = withCountdown ? 3 : 0;
      this.remaining = withCountdown ? 3000 : this.duration;
      this.deadline = now + this.remaining;
    },
    tick(now = Date.now()) {
      if (!this.open || !['countdown', 'voting'].includes(this.phase)) return;
      if (this.phase === 'countdown') {
        this.countdown = Math.max(0, Math.ceil((this.deadline - now) / 1000));
        if (now < this.deadline) return;
        this.phase = 'voting';
        this.deadline += this.duration;
      }
      while (now >= this.deadline && this.locked < this.votes.length) {
        const index = this.currentSeat;
        const seat = this.voterStates[index];
        if (this.votes[index] && seat?.isDead) {
          if (seat.isVoteless) this.votes[index] = false;
          else {
            seat.isVoteless = true;
            seat.votes = 0;
            this.eligible[index] = false;
          }
        }
        this.locked++;
        this.deadline += this.duration;
      }
      if (this.locked === this.votes.length) {
        this.phase = 'complete';
        this.remaining = 0;
      } else this.remaining = Math.max(0, this.deadline - now);
    },
    togglePause(now = Date.now()) {
      if (this.phase === 'voting') {
        this.tick(now);
        if (this.phase !== 'voting') return;
        this.remaining = Math.max(0, this.deadline - now);
        this.phase = 'paused';
      } else if (this.phase === 'paused') {
        this.phase = 'voting';
        this.deadline = now + this.remaining;
      }
    },
    mark() {
      if (this.phase !== 'complete') return;
      this.markedSeat = this.markedSeat === this.nominee ? -1 : this.nominee;
      if (this.markedSeat >= 0) this.highestVotes = this.yesVotes;
    },
    setHighestVotes(value: number) {
      if (!Number.isInteger(value) || value < 0 || value > this.votes.length) return false;
      this.highestVotes = value;
      return true;
    },
    close() {
      this.open = false;
      this.resetRound();
    },
  },
});

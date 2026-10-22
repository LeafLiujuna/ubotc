export const RESULT_REVEAL_DURATION_MS = 4000;

export interface RoomTimerState {
  id: string;
  title: string;
  status: 'running' | 'paused' | 'stopped' | 'expired';
  durationMs: number;
  endsAt: number | null;
  remainingMs: number;
  blockNominations: boolean;
}

export interface GrimoireRevealState {
  id: string;
  startedAt?: number;
  revealedUserIds: string[];
  resultPublished: boolean;
  nextGameAt?: number;
}

export type TimerCommand = {
  action: 'start' | 'pause' | 'resume' | 'stop';
  durationSeconds?: number;
  title?: string;
  blockNominations?: boolean;
};

export function timerRemaining(timer: RoomTimerState | null | undefined, now = Date.now()): number {
  if (!timer || timer.status === 'stopped' || timer.status === 'expired') return 0;
  return Math.max(0, timer.status === 'running' && timer.endsAt !== null ? timer.endsAt - now : timer.remainingMs);
}


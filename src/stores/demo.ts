import { defineStore } from 'pinia';
import { useAppStore } from './app';
import { usePlayersStore } from './players';
import { useTableNominationStore } from './tableNomination';
import { useSessionStore } from './session';
import type { GrimoireRevealState, RoomTimerState, TimerCommand } from '@/types/storyteller';
import { timerRemaining, RESULT_REVEAL_DURATION_MS } from '@/types/storyteller';
import type { ServerGameEndMessage } from '@/types/socket';
import type { Player } from '@/types/domain';

export const DEMO_STORAGE_KEY = 'ubotc.storyteller-demo.v1';
const newId = () => globalThis.crypto?.randomUUID?.() || `demo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function validTimer(t: RoomTimerState | null): boolean {
  return t === null || Boolean(t && typeof t.id === 'string' && typeof t.title === 'string' && ['running', 'paused', 'stopped', 'expired'].includes(t.status)
    && Number.isFinite(t.durationMs) && t.durationMs >= 1000 && t.durationMs <= 86400000 && Number.isFinite(t.remainingMs) && t.remainingMs >= 0
    && (t.endsAt === null || Number.isFinite(t.endsAt)) && (t.status !== 'running' || typeof t.endsAt === 'number') && typeof t.blockNominations === 'boolean');
}
function validReveal(r: GrimoireRevealState | null): boolean {
  return r === null || Boolean(r && typeof r.id === 'string' && Array.isArray(r.revealedUserIds) && r.revealedUserIds.every(id => typeof id === 'string') && typeof r.resultPublished === 'boolean'
    && (r.nextGameAt === undefined || Number.isFinite(r.nextGameAt))
    && (r.startedAt === undefined || Number.isFinite(r.startedAt)));
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export const useDemoStore = defineStore('storytellerDemo', {
  state: () => ({
    active: false,
    level: 'prepare',
    levelDays: 0,
    scriptChosen: false,
    setupStep: 'seats',
    roomTimer: null as RoomTimerState | null,
    grimoireReveal: null as GrimoireRevealState | null,
    result: null as ServerGameEndMessage | null,
    storageError: '',
    wakeMarkers: { first: [] as string[], other: [] as string[] },
  }),
  actions: {
    begin(restore = true) {
      const app = useAppStore(), players = usePlayersStore(), session = useSessionStore();
      session.stopTimer();
      session.setSessionId('');
      session.gameServerId = '';
      session.setSpectator(false);
      session.claimSeat(-1);
      app.toggleMenu(false);
      app.toggleGrimoire(false);
      Object.keys(app.modals).forEach(key => { app.modals[key as keyof typeof app.modals] = false; });
      this.$reset();
      this.active = true;
      useTableNominationStore().$reset();
      let restored = false;
      players.set([]);
      players.bluffs = [];
      players.fabled = [];
      app.setEdition({ id: 'tb' });
      if (restore) {
        try {
          const saved = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY) || 'null');
          if (saved?.version === 1 && Array.isArray(saved.seats) && saved.seats.length <= 20
            && saved.seats.every((p: Player) => p && p.role && typeof p.role.id === 'string' && Array.isArray(p.reminders))
            && ['prepare', 'night', 'day', 'end'].includes(saved.level)
            && Number.isInteger(saved.levelDays) && saved.levelDays >= 0
            && ['customRoles', 'bluffs', 'fabled'].every(key => saved[key] === undefined || (Array.isArray(saved[key]) && saved[key].every((r: { id?: unknown } | null) => r && typeof r.id === 'string')))
            && typeof saved.scriptChosen === 'boolean' && ['seats', 'script', 'roles'].includes(saved.setupStep)
            && validTimer(saved.roomTimer ?? null) && validReveal(saved.grimoireReveal ?? null)
            && (saved.level !== 'end' || (saved.result && typeof saved.result.result === 'string' && saved.grimoireReveal && validReveal(saved.grimoireReveal)))) {
            if (Array.isArray(saved.customRoles)) app.setCustomRoles(saved.customRoles);
            if (saved.edition?.id) app.setEdition(saved.edition);
            players.set(saved.seats);
            players.bluffs = Array.isArray(saved.bluffs) ? saved.bluffs : [];
            players.fabled = Array.isArray(saved.fabled) ? saved.fabled : [];
            if (saved.wakeMarkers && ['first', 'other'].every(key => Array.isArray(saved.wakeMarkers[key]) && saved.wakeMarkers[key].every((id: unknown) => typeof id === 'string'))) this.wakeMarkers = saved.wakeMarkers;
            for (const key of ['level', 'levelDays', 'scriptChosen', 'setupStep', 'roomTimer', 'grimoireReveal', 'result'] as const) {
              if (saved[key] !== undefined) (this as unknown as Record<string, unknown>)[key] = saved[key];
            }
            restored = true;
          }
        } catch { this.storageError = '无法读取上次演示，已新建魔典。'; }
      }
      if (!restored) {
        players.set([]);
        for (let i = 0; i < 8; i++) players.add({ name: '', reminders: [], stReminders: [], role: { id: '' } });
      }
      app.toggleNight(this.level === 'night');
      this.tick();
    },
    save() {
      if (!this.active) return;
      const app = useAppStore(), players = usePlayersStore();
      try {
        localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({
          version: 1, seats: players.players, bluffs: players.bluffs, fabled: players.fabled,
          edition: app.edition, customRoles: [...app.roles.values()],
          level: this.level, levelDays: this.levelDays, scriptChosen: this.scriptChosen, setupStep: this.setupStep,
          wakeMarkers: this.wakeMarkers, roomTimer: this.roomTimer, grimoireReveal: this.grimoireReveal, result: this.result,
        }));
      } catch { this.storageError = '浏览器无法保存演示，当前操作仍可继续。'; }
    },
    advance() {
      if (this.level === 'end') return;
      if (this.level !== 'night') { this.level = 'night'; this.levelDays++; }
      else this.level = 'day';
      useAppStore().toggleNight(this.level === 'night');
      this.save();
    },
    timer(command: TimerCommand) {
      if (this.level === 'end') throw new Error('演示已结束，请重新演示。');
      const previous = this.roomTimer;
      if (command.action === 'start') {
        const durationMs = Number(command.durationSeconds) * 1000;
        if (!Number.isInteger(command.durationSeconds) || (command.title?.length || 0) > 80 || !Number.isFinite(durationMs) || durationMs < 1000 || durationMs > 86400000) throw new Error('请输入 1 秒至 24 小时的时长。');
        this.roomTimer = { id: newId(), title: command.title?.trim() || '计时器', status: 'running', durationMs, remainingMs: durationMs, endsAt: Date.now() + durationMs, blockNominations: false };
      } else if (previous) {
        if (command.action === 'pause' && previous.status === 'running') this.roomTimer = { ...previous, status: timerRemaining(previous) > 0 ? 'paused' : 'expired', remainingMs: timerRemaining(previous), endsAt: null };
        else if (command.action === 'resume' && previous.status === 'paused') this.roomTimer = { ...previous, status: 'running', endsAt: Date.now() + previous.remainingMs };
        else if (command.action === 'stop') this.roomTimer = { ...previous, status: 'stopped', remainingMs: 0, endsAt: null };
      }
      this.save();
    },
    tick() {
      if (this.level === 'end' && this.grimoireReveal?.resultPublished
        && this.grimoireReveal.nextGameAt !== undefined && Date.now() >= this.grimoireReveal.nextGameAt) {
        this.nextRound();
        return;
      }
      if (this.roomTimer?.status === 'running' && timerRemaining(this.roomTimer) === 0) {
        this.roomTimer = { ...this.roomTimer, status: 'expired', endsAt: null, remainingMs: 0 };
        this.save();
      }
    },
    end(result: ServerGameEndMessage) {
      if (this.level === 'end') return;
      this.level = 'end';
      this.roomTimer = null;
      this.result = clone(result);
      if (result.result === 'team-win' && result.winningTeam) {
        this.result.winningPlayerIds = usePlayersStore().players.flatMap((p, index) => {
          const alignment = p.role.alignment || (['minion', 'demon'].includes(p.role.team || '') ? 'evil' : 'good');
          return result.winningTeam === alignment || result.winningTeam === p.role.team ? [`demo-seat-${index}`] : [];
        });
      }
      useTableNominationStore().close();
      this.grimoireReveal = { id: newId(), startedAt: Date.now(), revealedUserIds: [], resultPublished: false };
      useAppStore().toggleNight(false);
      this.save();
    },
    reveal(userIds: string[]) {
      if (!this.grimoireReveal) return;
      this.grimoireReveal.revealedUserIds = [...new Set([...this.grimoireReveal.revealedUserIds, ...userIds])];
      this.save();
    },
    publish() {
      if (!this.grimoireReveal || this.grimoireReveal.resultPublished) return;
      this.grimoireReveal.resultPublished = true;
      this.grimoireReveal.nextGameAt = Date.now() + RESULT_REVEAL_DURATION_MS;
      this.save();
    },
    nextRound() {
      if (this.level !== 'end' || !this.grimoireReveal?.resultPublished) return;
      const players = usePlayersStore();
      players.players = players.players.map(player => ({
        ...player, role: { id: '' }, reminders: [], stReminders: [], isDead: false,
        isVoteless: false, isSecretVoteless: false, votes: 1, isWraith: false, isUsingWraith: false,
      }));
      players.bluffs = [];
      players.fabled = [];
      this.level = 'prepare';
      this.levelDays = 0;
      this.setupStep = this.scriptChosen ? 'roles' : 'script';
      this.roomTimer = null;
      this.grimoireReveal = null;
      this.result = null;
      this.wakeMarkers = { first: [], other: [] };
      useTableNominationStore().$reset();
      useSessionStore().resetGameRoundState();
      useAppStore().toggleNight(false);
      this.save();
    },
  },
});

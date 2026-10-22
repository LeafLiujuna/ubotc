import { computed } from 'vue';
import { defineStore } from 'pinia';
import { useDemoStore } from '@/stores/demo';
import { useGameStore } from '@/stores/game';
import { usePlayersStore } from '@/stores/players';
import { useGameController } from '@/controllers/GameController';
import { SocketClientEvent, type ClientDMEndGameMessage } from '@/types/socket';
import type { TimerCommand } from '@/types/storyteller';

export const BULK_REVEAL_INTERVAL_MS = 1150;

export const useStorytellerUiStore = defineStore('storytellerUi', {
  state: () => ({ timerOpen: false, endOpen: false, revealOpen: true, pending: false, error: '', bulkRevealUserIds: [] as string[], revealAnimationUserIds: [] as string[] }),
});

export function useStoryteller() {
  const demo = useDemoStore(), game = useGameStore(), controller = useGameController(), ui = useStorytellerUiStore();
  const mode = computed(() => demo.active ? 'demo' : 'room');
  const level = computed(() => demo.active ? demo.level : game.level);
  const levelDays = computed(() => demo.active ? demo.levelDays : game.levelDays);
  const timer = computed(() => demo.active ? demo.roomTimer : game.roomTimer);
  const reveal = computed(() => demo.active ? demo.grimoireReveal : game.grimoireReveal);
  const result = computed(() => demo.active ? demo.result : game.gameEnd);
  const isHost = computed(() => demo.active || game.currentIsDm);
  const available = computed(() => demo.active || controller.isConnected);
  const playerId = (index: number) => demo.active ? `demo-seat-${index}` : usePlayersStore().players[index]?.id || '';
  const revealId = (index: number) => playerId(index) || (usePlayersStore().players[index] ? `@seat:${index + 1}` : '');
  async function perform(action: () => Promise<unknown> | void) {
    if (ui.pending || !isHost.value || !available.value) return;
    ui.pending = true; ui.error = '';
    try { await action(); }
    catch (error) { ui.error = error instanceof Error ? error.message : '操作失败，请重试'; window.$toast?.error(ui.error); }
    finally { ui.pending = false; }
  }
  async function setTimer(command: TimerCommand) {
    await perform(async () => {
      if (demo.active) demo.timer(command);
      else await controller.request(SocketClientEvent.DMTimer, command);
      ui.timerOpen = false;
    });
  }
  async function end(payload: ClientDMEndGameMessage) {
    await perform(async () => {
      if (demo.active) demo.end({ result: payload.result, winningTeam: payload.winningTeam, winningPlayerIds: payload.winningPlayerIds, isIncomplete: !payload.isComplete });
      else await controller.endGame({ ...payload, revealMode: 'staged' });
      ui.endOpen = false; ui.revealOpen = true;
    });
  }
  async function revealPlayers(index?: number) {
    const revealedUserIds = reveal.value?.revealedUserIds || [];
    if (index !== undefined && revealedUserIds.includes(revealId(index))) return;
    const userIds = index === undefined
      ? usePlayersStore().players.map((player, i) => player.id || player.role.id ? revealId(i) : '').filter(id => id && !revealedUserIds.includes(id))
      : [revealId(index)].filter(Boolean);
    if (!userIds.length) return;
    await perform(async () => {
      ui.bulkRevealUserIds = index === undefined && userIds.length > 1 ? userIds : [];
      ui.revealAnimationUserIds = [...userIds];
      try {
        if (demo.active) demo.reveal(userIds);
        else await controller.request(SocketClientEvent.DMRevealPlayers, index === undefined ? { all: true } : { userIds });
      } catch (error) {
        ui.bulkRevealUserIds = [];
        ui.revealAnimationUserIds = [];
        throw error;
      }
    });
  }
  function finishReveal(userId: string) {
    ui.revealAnimationUserIds = ui.revealAnimationUserIds.filter(id => id !== userId);
    if (!ui.revealAnimationUserIds.length) ui.bulkRevealUserIds = [];
  }
  async function publish() {
    await perform(async () => {
      if (demo.active) demo.publish();
      else await controller.request(SocketClientEvent.DMPublishResult, {});
    });
  }
  return { mode, demo, game, ui, level, levelDays, timer, reveal, result, isHost, available, playerId, revealId, perform, setTimer, end, revealPlayers, finishReveal, publish };
}

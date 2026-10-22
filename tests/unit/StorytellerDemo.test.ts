import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useDemoStore, DEMO_STORAGE_KEY } from '@/stores/demo';
import { usePlayersStore } from '@/stores/players';
import { useAppStore } from '@/stores/app';
import { useGameController } from '@/controllers/GameController';
import { useTableNominationStore } from '@/stores/tableNomination';
import { BULK_REVEAL_INTERVAL_MS, useStoryteller } from '@/composables/useStoryteller';
import { useNightOrderRoles } from '@/composables/useNightOrderRoles';
import { timerRemaining } from '@/types/storyteller';
import { useSessionStore } from '@/stores/session';
import { useGameStore } from '@/stores/game';
import { shallowMount } from '@vue/test-utils';
import { nextTick } from 'vue';
import StorytellerStage from '@/components/StorytellerStage.vue';
import TownSquare from '@/components/TownSquare.vue';

beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-17T12:00:00Z')); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
function configured() {
  const demo = useDemoStore(); demo.begin(false); demo.scriptChosen = true;
  const roles = [...useAppStore().roles.values()].filter(r => r.team === 'townsfolk').slice(0, 8);
  usePlayersStore().players.forEach((p, i) => { p.role = { ...roles[i] }; });
  return demo;
}

test('room reveal handles configured empty seats individually and keeps unrelated identities covered', async () => {
  const game = useGameStore(), players = usePlayersStore(), controller = useGameController();
  game.currentPlayer = { userId: 'dm', isDM: true, seat: 0 } as any;
  game.level = 'end';
  game.grimoireReveal = { id: 'reveal', revealedUserIds: [], resultPublished: false };
  players.set([{ id: '', role: { id: 'chef' } }, { id: 'a', role: { id: 'imp' } }, { id: '', role: { id: '' } }] as any);
  vi.spyOn(controller, 'isConnected', 'get').mockReturnValue(true);
  const request = vi.spyOn(controller, 'request').mockResolvedValue({ status: 200 });
  const st = useStoryteller();
  expect(st.playerId(0)).toBe('');
  expect(st.revealId(0)).toBe('@seat:1');
  await st.revealPlayers(0);
  expect(request).toHaveBeenLastCalledWith('dmRevealPlayers', { userIds: ['@seat:1'] });
  expect(st.ui.revealAnimationUserIds).toEqual(['@seat:1']);
  game.grimoireReveal.revealedUserIds = ['@seat:1'];
  await st.revealPlayers(0);
  expect(request).toHaveBeenCalledTimes(1);
  const seat = { index: 0, player: players.players[0], role: players.players[0].role };
  expect(TownSquare.methods.revealTokenRole.call({ stagedReveal: game.grimoireReveal }, seat)).toEqual({ id: 'chef' });
  await st.revealPlayers();
  expect(st.ui.revealAnimationUserIds).toEqual(['a']);
  const revealPlayers = vi.fn();
  await TownSquare.methods.handleTableSeatClick.call({ stagedReveal: game.grimoireReveal, isStoryteller: true, storyteller: { revealPlayers } }, 0);
  expect(revealPlayers).toHaveBeenCalledWith(0);
});

test.each([0, 1, 8])('demo enters the first night with %i unassigned seats and no chosen script', (seatCount) => {
  const demo = useDemoStore();
  demo.begin(false);
  usePlayersStore().players = usePlayersStore().players.slice(0, seatCount);
  expect(demo.scriptChosen).toBe(false);
  demo.advance();
  expect(demo.level).toBe('night');
  expect(demo.levelDays).toBe(1);
  expect(useAppStore().grimoire.isNight).toBe(true);
  demo.advance();
  expect(demo.level).toBe('day');
  expect(demo.levelDays).toBe(1);
  demo.advance();
  expect(demo.level).toBe('night');
  expect(demo.levelDays).toBe(2);
});
test('offline demo uses eight empty seats and local actions without connecting or sending requests', async () => {
  const connect = vi.spyOn(useGameController(), 'connectToGameServer');
  const request = vi.spyOn(useGameController(), 'request');
  const demo = configured(), st = useStoryteller();
  expect(usePlayersStore().players).toHaveLength(8);
  expect(usePlayersStore().players.every(p => !p.id)).toBe(true);
  demo.advance(); expect(demo.level).toBe('night'); expect(demo.levelDays).toBe(1);
  const night = useNightOrderRoles();
  expect(night.nightOrderSections.value.some(section => section.isCurrent)).toBe(true);
  expect(night.nightOrderSections.value[0].entries.some(entry => entry.role.isConfigured)).toBe(true);
  await st.setTimer({ action: 'start', durationSeconds: 120, title: '自由讨论' });
  expect(demo.roomTimer?.title).toBe('自由讨论');
  await st.end({ isComplete: true, result: 'team-win', winningTeam: 'good' });
  await st.revealPlayers(2); await st.publish();
  expect(demo.grimoireReveal?.revealedUserIds).toEqual(['demo-seat-2']);
  expect(demo.grimoireReveal?.resultPublished).toBe(true);
  expect(connect).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled();
});
test('restores roles, reminders, bluffs, custom script, timer and partial reveal after refresh', () => {
  const demo = configured(), players = usePlayersStore(), app = useAppStore();
  app.setCustomRoles([{ id: 'demohero', name: '演示角色', team: 'townsfolk', ability: '演示能力' }]); app.setEdition({ id: 'custom', name: '自定义演示' });
  players.players[0].role = { id: 'demohero', name: '演示角色', team: 'townsfolk' };
  players.players[0].reminders = ['已核对']; players.bluffs = [{ id: 'chef' }];
  demo.wakeMarkers.first = ['demohero']; demo.advance();
  demo.timer({ action: 'start', durationSeconds: 120 }); vi.advanceTimersByTime(10000); demo.timer({ action: 'pause' });
  demo.save(); setActivePinia(createPinia());
  const restored = useDemoStore(); restored.begin();
  expect(restored.level).toBe('night'); expect(restored.roomTimer?.remainingMs).toBe(110000);
  expect(usePlayersStore().players[0].reminders).toEqual(['已核对']); expect(usePlayersStore().bluffs).toEqual([{ id: 'chef' }]);
  expect(useAppStore().roles.get('demohero')?.name).toBe('演示角色'); expect(restored.wakeMarkers.first).toEqual(['demohero']);
  restored.end({ result: 'team-win', winningTeam: 'good', isIncomplete: false }); restored.reveal(['demo-seat-0']);
  setActivePinia(createPinia()); const ended = useDemoStore(); ended.begin();
  expect(ended.grimoireReveal?.revealedUserIds).toEqual(['demo-seat-0']); expect(ended.grimoireReveal?.resultPublished).toBe(false);
  expect(ended.roomTimer).toBeNull();
});
test('invalid or future-version saves recover to a usable blank grimoire', () => {
  for (const saved of ['{broken', JSON.stringify({ version: 2, seats: [] }), JSON.stringify({ version: 1, seats: [{ role: null }], level: 'night' })]) {
    localStorage.setItem(DEMO_STORAGE_KEY, saved); useDemoStore().begin();
    expect(usePlayersStore().players).toHaveLength(8); expect(useDemoStore().level).toBe('prepare');
  }
});
test('room timers count down independently of nominations and preserve explicit vote pauses', () => {
  const demo = configured(), vote = useTableNominationStore(); demo.advance(); demo.advance();
  vote.begin(0, usePlayersStore().players); vote.start();
  demo.timer({ action: 'start', durationSeconds: 2, blockNominations: true });
  expect(demo.roomTimer?.blockNominations).toBe(false);
  expect(vote.phase).toBe('voting');
  vote.toggleVote(1); expect(vote.votes[1]).toBe(true);
  vote.togglePause(); expect(vote.phase).toBe('paused');
  vi.advanceTimersByTime(2100); demo.tick();
  expect(demo.roomTimer?.status).toBe('expired'); expect(vote.phase).toBe('paused');
  demo.timer({ action: 'start', durationSeconds: 10 }); demo.timer({ action: 'stop' }); expect(vote.phase).toBe('paused');
  demo.timer({ action: 'start', durationSeconds: 10 }); vi.advanceTimersByTime(2500); demo.timer({ action: 'pause' });
  expect(timerRemaining(demo.roomTimer)).toBe(7500); vi.advanceTimersByTime(5000); demo.timer({ action: 'resume' }); expect(timerRemaining(demo.roomTimer)).toBe(7500);
  vote.close(); vote.begin(1, usePlayersStore().players); vote.start(true);
  expect(vote.phase).toBe('countdown');
  demo.timer({ action: 'stop' }); expect(vote.phase).toBe('countdown');
});

test('restoring a legacy blocking timer does not disable manual nominations', () => {
  const demo = configured(); demo.advance(); demo.advance();
  demo.timer({ action: 'start', durationSeconds: 120 });
  const saved = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)!);
  saved.roomTimer.blockNominations = true;
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(saved));
  setActivePinia(createPinia());
  useDemoStore().begin();
  const vote = useTableNominationStore();
  vote.begin(0, usePlayersStore().players); vote.start();
  expect(vote.phase).toBe('voting');
  vote.toggleVote(1); expect(vote.votes[1]).toBe(true);
});

test('timer form starts a countdown without a nomination blocking option', async () => {
  const demo = configured(), st = useStoryteller(); demo.advance(); demo.advance();
  const setTimer = vi.spyOn(demo, 'timer');
  const wrapper = shallowMount(StorytellerStage, { global: { stubs: {
    teleport: true, Modal: { template: '<div><slot /></div>' }, FontAwesomeIcon: true,
  } } });
  try {
    st.ui.timerOpen = true; await nextTick();
    expect(wrapper.text()).not.toContain('暂停提名和投票');
    expect(wrapper.find('.storyteller-form input[type="checkbox"]').exists()).toBe(false);
    await wrapper.get('.storyteller-form').trigger('submit'); await nextTick();
    expect(setTimer).toHaveBeenCalledWith({ action: 'start', durationSeconds: 600, title: '', blockNominations: false });
    expect(demo.roomTimer).toMatchObject({ status: 'running', durationMs: 600000, blockNominations: false });
  } finally { wrapper.unmount(); }
});
test('reveal progress covers known identities, preview does not reveal and publishing is independent', async () => {
  const demo = configured(); demo.advance(); demo.end({ result: 'team-win', winningTeam: 'good', isIncomplete: false });
  const seat = { index: 0, player: usePlayersStore().players[0], role: usePlayersStore().players[0].role };
  const context: any = { demoStore: demo, stagedReveal: demo.grimoireReveal, isStoryteller: true, previewRevealSeat: 0, storyteller: useStoryteller(), revealLongPress: true };
  expect(TownSquare.methods.revealTokenRole.call(context, seat)).toEqual({ id: '' });
  await TownSquare.methods.handleTableTokenClick.call(context, 0, {});
  expect(demo.grimoireReveal?.revealedUserIds).toEqual([]);
  demo.publish(); expect(demo.grimoireReveal?.revealedUserIds).toEqual([]);
  demo.reveal(['demo-seat-0']); expect(TownSquare.methods.revealTokenRole.call(context, seat).id).toBe(seat.role.id);
});

test('bulk reveal skips identities already shown and records a stable seat order for sequential animation', async () => {
  const demo = configured(), st = useStoryteller();
  demo.advance(); demo.end({ result: 'team-win', winningTeam: 'good', isIncomplete: false });
  demo.reveal(['demo-seat-0']);
  await st.revealPlayers();
  expect(demo.grimoireReveal?.revealedUserIds).toHaveLength(8);
  expect(st.ui.bulkRevealUserIds).toEqual(Array.from({ length: 7 }, (_, index) => `demo-seat-${index + 1}`));
  expect(st.ui.revealAnimationUserIds).toEqual(Array.from({ length: 7 }, (_, index) => `demo-seat-${index + 1}`));
  expect(TownSquare.methods.bulkRevealTurnDelay.call({ storyteller: st }, 1)).toBe(0);
  expect(TownSquare.methods.bulkRevealTurnDelay.call({ storyteller: st }, 2)).toBe(BULK_REVEAL_INTERVAL_MS);
  st.finishReveal('demo-seat-1');
  expect(st.ui.bulkRevealUserIds).toEqual(Array.from({ length: 7 }, (_, index) => `demo-seat-${index + 1}`));
  expect(st.ui.revealAnimationUserIds).toEqual(Array.from({ length: 6 }, (_, index) => `demo-seat-${index + 2}`));
});

test('single reveal marks its animation target until its turn finishes', async () => {
  const demo = configured(), st = useStoryteller();
  const reveal = vi.spyOn(demo, 'reveal');
  demo.advance(); demo.end({ result: 'team-win', winningTeam: 'good', isIncomplete: false });
  await st.revealPlayers(1);
  expect(demo.grimoireReveal?.revealedUserIds).toEqual(['demo-seat-1']);
  expect(st.ui.bulkRevealUserIds).toEqual([]);
  expect(st.ui.revealAnimationUserIds).toEqual(['demo-seat-1']);
  await st.revealPlayers(1);
  expect(reveal).toHaveBeenCalledTimes(1);
  st.finishReveal('demo-seat-1');
  expect(st.ui.revealAnimationUserIds).toEqual([]);
});

test('published results prepare the next demo game after the full animation and preserve seats and script', () => {
  const demo = configured(), players = usePlayersStore(), session = useSessionStore();
  players.players[0].name = '一号'; players.players[0].image = '/avatar.webp';
  players.players[0].isDead = true; players.players[0].isVoteless = true; players.players[0].votes = 0;
  players.players[0].reminders = ['中毒']; players.bluffs = [{ id: 'chef' }];
  demo.wakeMarkers.first = ['chef'];
  demo.advance(); demo.end({ result: 'team-win', winningTeam: 'good', isIncomplete: false });
  vi.advanceTimersByTime(5000); demo.tick(); expect(demo.level).toBe('end');
  demo.publish(); const deadline = demo.grimoireReveal?.nextGameAt;
  vi.advanceTimersByTime(2000); demo.publish(); expect(demo.grimoireReveal?.nextGameAt).toBe(deadline);
  vi.advanceTimersByTime(1999); demo.tick(); expect(demo.level).toBe('end');
  vi.advanceTimersByTime(1); demo.tick();
  expect(demo.level).toBe('prepare'); expect(demo.levelDays).toBe(0); expect(demo.scriptChosen).toBe(true);
  expect(demo.setupStep).toBe('roles'); expect(demo.result).toBeNull(); expect(demo.grimoireReveal).toBeNull();
  expect(players.players).toHaveLength(8); expect(players.players[0]).toMatchObject({ name: '一号', image: '/avatar.webp', role: { id: '' }, isDead: false, isVoteless: false, votes: 1, reminders: [] });
  expect(players.bluffs).toEqual([]); expect(demo.wakeMarkers.first).toEqual([]); expect(session.nomination).toBe(false);
  setActivePinia(createPinia()); useDemoStore().begin();
  expect(useDemoStore().level).toBe('prepare'); expect(usePlayersStore().players[0].name).toBe('一号');
});

test('refresh after publication keeps the original next-game deadline', () => {
  const demo = configured(); demo.advance(); demo.end({ result: 'team-win', winningTeam: 'good', isIncomplete: false });
  demo.publish(); const deadline = demo.grimoireReveal?.nextGameAt;
  vi.advanceTimersByTime(2500); setActivePinia(createPinia());
  const restored = useDemoStore(); restored.begin();
  expect(restored.level).toBe('end'); expect(restored.grimoireReveal?.nextGameAt).toBe(deadline);
  vi.advanceTimersByTime(1500); restored.tick(); expect(restored.level).toBe('prepare');
});

test('victory banner leaves before the next game and the reveal controls close automatically', async () => {
  const demo = configured(); demo.advance();
  const wrapper = shallowMount(StorytellerStage, { global: { stubs: { teleport: true, FontAwesomeIcon: true } } });
  try {
    demo.end({ result: 'team-win', winningTeam: 'good', isIncomplete: false });
    await nextTick(); demo.publish(); await nextTick();
    expect(wrapper.find('.storyteller-victory').exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(3499); expect(demo.level).toBe('end');
    expect(wrapper.find('.storyteller-victory').exists()).toBe(true);
    await vi.advanceTimersByTimeAsync(1); expect(wrapper.find('.storyteller-victory').exists()).toBe(false);
    expect(demo.level).toBe('end');
    await vi.advanceTimersByTimeAsync(500); expect(demo.level).toBe('prepare');
    expect(wrapper.find('.stage-reveal').exists()).toBe(false);
  } finally { wrapper.unmount(); }
});

function mountEndDialog() {
  return shallowMount(StorytellerStage, { global: { stubs: {
    teleport: true,
    Modal: { template: '<div class="end-dialog"><slot /></div>' },
    FontAwesomeIcon: true,
  } } });
}

test.each([['善良阵营获胜', 'good'], ['邪恶阵营获胜', 'evil']])('end dialog directly records %s and starts staged reveal', async (label, team) => {
  const demo = configured(), st = useStoryteller(); demo.advance();
  const wrapper = mountEndDialog();
  try {
    st.ui.endOpen = true; await nextTick();
    const button = wrapper.findAll('.verdict-button').find(button => button.text() === label)!;
    await button.trigger('click'); await nextTick();
    expect(demo.result).toMatchObject({ result: 'team-win', winningTeam: team, isIncomplete: false });
    expect(demo.grimoireReveal).toMatchObject({ revealedUserIds: [], resultPublished: false });
    expect(st.ui.endOpen).toBe(false);
  } finally { wrapper.unmount(); }
});

test('individual victory requires exactly one current player and does not include a winning team', async () => {
  const demo = configured(), st = useStoryteller(); demo.advance();
  const wrapper = mountEndDialog();
  try {
    st.ui.endOpen = true; await nextTick();
    await wrapper.find('.verdict-player').trigger('click');
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined();
    const radios = wrapper.findAll<HTMLInputElement>('input[type="radio"]');
    await radios[0].setValue(true); await radios[3].setValue(true);
    expect(radios.filter(radio => radio.element.checked)).toHaveLength(1);
    await wrapper.find('form').trigger('submit'); await nextTick();
    expect(demo.result).toMatchObject({ result: 'character-win', winningPlayerIds: ['demo-seat-3'], isIncomplete: false });
    expect(demo.result?.winningTeam).toBeUndefined();
    expect(demo.grimoireReveal?.resultPublished).toBe(false);
  } finally { wrapper.unmount(); }
});

test('back and cancel do not end the game, and reopening clears the previous player choice', async () => {
  const demo = configured(), st = useStoryteller(); demo.advance();
  const wrapper = mountEndDialog();
  try {
    st.ui.endOpen = true; await nextTick(); await wrapper.find('.verdict-player').trigger('click');
    await wrapper.find('input[type="radio"]').setValue(true);
    await wrapper.findAll('button').find(button => button.text() === '返回')!.trigger('click');
    expect(wrapper.find('.verdict-evil').exists()).toBe(true); expect(demo.level).toBe('night');
    await wrapper.find('.verdict-cancel').trigger('click'); expect(st.ui.endOpen).toBe(false);
    st.ui.endOpen = true; await nextTick(); await wrapper.find('.verdict-player').trigger('click');
    expect(wrapper.findAll<HTMLInputElement>('input[type="radio"]').every(radio => !radio.element.checked)).toBe(true);
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined();
    await wrapper.findAll('button').find(button => button.text() === '取消')!.trigger('click');
    expect(demo.level).toBe('night'); expect(demo.result).toBeNull();
  } finally { wrapper.unmount(); }
});

test('failed confirmation keeps the player selection and displays the error for retry', async () => {
  const demo = configured(), st = useStoryteller(); demo.advance();
  const end = vi.spyOn(demo, 'end').mockImplementationOnce(() => { throw new Error('连接失败，请重试'); });
  const wrapper = mountEndDialog();
  try {
    st.ui.endOpen = true; await nextTick(); await wrapper.find('.verdict-player').trigger('click');
    await wrapper.find('input[type="radio"]').setValue(true);
    await wrapper.find('form').trigger('submit'); await nextTick();
    expect(st.ui.endOpen).toBe(true); expect(st.ui.pending).toBe(false);
    expect(wrapper.find('.reveal-error').text()).toBe('连接失败，请重试');
    expect(wrapper.find<HTMLInputElement>('input[type="radio"]').element.checked).toBe(true);
    await wrapper.find('form').trigger('submit'); await nextTick();
    expect(end).toHaveBeenCalledTimes(2); expect(st.ui.endOpen).toBe(false);
    expect(demo.result?.winningPlayerIds).toEqual(['demo-seat-0']);
  } finally { wrapper.unmount(); }
});

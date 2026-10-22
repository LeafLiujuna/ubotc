import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import RoomNominationControls from '@/components/RoomNominationControls.vue';
import { useGameController } from '@/controllers/GameController';
import { useGameStore } from '@/stores/game';
import { usePlayersStore } from '@/stores/players';
import { useRealtimeVoteStore } from '@/stores/realtimeVote';
import { useUserStore } from '@/stores/user';

let wrappers: ReturnType<typeof mount>[] = [];
beforeEach(() => {
  setActivePinia(createPinia());
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  useUserStore().setCurrentUser({ id: 'one', displayName: '玩家甲' } as never);
  usePlayersStore().set([{ id: 'one', name: '玩家甲' }, { id: 'two', name: '玩家乙' }] as never);
  const controller = useGameController();
  controller.connectionStatus = 'connected';
  controller.gameSocket = {} as never;
});
afterEach(() => { wrappers.forEach(wrapper => wrapper.unmount()); wrappers = []; vi.restoreAllMocks(); });
function create({ dm = false, privacy = false, empty = false, sweep = false } = {}) {
  useGameStore().currentPlayer = { isDM: dm } as never;
  const vote = useRealtimeVoteStore();
  vote.startVote({ ...(sweep ? { sweepVote: true, stage: 'ready' as const, turnDurationMs: 600 } : {}), nominationId: 'round', nominatorUserId: empty ? '@seat:1' : 'one',
    nomineeUserId: empty ? '@seat:2' : 'two', requiredVotes: 1, canVote: !dm, privateVote: privacy });
  vote.startPlayerTurn({ userId: empty ? '@seat:1' : 'one', seat: 1 });
  const wrapper = mount(RoomNominationControls, { global: { stubs: { ClockDial: true } } });
  wrappers.push(wrapper);
  const button = (text: string) => wrapper.findAll('button').find(item => item.text().includes(text))!;
  return { vote, wrapper, button, controller: useGameController() };
}

test('players can change a sweep ballot before their turn, with only raise/lower controls and no DM buttons', async () => {
  const { vote, wrapper, controller } = create({ sweep: true });
  vote.startPlayerTurn({ userId: 'two', seat: 2, turnIndex: 1, stage: 'ready' });
  await flushPromises();
  const submit = vi.spyOn(controller, 'submitVote').mockResolvedValue({ status: 200 } as never);
  await wrapper.get('[aria-label="赞成 · 举手"]').trigger('click'); await flushPromises();
  expect(submit).toHaveBeenLastCalledWith({ vote: 'yes', nominationId: 'round' });
  vote.recordPlayerVote({ userId: 'one', seat: 1, vote: 'yes', locked: false });
  await flushPromises();
  expect(vote.currentYesVotes).toBe(0);
  await wrapper.get('[aria-label="反对 · 放下"]').trigger('click'); await flushPromises();
  expect(submit).toHaveBeenLastCalledWith({ vote: 'no', nominationId: 'round' });
  expect(wrapper.findAll('button')).toHaveLength(2);
  expect(wrapper.find('.table-nomination__privacy').exists()).toBe(false);
  vote.recordPlayerVote({ userId: 'one', seat: 1, vote: 'no' }); await flushPromises();
  expect(wrapper.findAll('button')).toHaveLength(2);
  expect(wrapper.get('[aria-label="赞成 · 举手"]').attributes('disabled')).toBeDefined();
});

test('storyteller starts and resets a sweep with server commands, and ignores stale timing snapshots', async () => {
  const { vote, button, controller } = create({ dm: true, sweep: true });
  const resume = vi.spyOn(controller, 'resumeVote').mockResolvedValue({} as never);
  await button('倒计时').trigger('click'); await flushPromises();
  expect(resume).toHaveBeenLastCalledWith({ nominationId: 'round', countdown: true });
  vote.startPlayerTurn({ userId: 'two', seat: 2, turnIndex: 2, stage: 'voting', sequenceRevision: 5, turnRemainingMs: 300 });
  vote.startPlayerTurn({ userId: 'one', seat: 1, turnIndex: 1, sequenceRevision: 4 });
  expect(vote.currentVoterSeat).toBe(2); expect(vote.turnRemainingMs).toBe(300);
  await flushPromises(); await button('重置').trigger('click'); await flushPromises();
  expect(resume).toHaveBeenLastCalledWith({ nominationId: 'round', restart: true });
});

test('uses the small table dialog and dial without the removed ledger or ranking controls', () => {
  const { wrapper } = create();
  expect(wrapper.find('#table-nomination-panel[role="dialog"]').exists()).toBe(true);
  expect(wrapper.findComponent({ name: 'ClockDial' }).props()).toMatchObject({ minuteSeat: 1, hourSeat: 2 });
  expect(wrapper.find('#realtime-vote-panel').exists()).toBe(false);
  expect(wrapper.text()).not.toMatch(/席位裁定|票数榜|确认处决|最终处决/);
});

test('holds the voter hand between server messages and at completion without jumping to the nominator', async () => {
  const { vote, wrapper } = create();
  vote.startPlayerTurn({ userId: 'two', seat: 2 });
  await flushPromises();
  const hand = () => wrapper.findComponent({ name: 'ClockDial' }).props('minuteSeat');
  expect(hand()).toBe(2);
  vote.recordPlayerVote({ userId: 'two', seat: 2, vote: 'yes' });
  await flushPromises();
  expect(hand()).toBe(2);
  vote.completeVote({ nominationId: 'round', nominatorUserId: 'one', nomineeUserId: 'two', yesVotes: 1, totalVotes: 2 } as never);
  await flushPromises();
  expect(hand()).toBe(2);
  vote.startVote({ nominationId: 'next', nominatorUserId: 'one', nomineeUserId: 'two', requiredVotes: 1, canVote: true });
  await flushPromises();
  expect(hand()).toBe(1);
});

test('submits once and stays locked while awaiting the authoritative ballot', async () => {
  const { vote, button, controller } = create();
  const submit = vi.spyOn(controller, 'submitVote').mockResolvedValue({ status: 200 } as never);
  await button('赞成').trigger('click');
  await button('赞成').trigger('click');
  expect(submit).toHaveBeenCalledTimes(1);
  expect(submit).toHaveBeenCalledWith({ vote: 'yes' });
  expect(vote.submissionState).toBe('awaiting');
  vote.recordPlayerVote({ userId: 'one', seat: 1, vote: 'yes' });
  await flushPromises();
  expect(vote.submissionState).toBe('idle');
  expect(button('赞成')).toBeUndefined();
});

test('failed submission unlocks for a retry and shows the server error', async () => {
  const { vote, button, wrapper, controller } = create();
  vi.spyOn(controller, 'submitVote').mockRejectedValue(new Error('连接中断'));
  await button('赞成').trigger('click');
  await flushPromises();
  expect(vote.submissionState).toBe('idle');
  expect(wrapper.get('[role="alert"]').text()).toBe('连接中断');
  expect(button('赞成').attributes('disabled')).toBeUndefined();
});

test('an acknowledgment arriving after the turn advances cannot lock the next empty seat', async () => {
  const { vote, button, controller } = create({ dm: true, empty: true });
  let resolve!: (value: never) => void;
  vi.spyOn(controller, 'submitVote').mockReturnValue(new Promise(done => { resolve = done; }));
  await button('赞成').trigger('click');
  vote.recordPlayerVote({ userId: '@seat:1', seat: 1, vote: 'yes' });
  vote.startPlayerTurn({ userId: '@seat:2', seat: 2 });
  resolve({ status: 200 } as never);
  await flushPromises();
  expect(vote.submissionState).toBe('idle');
  expect(button('赞成').attributes('disabled')).toBeUndefined();
});

test('storyteller can vote an empty seat using its seat and round identifiers', async () => {
  const { controller, button } = create({ dm: true, empty: true });
  const submit = vi.spyOn(controller, 'submitVote').mockResolvedValue({ status: 200 } as never);
  await button('反对').trigger('click');
  expect(submit).toHaveBeenCalledWith({ vote: 'no', seat: 1, nominationId: 'round' });
});

test('storyteller cannot vote for an occupied seat and observers have no vote controls', () => {
  const { button } = create({ dm: true });
  expect(button('赞成')).toBeUndefined();
  useGameStore().currentPlayer = {} as never;
  useRealtimeVoteStore().canVote = false;
  expect(button('赞成')).toBeUndefined();
});

test('clicking a seat only submits for the current eligible voter', async () => {
  const { wrapper, controller } = create({ dm: true, empty: true });
  const submit = vi.spyOn(controller, 'submitVote').mockResolvedValue({ status: 200 } as never);
  await wrapper.vm.voteForSeat(2);
  expect(submit).not.toHaveBeenCalled();
  await wrapper.vm.voteForSeat(1);
  expect(submit).toHaveBeenCalledWith({ vote: 'yes', seat: 1, nominationId: 'round' });
});

test('private player dialog conceals totals on completion but retains their own choice', async () => {
  const { vote, wrapper } = create({ privacy: true });
  vote.recordPlayerVote({ userId: 'one', seat: 1, vote: 'yes' });
  vote.completeVote({ nominationId: 'round', nominatorUserId: 'one', nomineeUserId: 'two', privateVote: true } as never);
  await flushPromises();
  expect(wrapper.text()).toContain('隐私投票已结束');
  expect(wrapper.text()).toContain('我的选择：举手');
  expect(wrapper.find('.table-nomination__tally').exists()).toBe(false);
  expect(wrapper.text()).not.toMatch(/投票通过|投票未通过|最终结果/);
});

test('storyteller sees the private final tally while public rounds expose it to players', async () => {
  const { vote, wrapper } = create({ dm: true, privacy: true });
  vote.completeVote({ nominationId: 'round', nominatorUserId: 'one', nomineeUserId: 'two', yesVotes: 2, totalVotes: 2 } as never);
  await flushPromises();
  expect(wrapper.get('.table-nomination__tally').text()).toContain('2 票');
  vote.privateVote = false;
  useGameStore().currentPlayer = {} as never;
  await flushPromises();
  expect(wrapper.get('.table-nomination__tally').text()).toContain('2 票');
});

test('pause, resume and cancel use the current server nomination', async () => {
  const { vote, button, controller } = create({ dm: true, empty: true });
  const pause = vi.spyOn(controller, 'pauseVote').mockResolvedValue({} as never);
  const resume = vi.spyOn(controller, 'resumeVote').mockResolvedValue({} as never);
  const cancel = vi.spyOn(controller, 'cancelVote').mockResolvedValue({} as never);
  await button('暂停').trigger('click'); await flushPromises();
  expect(pause).toHaveBeenCalledWith({ nominationId: 'round' });
  vote.paused = true; await flushPromises();
  await button('继续').trigger('click'); await flushPromises();
  expect(resume).toHaveBeenCalledWith({ nominationId: 'round' });
  await button('取消本轮').trigger('click'); await flushPromises();
  expect(cancel).toHaveBeenCalledWith({ nominationId: 'round' });
});

test('day ledger synchronization cannot reopen a closed central vote', async () => {
  const { vote, wrapper, button } = create();
  await button('关闭').trigger('click');
  vote.syncDayNominationState({ levelDays: 1, nominations: [{ nominationId: 'round' }], tiedCandidateUserIds: [] } as never);
  await flushPromises();
  expect(wrapper.find('.table-nomination').exists()).toBe(false);
});

test('connection loss disables voting without allowing local-only ballots', async () => {
  const { controller, wrapper } = create();
  controller.connectionStatus = 'disconnected' as never;
  await flushPromises();
  expect(wrapper.text()).not.toContain('赞成');
});

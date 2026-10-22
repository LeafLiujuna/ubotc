import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { useTableNominationStore } from '@/stores/tableNomination';
import TableNominationControls from '@/components/TableNominationControls.vue';
import TownSquare from '@/components/TownSquare.vue';
import RoleTokenMenu from '@/components/RoleTokenMenu.vue';
import { flushPromises } from '@vue/test-utils';

beforeEach(() => {
  setActivePinia(createPinia()); vi.useFakeTimers();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const seats = () => [{}, {}, {}, {}];

test('private voting temporarily applies night visuals only during a running round', () => {
  const manual = useTableNominationStore();
  manual.begin(0, seats(), 500);
  manual.privateVote = true;
  const context = { tableNomination: manual, manualNominationOpen: true,
    realtimeVoteStore: { isActive: false, privateVote: false } };
  const night = () => TownSquare.computed.privateVotingActive.call(context);
  expect(night()).toBe(false);
  manual.start(true, 1000);
  expect(night()).toBe(true);
  manual.tick(4000);
  manual.togglePause(4100);
  expect(night()).toBe(true);
  manual.togglePause(5000);
  manual.tick(9000);
  expect(night()).toBe(false);
  context.realtimeVoteStore = { isActive: true, privateVote: true };
  expect(night()).toBe(true);
  context.realtimeVoteStore.isActive = false;
  expect(night()).toBe(false);
});

test('spends a ghost vote only when a raised ballot locks, and cannot spend it again on restart', () => {
  const roster = [{ isDead: true, isVoteless: false, votes: 1 }, {}, {}];
  const vote = useTableNominationStore();
  vote.begin(1, roster, 500);
  vote.toggleVote(0);
  vote.toggleVote(0);
  expect(roster[0].isVoteless).toBe(false);
  vote.toggleVote(0);
  vote.start(false, 1000);
  vote.tick(1500);
  expect(roster[0].isVoteless).toBe(false);
  vote.tick(2000);
  expect(roster[0]).toMatchObject({ isDead: true, isVoteless: true, votes: 0 });
  expect(vote.yesVotes).toBe(1);
  vote.tick(2500);
  expect(vote.yesVotes).toBe(1);
  vote.start(false, 3000);
  expect(vote.votes[0]).toBe(false);
  vote.toggleVote(0);
  expect(vote.votes[0]).toBe(false);
  vote.tick(4500);
  expect(vote.yesVotes).toBe(0);
  vote.close();
  vote.begin(1, roster, 500);
  vote.toggleVote(0);
  expect(vote.votes[0]).toBe(false);
});

test('closing before a raised ghost vote locks or counting an abstention preserves the ghost vote', () => {
  const roster = [{ isDead: true, isVoteless: false, votes: 1 }, {}, {}];
  const vote = useTableNominationStore();
  vote.begin(1, roster, 500);
  vote.toggleVote(0);
  vote.start(false, 1000);
  vote.tick(1500);
  vote.close();
  expect(roster[0].isVoteless).toBe(false);
  vote.begin(1, roster, 500);
  vote.start(false, 2000);
  vote.tick(3500);
  expect(roster[0]).toMatchObject({ isVoteless: false, votes: 1 });
});

test('counts clockwise after the nominee, locks processed seats and finishes exactly once', () => {
  const vote = useTableNominationStore();
  vote.begin(2, seats(), 500);
  vote.toggleVote(3);
  vote.toggleVote(1);
  vote.start(false, 1000);
  expect(vote.currentSeat).toBe(3);
  expect(vote.yesVotes).toBe(0);
  vote.tick(1500);
  expect(vote.currentSeat).toBe(0);
  expect(vote.yesVotes).toBe(1);
  vote.toggleVote(3);
  expect(vote.votes[3]).toBe(true);
  vote.tick(3000);
  expect(vote.phase).toBe('complete');
  expect(vote.locked).toBe(4);
  expect(vote.yesVotes).toBe(2);
  vote.tick(100000);
  expect(vote.locked).toBe(4);
});

test('countdown and pause preserve the remaining time without advancing paused seats', () => {
  const vote = useTableNominationStore();
  vote.begin(0, seats(), 500);
  vote.start(true, 1000);
  vote.tick(2200);
  expect(vote.countdown).toBe(2);
  expect(vote.locked).toBe(0);
  vote.tick(4000);
  expect(vote.phase).toBe('voting');
  vote.togglePause(4200);
  expect(vote.remaining).toBe(300);
  vote.tick(50000);
  expect(vote.locked).toBe(0);
  vote.togglePause(50000);
  vote.tick(50299);
  expect(vote.locked).toBe(0);
  vote.tick(50300);
  expect(vote.locked).toBe(1);
});

test('allows the unprocessed last voter to change their vote and skips unavailable votes', () => {
  const vote = useTableNominationStore();
  vote.begin(0, [{}, { isVoteless: true }, {}, {}], 500);
  vote.toggleVote(1);
  expect(vote.votes[1]).toBe(false);
  vote.start(false, 1000);
  vote.tick(2500);
  vote.toggleVote(0);
  vote.tick(3000);
  expect(vote.yesVotes).toBe(1);
});

test('resets a round, reselects both hands and preserves the execution marker across closing', () => {
  const vote = useTableNominationStore();
  vote.begin(0, seats(), 250);
  vote.selectSeat(3, 'nominator');
  vote.selectSeat(1, 'nominee');
  expect([vote.nominator, vote.nominee]).toEqual([3, 1]);
  vote.votes = [true, true, true, false];
  vote.start(false, 1000);
  vote.tick(2000);
  vote.mark();
  expect(vote.markedSeat).toBe(1);
  expect(vote.highestVotes).toBe(3);
  expect(vote.requiredVotes).toBe(4);
  vote.close();
  expect(vote.open).toBe(false);
  expect(vote.markedSeat).toBe(1);
  vote.begin(2, seats());
  expect(vote.locked).toBe(0);
  expect(vote.votes).toEqual([false, false, false, false]);
  expect(vote.markedSeat).toBe(1);
  expect(vote.setHighestVotes(-1)).toBe(false);
  expect(vote.setHighestVotes(1.5)).toBe(false);
  expect(vote.setHighestVotes(5)).toBe(false);
  expect(vote.setHighestVotes(2)).toBe(true);
});

test('controls run the timer, pause, restart, edit the highest count, and release timers on unmount', async () => {
  const vote = useTableNominationStore();
  vote.begin(0, seats(), 500);
  const wrapper = mount(TableNominationControls, { global: { stubs: { ClockDial: true, 'font-awesome-icon': true } } });
  const button = (label: string) => wrapper.findAll('button').find(node => node.text().trim() === label)!;
  await button('倒计时').trigger('click');
  await vi.advanceTimersByTimeAsync(3000);
  expect(vote.phase).toBe('voting');
  await button('暂停').trigger('click');
  await vi.advanceTimersByTimeAsync(5000);
  expect(vote.locked).toBe(0);
  await button('继续').trigger('click');
  await vi.advanceTimersByTimeAsync(2000);
  expect(vote.phase).toBe('complete');
  await button('重新开始').trigger('click');
  expect(vote.phase).toBe('ready');
  await wrapper.find('[title="修改最高票数"]').trigger('click');
  await wrapper.find('input[type="number"]').setValue(3);
  await wrapper.find('form').trigger('submit');
  expect(vote.highestVotes).toBe(3);
  wrapper.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

test('the brass long hand counts clockwise, freezes on pause and reaches the nominee without restoring yellow decorations', async () => {
  const vote = useTableNominationStore();
  vote.begin(0, seats(), 500);
  vote.selectSeat(1, 'nominee');
  const wrapper = mount(TableNominationControls, { global: { stubs: { 'font-awesome-icon': true } } });
  const angle = () => wrapper.get('.clock-dial__hand--minute').attributes('style');
  try {
    expect(angle()).toContain('--hand-deg: 0deg');
    vote.start();
    await flushPromises();
    expect(angle()).toContain('--hand-deg: 90deg');
    await vi.advanceTimersByTimeAsync(250);
    const midAngle = Number(/--hand-deg: ([\d.]+)deg/.exec(angle()!)![1]);
    expect(midAngle).toBeGreaterThan(120);
    expect(midAngle).toBeLessThan(150);
    await vi.advanceTimersByTimeAsync(250);
    expect(angle()).toContain('--hand-deg: 180deg');
    vote.togglePause();
    await vi.advanceTimersByTimeAsync(5000);
    expect(angle()).toContain('--hand-deg: 180deg');
    vote.togglePause();
    await vi.advanceTimersByTimeAsync(500);
    expect(angle()).toContain('--hand-deg: 270deg');
    await vi.advanceTimersByTimeAsync(500);
    expect(angle()).toContain('--hand-deg: 360deg');
    await vi.advanceTimersByTimeAsync(500);
    expect(vote.phase).toBe('complete');
    expect(angle()).toContain('--hand-deg: 450deg');
    expect(wrapper.get('.clock-dial__hand--hour').attributes('style')).toContain('--hand-deg: 90deg');
    expect([vote.nominator, vote.nominee]).toEqual([0, 1]);
    expect(wrapper.find('.clock-dial__hand--sweep, .clock-dial__hand--trail, .clock-dial__countdown, .clock-dial__tick-flash').exists()).toBe(false);
  } finally {
    wrapper.unmount();
  }
});

test('the online brass hand follows the authoritative voting seat while drafts still preview the nominator', () => {
  const context = { nominationStage: '', dialNominatorSeat: 4,
    realtimeVoteStore: { isActive: false, currentVoterSeat: null as number | null } };
  expect(TownSquare.computed.dialMinuteSeat.call(context)).toBe(4);
  context.realtimeVoteStore = { isActive: true, currentVoterSeat: 7 };
  expect(TownSquare.computed.dialMinuteSeat.call(context)).toBe(7);
  context.realtimeVoteStore.currentVoterSeat = 1;
  expect(TownSquare.computed.dialMinuteSeat.call(context)).toBe(1);
  context.nominationStage = 'confirm';
  expect(TownSquare.computed.dialMinuteSeat.call(context)).toBe(4);
});

test('local tables open manual self-nomination and route clicks to that counter', async () => {
  const vote = useTableNominationStore();
  const context = {
    players: [{ id: '' }, { id: '', isDead: true, isVoteless: true }], actionSeatIndex: 1, seatActionPending: '',
    canSelfNominateActionSeat: true, canManualNominate: true, tableNomination: vote,
    closeSeatActions: vi.fn(), grimoire: { voteDuration: 500 },
    gameController: { startVote: vi.fn() }, isApiRoom: false, manualNominationOpen: true,
  };
  expect(TownSquare.computed.canSelfNominateActionSeat.call({ ...context, actionPlayer: context.players[1] })).toBe(true);
  await TownSquare.methods.handleRoleTokenAction.call(context, 'nominate-self');
  expect(vote.open).toBe(true);
  expect([vote.nominator, vote.nominee]).toEqual([1, 1]);
  expect(context.gameController.startVote).not.toHaveBeenCalled();
  await TownSquare.methods.handleTableTokenClick.call({ ...context, seatEditor: { open: false } }, 0, {});
  expect(vote.votes[0]).toBe(true);
});

test('local fallback nomination actions open the manual ballot instead of committing a nomination immediately', async () => {
  const vote = useTableNominationStore();
  const commitNomination = vi.fn();
  const context = tokenContext({ canManualNominate: false, canNominate: true, tableNomination: vote,
    updateLocalNomination: commitNomination, cancel: vi.fn() });

  await TownSquare.methods.handleTableTokenClick.call(context, 1, {});
  expect(vote.open).toBe(true);
  expect([vote.nominator, vote.nominee]).toEqual([0, 1]);
  expect(vote.phase).toBe('ready');
  expect(commitNomination).not.toHaveBeenCalled();

  vote.close();
  context.canNominate = true;
  context.session = { claimedSeat: 1 };
  context.closeSeatActions = vi.fn();
  context.players = [{ id: '' }, { id: '' }, { id: '' }];
  context.grimoire = { voteDuration: 500 };
  context.isApiRoom = false;
  await TownSquare.methods.startNominationFromSelf.call(context);
  expect(vote.open).toBe(true);
  expect(vote.nominator).toBe(1);
  expect(vote.selecting).toBe('nominee');
  expect(commitNomination).not.toHaveBeenCalled();
});

test('connected player tables cannot enter manual mode and token selection uses the online nomination draft', async () => {
  expect(TownSquare.computed.canManualNominate.call({
    canManageActionSeat: true, seatEditor: { open: false }, realtimeVoteStore: { isActive: false },
    isApiRoom: true, players: [{ id: 'real-player' }, { id: '' }],
  })).toBe(false);
  const select = vi.fn();
  await TownSquare.methods.handleTableTokenClick.call({ seatEditor: { open: false }, nominationStage: 'nominee', handleNominationSeatClick: select }, 1, {});
  expect(select).toHaveBeenCalledWith(1);
});

function tokenContext(overrides = {}) {
  const context = {
    players: [{ id: '' }, { id: '' }, { id: '' }],
    actionSeatMode: 'token', actionSeatIndex: 0, roleMenuAnchor: null,
    swap: -1, seatEditor: { open: false }, seatActionPending: '', nominationStage: '',
    tableNomination: useTableNominationStore(), canManageActionSeat: true, canManualNominate: true,
    isApiRoom: false, grimoire: { voteDuration: 500 },
    session: { nomination: false },
    gameStore: { level: 'day' }, gameController: { isConnected: true, startVote: vi.fn() },
    realtimeVoteStore: { isActive: false, dayNominationState: null, hide: vi.fn() },
    hasEligibleNominee: true,
    openSeatActions: vi.fn(),
    ...overrides,
  };
  Object.defineProperties(context, {
    actionPlayer: { get: () => context.players[context.actionSeatIndex] },
    canNominateFromToken: { get: () => TownSquare.computed.canNominateFromToken.call(context) },
    votePresentation: { get: () => TownSquare.computed.votePresentation.call(context) },
    manualNominationOpen: { get: () => TownSquare.computed.manualNominationOpen.call(context) },
  });
  for (const name of ['canNominateTokenSeat', 'isTokenNominationTarget', 'closeSeatActions', 'startRealtimeVote', 'handleNominationSeatClick']) {
    context[name] = TownSquare.methods[name].bind(context);
  }
  return context;
}

test('empty online seats use the same public nomination draft during preparation', async () => {
  const context = tokenContext({ isApiRoom: true, canManualNominate: false,
    gameStore: { currentIsDm: true, level: 'prepare' } });
  expect(TownSquare.computed.canManualNominate.call(context)).toBe(false);
  await TownSquare.methods.handleTableTokenClick.call(context, 1, {});
  expect(context.nominationStage).toBe('confirm');
  expect([context.nominationNominatorIndex, context.nominationNomineeIndex]).toEqual([0, 1]);
  expect(context.manualNominationOpen).toBe(false);
  expect(context.tableNomination.open).toBe(false);
});

test('pressing another hand preserves the source through outside pointerdown and starts that nomination', async () => {
  const context = tokenContext();
  const table = document.createElement('main');
  table.className = 'reference-table';
  table.innerHTML = '<button id="source"></button><button data-nomination-target="1"><svg></svg></button>';
  document.body.append(table);
  context.roleMenuAnchor = table.querySelector('#source');
  const wrapper = mount(RoleTokenMenu, {
    attachTo: document.body,
    props: { anchor: context.roleMenuAnchor, seatIndex: 0, canEdit: true, canChangeAlignment: false,
      canNominate: true, showNominate: true, pending: false,
      isInteractionTarget: context.isTokenNominationTarget, onClose: context.closeSeatActions },
    global: { stubs: { 'font-awesome-icon': true } },
  });
  try {
    await flushPromises();
    const target = table.querySelector('svg')!;
    target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await flushPromises();
    expect(context.actionSeatIndex).toBe(0);
    table.querySelector('[data-nomination-target]')!.addEventListener('click', event => {
      void TownSquare.methods.handleTableTokenClick.call(context, 1, event);
    });
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(context.tableNomination.open).toBe(true);
    expect([context.tableNomination.nominator, context.tableNomination.nominee]).toEqual([0, 1]);
    expect(context.openSeatActions).not.toHaveBeenCalled();
    expect(context.gameController.startVote).not.toHaveBeenCalled();
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(wrapper.emitted('close')).toHaveLength(1);
  } finally {
    wrapper.unmount();
    table.remove();
  }
});

test('online hand selection pre-fills the two players and waits for confirmation', async () => {
  const context = tokenContext({ isApiRoom: true, canManualNominate: false, players: [{ id: 'one' }, { id: 'two' }] });
  await TownSquare.methods.handleTableTokenClick.call(context, 1, {});
  expect(context.nominationStage).toBe('confirm');
  expect([context.nominationNominatorIndex, context.nominationNomineeIndex]).toEqual([0, 1]);
  expect(context.gameController.startVote).not.toHaveBeenCalled();
  expect(context.tableNomination.open).toBe(false);
});

test.each([
  { gameStore: { level: 'night' } },
  { gameController: { isConnected: false } },
  { canManageActionSeat: false },
  { seatActionPending: 'update' },
  { realtimeVoteStore: { isActive: true } },
  { realtimeVoteStore: { isActive: false, dayNominationState: { finalized: true } } },
])('unavailable sources cannot nominate through another token: %j', overrides => {
  const context = tokenContext({ isApiRoom: true, canManualNominate: false, players: [{ id: 'one' }, { id: 'two' }], ...overrides });
  expect(context.canNominateTokenSeat(1)).toBe(false);
});

test('hands allow repeated nominations, empty seats and dead targets while self-nomination uses its menu action', () => {
  const context = tokenContext({ isApiRoom: true, canManualNominate: false,
    players: [{ id: 'one' }, { id: 'two', isDead: true }, { id: '' }, { id: 'used' }, { id: 'valid' }],
    realtimeVoteStore: { isActive: false, dayNominationState: { finalized: false, nominations: [
      { nominatorUserId: 'one', nomineeUserId: 'used' },
      { nominatorUserId: 'used', nomineeUserId: 'one' },
    ] } },
  });
  expect(context.canNominateFromToken).toBe(true);
  expect([0, 1, 2, 3, 4].map(index => context.canNominateTokenSeat(index))).toEqual([false, true, true, true, true]);
});

test.each([
  { isApiRoom: true, deadTarget: false }, { isApiRoom: false, deadTarget: false },
  { isApiRoom: true, deadTarget: true }, { isApiRoom: false, deadTarget: true },
])('dead sources can nominate during a room timer: %j', async ({ isApiRoom, deadTarget }) => {
  const context = tokenContext({ isApiRoom, canManualNominate: !isApiRoom,
    players: [{ id: 'one', isDead: true, isVoteless: true }, { id: 'two', isDead: deadTarget, isVoteless: deadTarget }],
    gameStore: { level: 'day', roomTimer: { status: 'running', blockNominations: true, endsAt: Date.now() + 60000 } },
  });
  expect(context.canNominateFromToken).toBe(true);
  expect(context.canNominateTokenSeat(1)).toBe(true);
  await TownSquare.methods.handleTableTokenClick.call(context, 1, {});
  if (isApiRoom) {
    expect(context.nominationStage).toBe('confirm');
    expect([context.nominationNominatorIndex, context.nominationNomineeIndex]).toEqual([0, 1]);
  } else {
    expect(context.tableNomination.open).toBe(true);
    expect([context.tableNomination.nominator, context.tableNomination.nominee]).toEqual([0, 1]);
  }
});

test('a running room timer does not disable local nomination entry', () => {
  expect(TownSquare.computed.canManualNominate.call({
    demoStore: { active: true, level: 'day', roomTimer: { status: 'running', blockNominations: true, endsAt: Date.now() + 60000 } },
    isApiRoom: false, canManageActionSeat: true, seatEditor: { open: false },
    realtimeVoteStore: { isActive: false }, grimoire: { isNight: false },
    session: { nomination: false }, players: seats(),
  })).toBe(true);
});

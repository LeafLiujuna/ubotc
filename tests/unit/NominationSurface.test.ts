import { beforeEach, expect, test, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import NominationSurface from '@/components/NominationSurface.vue';
import TownSquare from '@/components/TownSquare.vue';
import { useSessionStore } from '@/stores/session';
import { useRealtimeVoteStore } from '@/stores/realtimeVote';
import { useTableNominationStore } from '@/stores/tableNomination';

beforeEach(() => setActivePinia(createPinia()));
function create(online = true) {
  const session = useSessionStore();
  if (online) { session.sessionId = 'room'; session.gameServerId = 'server'; }
  const realtime = useRealtimeVoteStore();
  const manual = useTableNominationStore();
  const wrapper = mount(NominationSurface, { props: { draftActive: false }, global: {
    stubs: { RoomNominationControls: true, Vote: true },
  } });
  const context = { get isApiRoom() { return Boolean(session.sessionId && session.gameServerId); },
    session, tableNomination: manual, realtimeVoteStore: realtime, nominationStage: '' };
  const presentation = () => TownSquare.computed.votePresentation.call(context);
  return { session, realtime, manual, wrapper, presentation, context };
}

test('online rooms ignore leftover manual and legacy nominations and render one online panel', async () => {
  const { session, realtime, manual, wrapper, presentation } = create();
  manual.begin(0, [{}, {}]);
  session.setNomination([0, 1]);
  realtime.phase = 'voting'; realtime.isVisible = true;
  await nextTick();
  expect(presentation()).toBe('online');
  expect(wrapper.findAll('room-nomination-controls-stub')).toHaveLength(1);
  expect(wrapper.find('vote-stub').exists()).toBe(false);
  realtime.hide();
  await nextTick();
  expect(presentation()).toBe('idle');
  expect(wrapper.find('vote-stub').exists()).toBe(false);
  wrapper.unmount();
});

test('online empty seats always retain the public online panel', async () => {
  const { realtime, manual, wrapper, presentation } = create();
  manual.begin(0, [{}, {}]);
  realtime.phase = 'voting'; realtime.isVisible = true;
  await nextTick();
  expect(presentation()).toBe('online');
  expect(wrapper.find('room-nomination-controls-stub').exists()).toBe(true);
  realtime.phase = 'voting'; realtime.isVisible = true;
  await nextTick();
  expect(presentation()).toBe('online');
  expect(wrapper.findAll('room-nomination-controls-stub')).toHaveLength(1);
  wrapper.unmount();
});

test('a local manual round owns the table and suppresses floating panels and the legacy dial', async () => {
  const { session, realtime, manual, wrapper, presentation } = create(false);
  manual.begin(0, [{}, {}]);
  session.setNomination([0, 1]);
  realtime.phase = 'voting'; realtime.isVisible = true;
  await nextTick();
  expect(presentation()).toBe('manual');
  expect(wrapper.find('vote-stub').exists()).toBe(false);
  expect(wrapper.find('room-nomination-controls-stub').exists()).toBe(false);
  manual.close();
  await nextTick();
  expect(presentation()).toBe('legacy');
  expect(wrapper.findAll('vote-stub')).toHaveLength(1);
  expect(wrapper.find('room-nomination-controls-stub').exists()).toBe(false);
  wrapper.unmount();
});

test('late day-ledger updates cannot reopen a panel over seat selection or confirmation', async () => {
  const { realtime, wrapper, context, presentation } = create();
  context.nominationStage = 'confirm';
  await wrapper.setProps({ draftActive: true });
  realtime.syncDayNominationState({ levelDays: 2, nominations: [{ nominationId: 'old' }],
    tiedCandidateUserIds: [] } as never);
  await nextTick();
  expect(presentation()).toBe('draft');
  expect(wrapper.find('room-nomination-controls-stub').exists()).toBe(false);
  realtime.phase = 'voting'; realtime.isVisible = true;
  await nextTick();
  expect(presentation()).toBe('online');
  expect(wrapper.findAll('room-nomination-controls-stub')).toHaveLength(1);
  wrapper.unmount();
});

test('an online draft receives seat clicks even when an obsolete manual round remains open', async () => {
  const { manual, context, presentation, wrapper } = create();
  manual.begin(0, [{}, {}]);
  context.nominationStage = 'nominee';
  const select = vi.fn();
  const clickContext = { ...context, manualNominationOpen: presentation() === 'manual',
    handleNominationSeatClick: select, players: [{ id: 'one' }, { id: 'two' }] };
  await TownSquare.methods.handleTableTokenClick.call(clickContext, 1, {});
  await TownSquare.methods.handleTableSeatClick.call(clickContext, 0);
  expect(select.mock.calls).toEqual([[1], [0]]);
  expect(manual.votes).toEqual([false, false]);
  wrapper.unmount();
});

test('switching into an online room immediately suppresses legacy and manual surfaces', async () => {
  const { session, manual, wrapper, presentation } = create(false);
  manual.begin(0, [{}, {}]);
  session.setNomination([0, 1]);
  session.sessionId = 'room'; session.gameServerId = 'server';
  await nextTick();
  expect(presentation()).toBe('idle');
  expect(wrapper.find('vote-stub').exists()).toBe(false);
  expect(wrapper.find('room-nomination-controls-stub').exists()).toBe(false);
  wrapper.unmount();
});

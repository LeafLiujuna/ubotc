import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { shallowMount, flushPromises } from '@vue/test-utils';
import { usePlayerViewStore } from '@/stores/playerView';
import { useSessionStore } from '@/stores/session';
import { useUserStore } from '@/stores/user';
import { usePlayersStore } from '@/stores/players';
import { useGameStore } from '@/stores/game';
import { useAppStore } from '@/stores/app';
import { useGameController } from '@/controllers/GameController';
import RoleModal from '@/components/modals/RoleModal.vue';
import Token from '@/components/Token.vue';
import TownSquare from '@/components/TownSquare.vue';
import type { Player } from '@/types/domain';

const roster = () => [{ id: 'one', name: '甲', role: { id: 'chef' }, reminders: [], stReminders: [], isDead: false },
  { id: 'two', name: '乙', role: { id: '' }, reminders: [], stReminders: [], isDead: false }] as unknown as Player[];
function identity(userId = 'me', room = 'ROOM') {
  useUserStore().setCurrentUser({ id: userId } as never);
  useSessionStore().setApiRoomSession({ roomId: room, gameServerId: 'server' });
}
beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()); identity(); window.$toast = { error: vi.fn(), warning: vi.fn() } as never; });
afterEach(() => vi.restoreAllMocks());

test('local role, alignment, and reminders survive reload and server refresh without changing authoritative players', () => {
  const seats = roster();
  const view = usePlayerViewStore();
  view.setRole(seats[1], 1, { id: 'imp', alignment: 'good' });
  view.setReminders(seats[1], 1, [{ role: 'poisoner', name: '中毒' }]);
  expect(seats[1]).toMatchObject({ role: { id: '' }, reminders: [] });
  view.$dispose();
  setActivePinia(createPinia()); identity();
  const next = usePlayerViewStore().project(roster());
  expect(next[1]).toMatchObject({ role: { id: 'imp', alignment: 'good' }, reminders: [{ name: '中毒' }] });
  const refreshed = roster(); refreshed[1].isDead = true;
  expect(usePlayerViewStore().project(refreshed)[1]).toMatchObject({ isDead: true, role: { id: 'imp' } });
  expect(refreshed[1].role.id).toBe('');
});

test('a storyteller role delivery supersedes a stale local grimoire role mark', () => {
  const seats = roster(), view = usePlayerViewStore();
  view.setRole(seats[0], 0, { id: 'imp' });

  // The note belongs to the previous authoritative role (chef), so a newly
  // delivered role must be visible even though the local note is still saved.
  const delivered = [{ ...seats[0], role: { id: 'poisoner' } }, seats[1]];
  expect(view.project(delivered)[0].role.id).toBe('poisoner');

  // Refreshes that still carry the source role continue to show the note.
  expect(view.project(seats)[0].role.id).toBe('imp');
});

test('legacy notes without a source role also yield to a delivered role', () => {
  const view = usePlayerViewStore();
  const key = view.notebookKey;
  localStorage.setItem(key, JSON.stringify({
    rolesCleared: false,
    seatsCleared: false,
    notes: { 'user:one': { role: { id: 'imp' } } },
  }));
  view.$dispose();
  setActivePinia(createPinia()); identity();
  const loaded = usePlayerViewStore();
  expect(loaded.project([{ ...roster()[0], role: { id: 'poisoner' } }])[0].role.id).toBe('poisoner');
});

test('notes follow the occupant when seats move, and rooms/accounts cannot read each other’s notebook', () => {
  const seats = roster(), view = usePlayerViewStore();
  view.setRole(seats[1], 1, { id: 'imp' });
  expect(view.project([seats[1], seats[0]])[0].role.id).toBe('imp');
  identity('me', 'OTHER'); expect(view.project(seats)[1].role.id).toBe('');
  identity('another', 'ROOM'); expect(view.project(seats)[1].role.id).toBe('');
  identity(); expect(view.project(seats)[1].role.id).toBe('imp');
});

test('clearing notes stays local and newly entered notes display after clearing', () => {
  const seats = roster(), view = usePlayerViewStore();
  view.setRole(seats[1], 1, { id: 'imp' }); view.clearRoles();
  expect(view.project(seats).map(player => player.role.id)).toEqual(['', '']);
  view.setRole(seats[0], 0, { id: 'monk' });
  expect(view.project(seats).map(player => player.role.id)).toEqual(['monk', '']);
  expect(seats[0].role.id).toBe('chef');
});

test('invalid storage and unavailable storage do not prevent using personal notes', () => {
  const view = usePlayerViewStore(), seats = roster();
  const savedKey = view.notebookKey;
  identity('me', 'OTHER');
  localStorage.setItem(savedKey, '{bad json');
  identity();
  expect(view.project(seats)[0].role.id).toBe('chef');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(() => view.setRole(seats[0], 0, { id: 'monk' })).not.toThrow();
  expect(view.project(seats)[0].role.id).toBe('monk');
});

test('a custom reminder completed after switching rooms cannot write into the new notebook', async () => {
  const seats = roster(), view = usePlayerViewStore();
  let resolve: (name: string) => void = () => {};
  const context = { isPersonalGrimoire: true, canManageActionSeat: false, players: seats,
    resolveReminderName: () => new Promise<string>(done => { resolve = done; }) };
  const pending = TownSquare.methods.addApiReminder.call(context, 1, { role: 'custom' });
  identity('me', 'OTHER'); resolve('自定义'); await pending;
  expect(view.project(seats)[1].reminders).toEqual([]);
  identity(); expect(view.project(seats)[1].reminders).toEqual([]);
});

test('restores valid fields from a partially damaged notebook and ignores malformed seat notes', () => {
  const view = usePlayerViewStore(), key = view.notebookKey;
  identity('me', 'OTHER');
  localStorage.setItem(key, JSON.stringify({
    rolesCleared: 'true', seatsCleared: [], notes: {
      'user:one': { role: { id: 123 }, reminders: [{ name: '中毒' }], sourceRoleId: [] },
      'user:two': { role: { id: 'imp' }, reminders: 'invalid' },
      'seat:2': null, 'seat:3': [], invalid: { role: { id: 'monk' } },
    },
  }));
  identity();
  expect(view.project(roster())[0]).toMatchObject({ role: { id: 'chef' }, reminders: [{ name: '中毒' }] });
  expect(view.project(roster())[1]).toMatchObject({ role: { id: 'imp' }, reminders: [] });
  expect(view.seatsCleared).toBe(false);
  view.setReminders(roster()[1], 1, [{ name: '安全' }]);
  const saved = JSON.parse(localStorage.getItem(key)!);
  expect(Object.keys(saved.notes)).toEqual(['user:one', 'user:two']);
});

test.each([
  [0, '常规阵营', undefined],
  [1, '善良阵营', 'good'],
  [2, '邪恶阵营', 'evil'],
] as const)('player picker previews and locally saves alignment after %i clicks', async (clicks, label, alignment) => {
  const players = usePlayersStore(); players.set(roster());
  useGameStore().currentPlayer = { isDM: false, userId: 'me', seat: 1 } as never;
  const app = useAppStore(); app.roles = new Map([
    ['imp', { id: 'imp', name: '小恶魔', team: 'demon', alignment: 'good' }],
    ['chef', { id: 'chef', name: '厨师', team: 'townsfolk' }],
  ]); app.toggleModal('role');
  const controller = useGameController();
  const update = vi.spyOn(controller, 'updatePlayer'); const refresh = vi.spyOn(controller, 'refreshGameState');
  const wrapper = shallowMount(RoleModal, { props: { playerIndex: 1 }, global: { stubs: { Modal: { template: '<div><slot /></div>' }, 'font-awesome-icon': true } } });
  try {
    expect(wrapper.find('.role-local-notice').exists()).toBe(false);
    expect(wrapper.get('.role-alignment-toggle').text()).toBe('常规阵营');
    for (let i = 0; i < clicks; i++) await wrapper.get('.role-alignment-toggle').trigger('click');
    expect(wrapper.get('.role-alignment-toggle').text()).toBe(label);
    const previews = wrapper.findAllComponents(Token).map(token => token.props('role'));
    expect(previews).toEqual([
      { id: 'chef', name: '厨师', team: 'townsfolk', ...(alignment ? { alignment } : {}) },
      { id: 'imp', name: '小恶魔', team: 'demon', ...(alignment ? { alignment } : {}) },
      {},
    ]);
    expect(app.roles.get('imp')?.alignment).toBe('good');
    await wrapper.get('[aria-label="小恶魔"]').trigger('click'); await flushPromises();
    const savedRole = usePlayerViewStore().project(players.players)[1].role;
    expect(savedRole.id).toBe('imp');
    expect(savedRole.alignment).toBe(alignment);
    expect(wrapper.emitted('role-selected')?.[0]).toEqual([{ playerIndex: 1, role: savedRole }]);
    expect(players.players[1].role.id).toBe('');
    expect(update).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled();
  } finally { wrapper.unmount(); }
});

test('alignment cycles through all three modes and resets on reopening or changing seats', async () => {
  const players = usePlayersStore(); players.set(roster());
  usePlayerViewStore().setRole(players.players[1], 1, { id: 'imp', alignment: 'evil' });
  const app = useAppStore(); app.roles = new Map([['imp', { id: 'imp', name: '小恶魔', team: 'demon' }]]); app.toggleModal('role');
  const wrapper = shallowMount(RoleModal, { props: { playerIndex: 1 }, global: { stubs: { Modal: { template: '<div><slot /></div>' }, 'font-awesome-icon': true } } });
  try {
    const toggle = () => wrapper.get('.role-alignment-toggle');
    expect(toggle().text()).toBe('常规阵营');
    for (const label of ['善良阵营', '邪恶阵营', '常规阵营', '善良阵营']) {
      await toggle().trigger('click'); expect(toggle().text()).toBe(label);
    }
    await wrapper.get('[aria-label="关闭角色选择"]').trigger('click');
    app.toggleModal('role'); await flushPromises();
    expect(toggle().text()).toBe('常规阵营');
    await toggle().trigger('click');
    await wrapper.setProps({ playerIndex: 0 });
    expect(toggle().text()).toBe('常规阵营');
  } finally { wrapper.unmount(); }
});

test('player token opens role dialog directly while night selection retains its action', async () => {
  const context = { isPersonalGrimoire: true, players: roster(), swap: -1, reminderPickerSeat: 1,
    actionSeatMode: 'token', actionSeatIndex: 1, closeSeatActions: vi.fn(), openRoleModal: vi.fn(), openSeatActions: vi.fn(),
    nightPlayerSelection: { active: false, choose: vi.fn() } };
  await TownSquare.methods.handleTableTokenClick.call(context, 1, {});
  expect(context.closeSeatActions).toHaveBeenCalledOnce();
  expect(context.openRoleModal).toHaveBeenCalledWith(1);
  expect(context.openSeatActions).not.toHaveBeenCalled();
  context.nightPlayerSelection.active = true;
  await TownSquare.methods.handleTableTokenClick.call(context, 0, {});
  expect(context.nightPlayerSelection.choose).toHaveBeenCalledWith(0);
  expect(context.openRoleModal).toHaveBeenCalledOnce();
});

test('player reminders and alignment never invoke authoritative seat actions', async () => {
  const seats = roster(), view = usePlayerViewStore();
  const context = { isPersonalGrimoire: true, canManageActionSeat: false, players: seats,
    resolveReminderName: vi.fn().mockResolvedValue('中毒'), reminderPickerSeat: 1,
    actionSeatIndex: 1, seatActionPending: '', canChangeTokenAlignment: true,
    actionTokenRole: { id: 'imp', team: 'demon' }, closeSeatActions: vi.fn(),
    runSeatAction: vi.fn(), gameController: { updatePlayer: vi.fn() } };
  await TownSquare.methods.addApiReminder.call(context, 1, { name: '中毒' });
  expect(view.project(seats)[1].reminders).toEqual([{ name: '中毒' }]);
  await TownSquare.methods.handleRoleTokenAction.call(context, 'alignment');
  expect(view.project(seats)[1].role).toMatchObject({ id: 'imp', alignment: 'good' });
  await TownSquare.methods.removeApiReminder.call({ ...context, players: view.project(seats) }, 1, '中毒');
  expect(view.project(seats)[1].reminders).toEqual([]);
  expect(context.runSeatAction).not.toHaveBeenCalled(); expect(context.gameController.updatePlayer).not.toHaveBeenCalled();
});

test('public storyteller list uses public membership/profile fields without private role data', () => {
  useUserStore().cachedUsers.dm = { id: 'dm', displayName: '说书人甲', avatarUrl: '/avatar.png' } as never;
  const result = TownSquare.computed.publicStorytellers.call({ gameStore: { dms: { dm: { privateExtras: { storytellerRole: 'secret' } } }, roomUsers: {} } });
  expect(result).toEqual([{ userId: 'dm', name: '说书人甲', avatar: '/avatar.png' }]);
});

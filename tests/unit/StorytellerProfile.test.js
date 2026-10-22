// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import StorytellerProfile from '@/components/StorytellerProfile.vue';
import TownSquare from '@/components/TownSquare.vue';
import Menu from '@/components/Menu.vue';
import { useGameController } from '@/controllers/GameController';
import { useUserStore } from '@/stores/user';
import { useGameStore } from '@/stores/game';
import { useSessionStore } from '@/stores/session';
import { usePlayersStore } from '@/stores/players';
import { nextTick } from 'vue';

let wrapper;
beforeEach(() => {
  setActivePinia(createPinia());
  window.$toast = { error: vi.fn(), info: vi.fn() };
});
afterEach(() => { wrapper?.unmount(); wrapper = null; vi.restoreAllMocks(); });

function profile(props = {}) {
  wrapper = shallowMount(StorytellerProfile, {
    props: { name: 'Leaf Liu', avatar: '/avatar.png', reminders: [], isImageOptIn: true, ...props },
    attachTo: document.body,
    global: { stubs: { FontAwesomeIcon: true } },
  });
  return wrapper;
}

describe('storyteller avatar URLs', () => {
  test.each([
    ['/api/avatars/21732235/avatar.jpg', '/api/avatars/21732235/avatar.jpg'],
    ['https://example.com/avatar.jpg', 'https://example.com/avatar.jpg'],
    ['http://example.com/avatar.jpg', 'http://example.com/avatar.jpg'],
    ['avatar.webp', 'https://botcgrimoire.top/avatars/avatar.webp'],
  ])('resolves the storyteller avatar %s', (stImage, expected) => {
    const players = usePlayersStore();
    players.setFabled({ fabled: [], stImage });
    expect(players.fabled[0].image).toBe(expected);
  });

  test('uses the default storyteller portrait when the session avatar is default', () => {
    useSessionStore().playerAvatar = 'default.webp';
    const players = usePlayersStore();
    players.setFabled({ fabled: [] });
    expect(players.fabled[0].image).toBe('https://botcgrimoire.top/avatars/default_storyteller.webp');
  });
});

describe('storyteller portrait menu', () => {
  test('players see the public storyteller portrait without private tokens or management actions', async () => {
    const view = profile({ canManage: false, role: { id: 'imp', name: '小恶魔' }, reminders: [{ id: 'poison', name: '中毒' }] });
    expect(view.text()).toContain('Leaf Liu');
    const portrait = view.get('[aria-label="说书人：Leaf Liu"]');
    expect(portrait.attributes('aria-haspopup')).toBeUndefined();
    await portrait.trigger('click');
    expect(view.find('[role="menu"]').exists()).toBe(false);
    expect(view.find('.storyteller-profile__tokens').exists()).toBe(false);
    expect(view.emitted('action')).toBeUndefined();
  });
  test('offers the three video actions and closes after choosing one', async () => {
    const view = profile();
    await view.get('[aria-label="说书人操作"]').trigger('click');
    expect(view.findAll('[role="menuitem"]').map((item) => item.text()))
      .toEqual(['改变角色', '添加提示标记', '移除说书人']);
    await view.findAll('[role="menuitem"]')[2].trigger('click');
    expect(view.emitted('action')).toEqual([['remove']]);
    expect(view.find('[role="menu"]').exists()).toBe(false);
  });
  test('supports keyboard navigation, Escape focus restoration and outside dismissal', async () => {
    const view = profile();
    const trigger = view.get('[aria-label="说书人操作"]');
    await trigger.trigger('click');
    expect(document.activeElement.textContent).toBe('改变角色');
    await view.get('[role="menu"]').trigger('keydown', { key: 'End' });
    expect(document.activeElement.textContent).toBe('移除说书人');
    await view.get('[role="menu"]').trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement.textContent).toBe('改变角色');
    await view.get('[role="menu"]').trigger('keydown', { key: 'Escape' });
    expect(document.activeElement).toBe(trigger.element);
    await trigger.trigger('click');
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await view.vm.$nextTick();
    expect(view.find('[role="menu"]').exists()).toBe(false);
  });
  test('removes a reminder without opening the portrait menu', async () => {
    const view = profile({ reminders: [{ id: 'good', role: 'good', name: '善良' }] });
    await view.get('[aria-label="移除说书人提示：善良"]').trigger('click');
    expect(view.emitted('removeReminder')).toEqual([['善良']]);
    expect(view.find('[role="menu"]').exists()).toBe(false);
  });
});

describe('room storyteller portraits', () => {
  function roomProfiles(isDm = true) {
    useUserStore().setCurrentUser({ id: 'self', displayName: '主持人甲' });
    useUserStore().cachedUsers.other = { id: 'other', displayName: '主持人乙', avatarUrl: '/other.png' };
    useSessionStore().setApiRoomSession({ roomId: 'ROOM', gameServerId: 'server' });
    const game = useGameStore();
    game.currentPlayer = { userId: 'self', isDM: isDm };
    game.dms = {
      ...(isDm ? { self: game.currentPlayer } : {}),
      other: { userId: 'other', isDM: true, privateExtras: { storytellerRole: { id: 'imp' } }, marks: ['中毒'] },
    };
    wrapper = shallowMount(TownSquare, { global: { stubs: { FontAwesomeIcon: true } } });
    return { game, profiles: () => wrapper.findAllComponents(StorytellerProfile) };
  }

  test('storytellers see each colleague once and the roster follows additions and removals', async () => {
    const { game, profiles } = roomProfiles();
    expect(profiles()).toHaveLength(2);
    expect(profiles()[1].props()).toMatchObject({ name: '主持人乙', avatar: '/other.png', canManage: false, reminders: [] });
    expect(profiles()[1].props('role')).toBeUndefined();
    expect(profiles()[0].props('canManage')).toBe(true);

    game.updateRoomUser({ userId: 'third', displayName: '主持人丙' });
    game.updatePlayer('third', { userId: 'third', isDM: true });
    await nextTick();
    expect(profiles()).toHaveLength(3);
    expect(profiles()[2].props('name')).toBe('主持人丙');

    game.deletePlayer('other');
    await nextTick();
    expect(profiles()).toHaveLength(2);
    expect(profiles().some(profile => profile.props('name') === '主持人乙')).toBe(false);
  });

  test('players and observers retain the complete public roster during the reveal', async () => {
    const { game, profiles } = roomProfiles(false);
    expect(profiles()).toHaveLength(1);
    expect(profiles()[0].props('canManage')).toBe(false);
    game.grimoireReveal = { id: 'reveal', revealedUserIds: [] };
    await nextTick();
    expect(profiles()).toHaveLength(1);
    expect(profiles()[0].props('name')).toBe('主持人乙');
  });
});

describe('storyteller actions use authoritative room state', () => {
  test('unassigns the storyteller on the server and then refreshes', async () => {
    const request = vi.fn().mockResolvedValue({ status: 200 });
    const refreshGameState = vi.fn().mockResolvedValue({ status: 200 });
    const context = { isStoryteller: true, isApiRoom: true, storytellerPending: false,
      gameController: { request, refreshGameState } };
    await TownSquare.methods.removeStoryteller.call(context);
    expect(request).toHaveBeenCalledWith('dmLeave');
    expect(refreshGameState).toHaveBeenCalledOnce();
    expect(context.storytellerPending).toBe(false);
  });
  test('failed removal leaves the profile active and displays the server error', async () => {
    const context = { isStoryteller: true, isApiRoom: true, storytellerPending: false,
      gameController: { request: vi.fn().mockRejectedValue(new Error('连接已断开')), refreshGameState: vi.fn() } };
    await TownSquare.methods.removeStoryteller.call(context);
    expect(context.isStoryteller).toBe(true);
    expect(context.gameController.refreshGameState).not.toHaveBeenCalled();
    expect(window.$toast.error).toHaveBeenCalledWith('连接已断开');
    expect(context.storytellerPending).toBe(false);
  });
  test('only a storyteller can remove or save a profile', async () => {
    const context = { isStoryteller: false, gameController: { request: vi.fn(), updatePlayer: vi.fn() } };
    await TownSquare.methods.removeStoryteller.call(context);
    await TownSquare.methods.saveStorytellerProfile.call(context, { marks: [] });
    expect(context.gameController.request).not.toHaveBeenCalled();
    expect(context.gameController.updatePlayer).not.toHaveBeenCalled();
  });
  test('choosing a role preserves other private player settings', async () => {
    const role = { id: 'imp', name: '小恶魔' };
    const context = { isStoryteller: true, isApiRoom: true, storytellerPending: false,
      gameStore: { currentPlayer: { userId: 'dm1', privateExtras: { customNote: 'keep' } } },
      profileRolePickerOpen: true, saveStorytellerProfile: vi.fn().mockResolvedValue(true) };
    await TownSquare.methods.setStorytellerRole.call(context, role);
    expect(context.saveStorytellerProfile).toHaveBeenCalledWith({ privateExtras: { customNote: 'keep', storytellerRole: role } });
    expect(context.profileRolePickerOpen).toBe(false);
  });
  test('adds storyteller reminders without a claimed seat and retains existing marks', async () => {
    const reminder = { role: 'good', name: '善良' };
    const context = { isStoryteller: true, isApiRoom: true, storytellerPending: false,
      profileReminderRoles: [{ name: '中毒' }], profileReminderPickerOpen: true,
      gameStore: { currentPlayer: { marks: ['中毒'] } },
      resolveReminderName: vi.fn().mockResolvedValue('善良'),
      saveStorytellerProfile: vi.fn().mockResolvedValue(true) };
    await TownSquare.methods.addStorytellerReminder.call(context, reminder);
    expect(context.saveStorytellerProfile).toHaveBeenCalledWith({ marks: ['中毒', '善良'] });
    expect(context.profileReminderPickerOpen).toBe(false);
  });
  test.each([[false, false, 'dmEnter'], [true, false, 'applyDM'], [true, true, 'dmEnter']])('election=%s owner=%s selects the correct server action', async (election, owner, event) => {
      useUserStore().setCurrentUser({ id: 'user1', displayName: 'Leaf Liu' });
      const controller = useGameController();
      const request = vi.spyOn(controller, 'request').mockResolvedValue({ status: 200 });
      const refresh = vi.spyOn(controller, 'refreshGameState').mockResolvedValue({ status: 200 });
      const context = { isApiRoom: true, storytellerPending: false,
        gameStore: { currentIsDm: false, gameConfig: { dmElectionMode: election }, roomUsers: { user1: { isRoomOwner: owner } } },
        toggleMenu: vi.fn() };
      await Menu.methods.becomeStoryteller.call(context);
      expect(request).toHaveBeenCalledWith(event);
      expect(refresh).toHaveBeenCalledOnce();
      expect(context.toggleMenu).toHaveBeenCalledWith(false);
      expect(context.storytellerPending).toBe(false);
    });
});

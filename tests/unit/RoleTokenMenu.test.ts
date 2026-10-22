// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { roleTooltip } from '@/directives/roleTooltip';
import { roleTooltipPosition } from '@/utils/roleTooltipPosition';
import RoleTokenMenu from '@/components/RoleTokenMenu.vue';
import DeathShroud from '@/components/DeathShroud.vue';
import TownSquare from '@/components/TownSquare.vue';
import { roleTokenMenuPosition } from '@/utils/roleTokenMenuPosition';

const mounted: VueWrapper[] = [];

test.each([
  [220, 250, 'left'],
  [1000, 250, 'right'],
  [220, 12, 'left'],
  [1000, 700, 'right'],
])('role tooltip stays beside a token at (%s, %s), with its pointer aimed at the token', (x, y, expectedSide) => {
  const anchor = { left: Number(x), right: Number(x) + 100, top: Number(y), bottom: Number(y) + 100, width: 100, height: 100 };
  const { side, style } = roleTooltipPosition(anchor, { width: 200, height: 100 }, { width: 1440, height: 900 });
  expect(side).toBe(expectedSide);
  const left = parseFloat(style.left), top = parseFloat(style.top);
  expect(left).toBeGreaterThanOrEqual(8);
  expect(left + 200).toBeLessThanOrEqual(1432);
  expect(top + parseFloat(style['--pointer-y'])).toBe(anchor.top + 50);
  if (side === 'left') expect(left + 200).toBe(anchor.left - 12);
  else expect(left).toBe(anchor.right + 12);
});

test('role tooltip flips at screen edges and uses a vertical pointer on narrow screens', () => {
  const anchor = { left: 900, right: 1000, top: 100, bottom: 200, width: 100, height: 100 };
  expect(roleTooltipPosition(anchor, { width: 400, height: 100 }, { width: 1200, height: 800 }).side).toBe('left');
  const narrowAnchor = { left: 140, right: 240, top: 200, bottom: 300, width: 100, height: 100 };
  const narrow = roleTooltipPosition(narrowAnchor, { width: 359, height: 100 }, { width: 375, height: 667 });
  expect(narrow.side).toBe('bottom');
  expect(narrow.style.left).toBe('8px');
  expect(narrow.style.top).toBe('312px');
  expect(parseFloat(narrow.style.left) + parseFloat(narrow.style['--pointer-x'])).toBe(190);
  const lowerAnchor = { ...narrowAnchor, top: 550, bottom: 650 };
  expect(roleTooltipPosition(lowerAnchor, { width: 359, height: 100 }, { width: 375, height: 667 }).side).toBe('top');
});

test('role tooltip shows structured role details and dismisses without removing existing descriptions', async () => {
  vi.useFakeTimers();
  const wrapper = mount({
    directives: { roleTooltip },
    props: ['role'],
    template: '<button v-role-tooltip="role" aria-describedby="seat-help">角色</button>',
  }, {
    attachTo: document.body,
    props: { role: { id: 'klutz', name: '呆瓜', team: 'outsider', ability: '如果你选择邪恶的玩家，你的阵营落败。', flavor: '“哎哟！”' } },
  });
  mounted.push(wrapper);
  try {
    await wrapper.trigger('focus');
    await vi.advanceTimersByTimeAsync(180);
    await flushPromises();
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain('呆瓜');
    expect(document.querySelector('.role-tooltip__heading')?.textContent).toContain('外来者');
    expect(document.querySelector('.role-tooltip__ability')?.textContent).toContain('你的阵营落败');
    expect(document.querySelector('.role-tooltip__flavor')?.textContent).toBe('“哎哟！”');
    expect(wrapper.attributes('aria-describedby')).toMatch(/^seat-help role-tooltip-/);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    expect(wrapper.attributes('aria-describedby')).toBe('seat-help');

    await wrapper.trigger('focus');
    await vi.advanceTimersByTimeAsync(180);
    await wrapper.setProps({ role: null });
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
    await wrapper.trigger('focus');
    await vi.advanceTimersByTimeAsync(180);
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

test('death shroud shows the spent seal and never lets a player change the status', async () => {
  const wrapper = mount(DeathShroud, { props: { dead: true, voteless: false, canEdit: false, seat: 2 } });
  mounted.push(wrapper);
  expect(wrapper.attributes('aria-label')).toContain('保留一张死人票');
  expect(wrapper.find('.death-shroud__spent').exists()).toBe(false);
  await wrapper.trigger('click');
  expect(wrapper.emitted('cycle')).toBeUndefined();
  await wrapper.setProps({ voteless: true });
  expect(wrapper.find('.death-shroud__spent').exists()).toBe(true);
  expect(wrapper.attributes('aria-label')).toContain('死人票已用');
  await wrapper.setProps({ canEdit: true, pending: true });
  expect(wrapper.element.tagName).toBe('BUTTON');
  expect(wrapper.attributes('disabled')).toBeDefined();
  await wrapper.trigger('click');
  expect(wrapper.emitted('cycle')).toBeUndefined();
  await wrapper.setProps({ pending: false });
  await wrapper.trigger('click');
  expect(wrapper.emitted('cycle')).toHaveLength(1);
  await wrapper.setProps({ dead: false, voteless: false });
  expect(wrapper.classes()).toContain('death-shroud--alive');
  expect(wrapper.attributes('aria-label')).toContain('点击标记死亡');
  expect(wrapper.find('.death-shroud__spent').exists()).toBe(false);
});

test('role menu offers death marking and explicit revival only when life editing is available', async () => {
  const { wrapper } = create({ showLife: true });
  await flushPromises();
  const life = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
    .find(button => /标记死亡|恢复存活/.test(button.textContent || ''));
  expect(life()!.textContent).toContain('标记死亡');
  life()!.click();
  expect(wrapper.emitted('action')).toEqual([['life']]);
  await wrapper.setProps({ isDead: true });
  expect(life()!.textContent).toContain('恢复存活');
  await wrapper.setProps({ pending: true });
  expect(life()!.disabled).toBe(true);
  await wrapper.setProps({ showLife: false });
  expect(life()).toBeUndefined();
});
afterEach(() => {
  mounted.splice(0).forEach(wrapper => wrapper.unmount());
  document.body.innerHTML = '';
});
function create(props = {}) {
  const anchor = document.createElement('button');
  document.body.append(anchor);
  anchor.getBoundingClientRect = () => ({ left: 400, top: 400, width: 100, height: 100 }) as DOMRect;
  const wrapper = mount(RoleTokenMenu, {
    attachTo: document.body,
    props: { anchor, seatIndex: 0, canEdit: true, canChangeAlignment: true, canNominate: true, showNominate: true, pending: false, ...props },
    global: { stubs: { 'font-awesome-icon': true } },
  });
  mounted.push(wrapper);
  return { wrapper, anchor };
}

test.each([
  [-90, 'center', 'below'],
  [-45, 'left', 'below'],
  [0, 'left', 'center'],
  [45, 'left', 'above'],
  [90, 'center', 'above'],
  [135, 'right', 'above'],
  [180, 'right', 'center'],
  [225, 'right', 'below'],
])('places the menu and pointer toward the table centre at seat angle %s', (angle, horizontal, vertical) => {
  const anchor = { left: 400, top: 400, width: 100, height: 100 };
  const menu = { width: 140, height: 90 };
  const position = roleTokenMenuPosition(anchor, menu, { width: 1000, height: 1000 }, Number(angle));
  const left = parseFloat(position.left);
  const top = parseFloat(position.top);
  const pointerX = parseFloat(position['--pointer-x']);
  const pointerY = parseFloat(position['--pointer-y']);
  if (horizontal === 'left') {
    expect(left + menu.width).toBeLessThan(450);
    expect(pointerX).toBe(menu.width);
  } else if (horizontal === 'right') {
    expect(left).toBeGreaterThan(450);
    expect(pointerX).toBe(0);
  } else expect(left + menu.width / 2).toBeCloseTo(450);
  if (vertical === 'above') {
    expect(top + menu.height).toBeLessThan(450);
    expect(pointerY).toBe(menu.height);
  } else if (vertical === 'below') {
    expect(top).toBeGreaterThan(450);
    expect(pointerY).toBe(0);
  } else expect(top + menu.height / 2).toBeCloseTo(450);
});

test('keeps menus inside narrow viewports and moves the pointer with the clamped position', () => {
  const position = roleTokenMenuPosition(
    { left: 270, top: 10, width: 40, height: 40 },
    { width: 140, height: 90 }, { width: 320, height: 240 }, 180,
  );
  expect(position.left).toBe('116px');
  expect(position.top).toBe('8px');
  expect(parseFloat(position['--pointer-x'])).toBe(140);
  expect(parseFloat(position['--pointer-y'])).toBe(22);
});

test('keeps the table accessible, anchors above the token and dismisses on outside press', async () => {
  const { wrapper, anchor } = create();
  await flushPromises();
  const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
  expect(parseFloat(menu.style.top)).toBeLessThan(400);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  anchor.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  expect(wrapper.emitted('close')).toBeUndefined();
  document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
  expect(wrapper.emitted('close')).toHaveLength(1);
});

test('keyboard skips unavailable actions and Escape returns focus to the token', async () => {
  const { wrapper, anchor } = create({ canChangeAlignment: false });
  await flushPromises();
  const buttons = document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
  expect(document.activeElement).toBe(buttons[0]);
  buttons[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  expect(document.activeElement).toBe(buttons[2]);
  buttons[2].click();
  expect(wrapper.emitted('action')).toEqual([['nominate-self']]);
  buttons[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.activeElement).toBe(anchor);
  expect(wrapper.emitted('close')).toHaveLength(1);
});

test('token clicks toggle the compact menu and preserve the seat swapping flow', async () => {
  const anchor = document.createElement('button');
  const context = {
    players: [{ id: 'one' }], seatEditor: { open: false }, swap: -1,
    actionSeatMode: 'player', actionSeatIndex: -1, roleMenuAnchor: null,
    reminderPickerSeat: -1, openRoleModal: vi.fn(), completeSeatSwap: vi.fn(),
    openSeatActions: vi.fn(function (this: typeof context, index: number) { this.actionSeatIndex = index; }),
    closeSeatActions: vi.fn(function (this: typeof context) { this.actionSeatIndex = -1; }),
  };
  await TownSquare.methods.handleTableTokenClick.call(context, 0, { currentTarget: anchor });
  expect(context.actionSeatMode).toBe('token');
  expect(context.roleMenuAnchor).toBe(anchor);
  expect(context.openRoleModal).not.toHaveBeenCalled();
  await TownSquare.methods.handleTableTokenClick.call(context, 0, { currentTarget: anchor });
  expect(context.closeSeatActions).toHaveBeenCalledOnce();
  context.swap = 1;
  await TownSquare.methods.handleTableTokenClick.call(context, 0, {});
  expect(context.completeSeatSwap).toHaveBeenCalledWith(0);
});

test('night wake action captures the occupant before closing the seat menu', async () => {
  const { wrapper } = create({ showWake: true, showNominate: false });
  await flushPromises();
  const wake = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find(item => item.textContent?.includes('唤醒'))!;
  wake.click();
  expect(wrapper.emitted('action')).toEqual([['wake']]);
  const context = { actionSeatIndex: 1, players: [{ id: '' }, { id: 'p1' }], seatActionPending: '', canWakeTokenSeat: true,
    gameStore: { levelDays: 2 }, nightMessageTarget: null, closeSeatActions: vi.fn(),
    openNightConversation(index: number) { TownSquare.methods.openNightConversation.call(this, index); } };
  await TownSquare.methods.handleRoleTokenAction.call(context, 'wake');
  expect(context.nightMessageTarget).toEqual({ seatIndex: 1, playerUserId: 'p1', levelDays: 2 });
  expect(context.closeSeatActions).toHaveBeenCalledOnce();
});

test('the wake marker opens its captured player directly and respects phase permissions', () => {
  const context = { players: [{ id: 'p1' }], seatActionPending: '', canWakeTokenSeat: true,
    gameStore: { levelDays: 2 }, nightMessageTarget: null, closeSeatActions: vi.fn() };
  TownSquare.methods.openNightConversation.call(context, 0);
  expect(context.nightMessageTarget).toEqual({ seatIndex: 0, playerUserId: 'p1', levelDays: 2 });
  context.nightMessageTarget = null; context.canWakeTokenSeat = false;
  TownSquare.methods.openNightConversation.call(context, 0); expect(context.nightMessageTarget).toBeNull();
});

test('alignment updates preserve private data and wait for authoritative refresh', async () => {
  const updatePlayer = vi.fn().mockResolvedValue(undefined);
  const context = {
    actionSeatIndex: 0, players: [{ id: 'one' }], seatActionPending: '',
    isApiRoom: true, canChangeTokenAlignment: true, actionTokenRole: { id: 'imp', team: 'demon' },
    gameStore: { players: { one: { privateExtras: { existing: 'keep' } } } },
    gameController: { updatePlayer },
    runSeatAction: vi.fn(async (_: string, task: () => Promise<void>) => task()),
  };
  await TownSquare.methods.handleRoleTokenAction.call(context, 'alignment');
  expect(updatePlayer).toHaveBeenCalledWith({ userId: 'one', privateExtras: { existing: 'keep', alignment: 'good' } });
  context.canChangeTokenAlignment = false;
  updatePlayer.mockClear();
  await TownSquare.methods.handleRoleTokenAction.call(context, 'alignment');
  expect(updatePlayer).not.toHaveBeenCalled();
});

test('self nomination uses the existing confirmation flow and respects eligibility', async () => {
  const context = {
    actionSeatIndex: 0, players: [{ id: 'one' }], seatActionPending: '',
    isApiRoom: true, canSelfNominateActionSeat: true, nominationStage: '',
    closeSeatActions: vi.fn(),
    startRealtimeVote: vi.fn(async () => { context.nominationStage = 'nominator'; }),
    handleNominationSeatClick: vi.fn(),
  };
  await TownSquare.methods.handleRoleTokenAction.call(context, 'nominate-self');
  expect(context.startRealtimeVote).toHaveBeenCalledWith(0);
  expect(context.handleNominationSeatClick).toHaveBeenCalledWith(0);
  context.canSelfNominateActionSeat = false;
  context.startRealtimeVote.mockClear();
  await TownSquare.methods.handleRoleTokenAction.call(context, 'nominate-self');
  expect(context.startRealtimeVote).not.toHaveBeenCalled();
});

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mount, shallowMount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import NightMessageComposer from '@/components/NightMessageComposer.vue';
import NightMessageModal from '@/components/modals/NightMessageModal.vue';
import NightWakeMarker from '@/components/NightWakeMarker.vue';
import { useRoomChatStore } from '@/stores/roomChat';
import { renderMessageContent, nightWakeStatus } from '@/utils/nightMessages';
import { useSessionStore } from '@/stores/session';
import { useGameStore } from '@/stores/game';
import { usePlayersStore } from '@/stores/players';
import { useNightPlayerSelectionStore } from '@/stores/nightPlayerSelection';
import { useGameController } from '@/controllers/GameController';
import { SocketClientEvent } from '@/types/socket';

const mounted: VueWrapper[] = [];
beforeEach(() => { setActivePinia(createPinia()); window.$toast = { success: vi.fn(), error: vi.fn() } as any; });
afterEach(() => { mounted.splice(0).forEach(wrapper => wrapper.unmount()); vi.restoreAllMocks(); });
function editor(props = {}) {
  usePlayersStore().set([{ id: '', role: {}, reminders: [] }, { id: 'p1', name: '小明', role: {}, reminders: [] }] as any);
  const wrapper = mount(NightMessageComposer, {
    props: { playerName: '2 号座位', candidates: [{ id: 'p1', name: '小明', seat: 2 }], roles: [{ id: 'imp', name: '小恶魔', team: 'demon' }], ...props },
    global: { stubs: { 'font-awesome-icon': true, RoleIcon: true, teleport: true, Modal: { template: '<div class="picker-modal"><slot /></div>' } } },
  });
  mounted.push(wrapper);
  return wrapper;
}
function button(wrapper: VueWrapper, text: string) {
  const result = wrapper.findAll('button').find(item => item.text() === text);
  if (!result) throw new Error(`Button missing: ${text}`);
  return result;
}
test('composes cards, seat references, role references and new lines in click order', async () => {
  const wrapper = editor();
  expect(wrapper.findAll('.composer-card')).toHaveLength(8);
  expect(button(wrapper, '发送').attributes('disabled')).toBeDefined();
  await button(wrapper, '这名玩家是').trigger('click');
  await button(wrapper, '玩家').trigger('click');
  useNightPlayerSelectionStore().choose(1); await flushPromises();
  await button(wrapper, '角色').trigger('click');
  await button(wrapper, '小恶魔').trigger('click');
  await button(wrapper, '你是').trigger('click');
  await button(wrapper, '自定义').trigger('click');
  await wrapper.get('input').setValue('善良的玩家');
  await wrapper.get('form').trigger('submit');
  expect(wrapper.emitted('send')).toBeUndefined();
  await button(wrapper, '发送').trigger('click');
  const content = wrapper.emitted('send')![0][0] as any[];
  expect(content).toEqual([
    { type: 'text', text: '这名玩家是 2 号座位' },
    { type: 'character', characterId: 'imp' }, { type: 'text', text: '你是 善良的玩家', newLine: true },
  ]);
  expect(renderMessageContent(content, () => '2 号座位 · 小明', () => '小恶魔')).toBe('这名玩家是 2 号座位 小恶魔\n你是 善良的玩家');
  expect(wrapper.findAll('.composer-segment')).toHaveLength(5);
  await wrapper.get('[aria-label="清空信息"]').trigger('click');
  expect(wrapper.findAll('.composer-segment')).toHaveLength(0);
});
test('preserves typed text before a quick phrase and blocks excess content', async () => {
  const wrapper = editor();
  await button(wrapper, '自定义').trigger('click');
  await wrapper.get('input').setValue('先输入');
  await wrapper.get('form').trigger('submit');
  await wrapper.findAll('.composer-quick button')[1].trigger('click');
  await button(wrapper, '发送').trigger('click');
  expect(wrapper.emitted('send')![0]).toEqual([[{ type: 'text', text: '先输入 是' }]]);
  await wrapper.get('[aria-label="清空信息"]').trigger('click');
  for (let i = 0; i < 11; i++) {
    await button(wrapper, '角色').trigger('click');
    await button(wrapper, '小恶魔').trigger('click');
  }
  expect(wrapper.get('[role="alert"]').text()).toContain('最多包含 10 项');
  expect(button(wrapper, '发送').attributes('disabled')).toBeDefined();
  await wrapper.findAll('.composer-segment')[0].trigger('click');
  expect(button(wrapper, '发送').attributes('disabled')).toBeUndefined();
});
test('blocks oversize text and disables keyboard submission when unavailable', async () => {
  const wrapper = editor();
  await button(wrapper, '自定义').trigger('click');
  await wrapper.get('input').setValue('字'.repeat(500));
  await wrapper.get('form').trigger('submit');
  await wrapper.findAll('.composer-quick button')[0].trigger('click');
  expect(wrapper.get('[role="alert"]').text()).toContain('超过 500 字');
  await wrapper.get('[aria-label="清空信息"]').trigger('click');
  await button(wrapper, '自定义').trigger('click');
  await wrapper.get('input').setValue('草稿');
  await wrapper.setProps({ sendDisabled: true });
  await wrapper.get('form').trigger('submit');
  await button(wrapper, '发送').trigger('click');
  expect(wrapper.emitted('send')).toBeUndefined();
});

test('uses exactly three tools and returns from table selection with occupied or empty seats', async () => {
  const wrapper = editor();
  const selection = useNightPlayerSelectionStore();
  expect(wrapper.findAll('.composer-tools button').map(item => item.text())).toEqual(['玩家', '角色', '自定义']);
  await button(wrapper, '玩家').trigger('click');
  expect(selection.active).toBe(true);
  expect(wrapper.emitted('picker-open')!.at(-1)).toEqual([true]);
  selection.choose(0); await flushPromises();
  expect(wrapper.get('.composer-segment').text()).toContain('1 号座位');
  expect(wrapper.emitted('picker-open')!.at(-1)).toEqual([false]);
  await button(wrapper, '玩家').trigger('click');
  selection.choose(1); await flushPromises();
  await button(wrapper, '玩家').trigger('click');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await flushPromises();
  expect(selection.active).toBe(false);
  expect(wrapper.findAll('.composer-segment')).toHaveLength(2);
  await button(wrapper, '发送').trigger('click');
  expect(wrapper.emitted('send')![0]).toEqual([[
    { type: 'text', text: '1 号座位 2 号座位' },
  ]]);
  await button(wrapper, '玩家').trigger('click');
  wrapper.unmount(); mounted.splice(mounted.indexOf(wrapper), 1);
  expect(selection.active).toBe(false);
});

test('cancelling any picker preserves the draft and discards unconfirmed custom text', async () => {
  const wrapper = editor();
  await button(wrapper, '你是').trigger('click');
  for (const mode of ['玩家', '角色', '自定义']) {
    await button(wrapper, mode).trigger('click');
    if (mode === '自定义') await wrapper.get('input').setValue('不要加入草稿');
    await button(wrapper, '取消').trigger('click');
    expect(wrapper.findAll('.composer-segment')).toHaveLength(1);
    expect(wrapper.findAll('.picker-modal')).toHaveLength(0);
  }
  await button(wrapper, '自定义').trigger('click');
  expect(wrapper.get('input').element.value).toBe('');
  await wrapper.get('input').setValue('   ');
  expect(button(wrapper, '确认').attributes('disabled')).toBeDefined();
  await button(wrapper, '取消').trigger('click');
  await button(wrapper, '发送').trigger('click');
  expect(wrapper.emitted('send')![0]).toEqual([[{ type: 'text', text: '你是' }]]);
});

test('groups script roles by team and closes after selecting one role', async () => {
  const wrapper = editor({ roles: [
    { id: 'imp', name: '小恶魔', team: 'demon' },
    { id: 'poisoner', name: '投毒者', team: 'minion' },
    { id: 'chef', name: '厨师', team: 'townsfolk' },
    { id: 'saint', name: '圣徒', team: 'outsider' },
  ] });
  await button(wrapper, '角色').trigger('click');
  expect(wrapper.findAll('.night-role-group').map(item => item.attributes('aria-label'))).toEqual(['镇民', '外来者', '爪牙', '恶魔']);
  await button(wrapper, '厨师').trigger('click');
  expect(wrapper.find('.picker-modal').exists()).toBe(false);
  expect(wrapper.get('.composer-segment').text()).toContain('厨师');
  expect(wrapper.emitted('send')).toBeUndefined();
});

function modal() {
  useSessionStore().setApiRoomSession({ roomId: 'ROOM', gameServerId: 'server' });
  const game = useGameStore();
  game.currentPlayer = { userId: 'dm', isDM: true, seat: 0 } as any;
  game.level = 'night'; game.levelDays = 1;
  game.players = { p1: { userId: 'p1', seat: 2, isDM: false } } as any;
  usePlayersStore().set([{ id: '', role: {}, reminders: [] }, { id: 'p1', name: '小明', role: {}, reminders: [] }] as any);
  const controller = useGameController();
  controller.gameSocket = {} as any; controller.connectionStatus = 'connected';
  const request = vi.spyOn(controller, 'request').mockImplementation(async event => event === SocketClientEvent.GetMessageHistory
    ? { status: 200, data: { messages: [] } } : { status: 200, data: { messageId: 'wake-1' } } as any);
  const wrapper = shallowMount(NightMessageModal, {
    props: { seatIndex: 1, playerUserId: 'p1', levelDays: 1 },
    global: { stubs: { 'font-awesome-icon': true, Modal: { template: '<div><slot /></div>' } } },
  });
  mounted.push(wrapper);
  return { wrapper, request, composer: wrapper.findComponent(NightMessageComposer), game };
}
test('sends a private skill message to the captured occupant with the current night context', async () => {
  const { wrapper, composer, request } = modal();
  const content = [{ type: 'text', text: '你是 善良' }];
  composer.vm.$emit('send', content); await flushPromises();
  expect(request).toHaveBeenCalledWith(SocketClientEvent.SendDMMessage, {
    playerUserId: 'p1', channel: 'skill', content,
    context: { kind: 'night-info', levelDays: 1, actionId: 'seat:2', section: 'first' },
  });
  expect(wrapper.emitted('close')).toHaveLength(1);
  expect(useRoomChatStore().getMessages('dm_skill', 'p1')).toHaveLength(1);
});
test('blocks sending after a seat swap or phase change', async () => {
  const { composer, request, game } = modal();
  usePlayersStore().players[1].id = 'p2'; await flushPromises();
  expect(composer.props('sendDisabled')).toBe(true);
  composer.vm.$emit('send', [{ type: 'text', text: '不能误发' }]); await flushPromises();
  expect(request.mock.calls.filter(([event]) => event === SocketClientEvent.SendDMMessage)).toHaveLength(0);
  usePlayersStore().players[1].id = 'p1'; game.level = 'day'; await flushPromises();
  composer.vm.$emit('send', [{ type: 'text', text: '过期草稿' }]); await flushPromises();
  expect(request.mock.calls.filter(([event]) => event === SocketClientEvent.SendDMMessage)).toHaveLength(0);
});
test('keeps the editor open on failure and rejects duplicate submits while pending', async () => {
  const { wrapper, composer, request } = modal();
  let reject!: (cause: Error) => void;
  request.mockImplementation(() => new Promise((_, no) => { reject = no; }));
  composer.vm.$emit('send', [{ type: 'text', text: '保留草稿' }]);
  composer.vm.$emit('send', [{ type: 'text', text: '保留草稿' }]);
  await flushPromises(); expect(request.mock.calls.filter(([event]) => event === SocketClientEvent.SendDMMessage)).toHaveLength(1);
  reject(new Error('连接中断')); await flushPromises();
  expect(wrapper.emitted('close')).toBeUndefined();
  expect(composer.props('statusText')).toBe('连接中断');
  expect(composer.props('disabled')).toBe(false);
  expect(useRoomChatStore().getMessages('dm_skill', 'p1')).toHaveLength(0);
});

test('the role token wake eye appears after a confirmed wake only to storytellers for this night and occupant', async () => {
  const { composer, game } = modal();
  const marker = mount(NightWakeMarker, { props: { userId: 'p1' }, global: { stubs: { 'font-awesome-icon': true } } });
  mounted.push(marker);
  expect(marker.find('.night-wake-marker').exists()).toBe(false);
  composer.vm.$emit('send', [{ type: 'text', text: '你是' }]); await flushPromises();
  expect(marker.get('font-awesome-icon-stub').attributes('icon')).toBe('eye-slash');
  await marker.setProps({ userId: 'p2' }); expect(marker.find('.night-wake-marker').exists()).toBe(false);
  await marker.setProps({ userId: 'p1' }); game.currentPlayer!.isDM = false; await flushPromises();
  expect(marker.find('.night-wake-marker').exists()).toBe(false);
  game.currentPlayer!.isDM = true; game.level = 'day'; await flushPromises();
  expect(marker.find('.night-wake-marker').exists()).toBe(false);
  game.level = 'night'; game.levelDays = 2; await flushPromises(); expect(marker.find('.night-wake-marker').exists()).toBe(false);
  game.levelDays = 1; await flushPromises(); expect(marker.find('.night-wake-marker').exists()).toBe(true);
  useRoomChatStore().resetRoomState(); await flushPromises(); expect(marker.find('.night-wake-marker').exists()).toBe(false);
});

function wakeMessage(id: string, isDM: boolean, text: string) {
  return { messageId: id, timestamp: Number(id) * 1000, senderUserId: isDM ? 'dm' : 'p1', isDM,
    content: [{ type: 'text' as const, text }], context: { kind: 'night-info' as const, levelDays: 1,
      actionId: isDM ? 'seat:2' : 'reply:1', section: 'first' as const } };
}

test('matches the video sequence: sent acknowledgement, unread yes, read yes, unread acknowledgement, read acknowledgement', async () => {
  useSessionStore().setApiRoomSession({ roomId: 'ROOM', gameServerId: 'server' });
  const game = useGameStore(); game.currentPlayer = { userId: 'dm', isDM: true } as any; game.level = 'night'; game.levelDays = 1;
  const chat = useRoomChatStore();
  const marker = mount(NightWakeMarker, { props: { userId: 'p1' }, global: { stubs: { 'font-awesome-icon': true } } }); mounted.push(marker);
  const icon = () => marker.get('font-awesome-icon-stub').attributes('icon');
  chat.addMessage('dm_skill', 'p1', wakeMessage('1', true, '了解')); await flushPromises();
  expect(icon()).toBe('thumbs-up'); expect(marker.classes()).not.toContain('is-unread');
  chat.addMessage('dm_skill', 'p1', wakeMessage('2', false, '是')); await flushPromises();
  expect(icon()).toBe('eye'); expect(marker.classes()).toContain('is-unread');
  await marker.get('button').trigger('click'); expect(marker.emitted('open')).toHaveLength(1);
  const first = modal(); await flushPromises();
  expect(first.wrapper.findAll('.night-conversation-row').map(row => row.classes().includes('is-sent'))).toEqual([true, false]);
  expect(icon()).toBe('eye-slash'); expect(marker.classes()).not.toContain('is-unread');
  first.wrapper.unmount(); mounted.splice(mounted.indexOf(first.wrapper), 1);
  chat.addMessage('dm_skill', 'p1', wakeMessage('3', true, '做出你的选择 零')); await flushPromises();
  expect(icon()).toBe('eye-slash'); expect(marker.classes()).not.toContain('is-unread');
  chat.addMessage('dm_skill', 'p1', wakeMessage('4', false, '了解')); await flushPromises();
  expect(icon()).toBe('thumbs-up'); expect(marker.classes()).toContain('is-unread');
  const second = modal(); await flushPromises();
  expect(second.wrapper.findAll('.night-conversation-row')).toHaveLength(4);
  expect(icon()).toBe('thumbs-up'); expect(marker.classes()).not.toContain('is-unread');
  expect(chat.getNightReadIds('another-dm', 'p1')).toHaveLength(0);
});

test('latest-message markers ignore old nights, non-night messages, reordered history and duplicate echoes', () => {
  const a = wakeMessage('1', true, '做出你的选择'); const b = wakeMessage('2', false, '了解');
  const unrelated = { ...wakeMessage('3', false, '是'), context: undefined };
  expect(nightWakeStatus([b, unrelated, a, b], 1, 'p1', [])).toEqual({ icon: 'thumbs-up', unread: true });
  expect(nightWakeStatus([a, b], 2, 'p1', [])).toBeNull();
  expect(nightWakeStatus([b], 1, 'p1', [])).toBeNull();
  expect(nightWakeStatus([a, { ...b, content: [{ type: 'text', text: '了解 是' }] }], 1, 'p1', [])).toEqual({ icon: 'eye', unread: true });
});

test('new replies update an open storyteller conversation and are read without closing or sending', async () => {
  const { wrapper, composer, request } = modal(); await flushPromises();
  useRoomChatStore().addMessage('dm_skill', 'p1', wakeMessage('1', true, '做出你的选择'));
  useRoomChatStore().addMessage('dm_skill', 'p1', wakeMessage('2', false, '不')); await flushPromises();
  expect(wrapper.findAll('.night-conversation-row')).toHaveLength(2);
  expect(useRoomChatStore().getNightReadIds('dm', 'p1')).toContain('2');
  composer.vm.$emit('picker-open', true); await flushPromises();
  useRoomChatStore().addMessage('dm_skill', 'p1', wakeMessage('3', false, '是')); await flushPromises();
  expect(useRoomChatStore().getNightReadIds('dm', 'p1')).not.toContain('3');
  composer.vm.$emit('picker-open', false); await flushPromises();
  expect(useRoomChatStore().getNightReadIds('dm', 'p1')).toContain('3');
  expect(request.mock.calls.filter(([event]) => event === SocketClientEvent.SendDMMessage)).toHaveLength(0);
  expect(wrapper.emitted('close')).toBeUndefined();
});

test('a late storyteller history response is ignored after changing rooms', async () => {
  const { wrapper, request } = modal(); await flushPromises();
  let resolve!: (response: any) => void;
  request.mockImplementationOnce(() => new Promise(yes => { resolve = yes; }));
  const controller = useGameController(); controller.connectionStatus = 'reconnecting'; await flushPromises();
  controller.connectionStatus = 'connected'; await flushPromises();
  useSessionStore().setApiRoomSession({ roomId: 'OTHER', gameServerId: 'server' });
  useRoomChatStore().resetRoomState(); await flushPromises();
  resolve({ status: 200, data: { messages: [wakeMessage('5', true, '过期信息')] } }); await flushPromises();
  expect(wrapper.findAll('.night-conversation-row')).toHaveLength(0);
});

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import NightInfoViewer from '@/components/NightInfoViewer.vue';
import NightMessageComposer from '@/components/NightMessageComposer.vue';
import NightMessageContent from '@/components/NightMessageContent.vue';
import Modal from '@/components/modals/Modal.vue';
import { useGameController } from '@/controllers/GameController';
import { useGameStore } from '@/stores/game';
import { useUserStore } from '@/stores/user';
import { useRoomChatStore, type NightInfoMessage } from '@/stores/roomChat';
import { useSessionStore } from '@/stores/session';
import { useGameScriptStore } from '@/stores/gameScript';
import { usePlayersStore } from '@/stores/players';
import { useNightPlayerSelectionStore } from '@/stores/nightPlayerSelection';
import { SocketClientEvent } from '@/types/socket';

const mounted: VueWrapper[] = [];
beforeEach(() => { setActivePinia(createPinia()); });
afterEach(() => { mounted.splice(0).forEach(wrapper => wrapper.unmount()); vi.restoreAllMocks(); });
function incoming(id = '1', overrides = {}): NightInfoMessage {
  return { messageId: id, senderUserId: 'dm', isDM: true, timestamp: Number(id) * 1000,
    content: [{ type: 'text', text: '他们是你的爪牙' }, { type: 'character', characterId: 'recluse' }, { type: 'character', characterId: 'slayer' }],
    context: { kind: 'night-info', levelDays: 1, actionId: 'seat:2', section: 'first' }, ...overrides };
}
async function viewer(options: { history?: NightInfoMessage[]; dm?: boolean; seat?: number } = {}) {
  const session = useSessionStore(); session.setApiRoomSession({ roomId: 'ROOM', gameServerId: 'server' });
  useUserStore().setCurrentUser({ id: 'p1', displayName: '小明' } as any);
  const game = useGameStore(); game.level = 'night'; game.levelDays = 1;
  game.currentPlayer = { userId: 'p1', seat: options.seat ?? 2, isDM: Boolean(options.dm) } as any;
  useGameScriptStore().characters = [
    { id: 'recluse', name: '陌客', team: 'outsider' }, { id: 'slayer', name: '猎手', team: 'townsfolk' }, { id: 'imp', name: '小恶魔', team: 'demon' },
  ] as any;
  usePlayersStore().set([{ id: '', role: {}, reminders: [] }, { id: 'p1', name: '小明', role: {}, reminders: [] }] as any);
  const controller = useGameController(); controller.gameSocket = {} as any; controller.connectionStatus = 'connected';
  let replyId = 100;
  const request = vi.spyOn(controller, 'request').mockImplementation(async (event) => ({
    status: 200, data: event === SocketClientEvent.GetMessageHistory ? { messages: options.history || [] } : { messageId: String(replyId++) },
  }) as any);
  const wrapper = mount(NightInfoViewer, { global: { stubs: {
    'font-awesome-icon': true, RoleIcon: true, teleport: true,
    Modal: { props: ['name', 'title'], template: '<section :data-modal="name" :aria-label="title"><slot /></section>' },
  } } });
  mounted.push(wrapper); await flushPromises();
  const chat = useRoomChatStore();
  async function receive(message = incoming(), userId = 'p1') { chat.addMessage('dm_skill', userId, message); await flushPromises(); }
  return { wrapper, game, controller, request, chat, receive, session };
}
function button(wrapper: VueWrapper, text: string) {
  const match = wrapper.findAll('button').find(item => item.text() === text);
  if (!match) throw new Error(`Missing button ${text}`);
  return match;
}
function composer(wrapper: VueWrapper) { return wrapper.findComponent(NightMessageComposer); }

test('opens a rich received message on live delivery with exactly six reply choices', async () => {
  const { wrapper, receive } = await viewer();
  expect(wrapper.find('[data-modal="night-received"]').exists()).toBe(false);
  await receive();
  expect(wrapper.get('[data-modal="night-received"]').attributes('aria-label')).toBe('说书人唤醒了你：');
  expect(wrapper.get('.night-exchange-row.is-received').text()).toContain('已接收：他们是你的爪牙陌客猎手');
  expect(wrapper.get('.is-card').classes()).toContain('tone-red');
  expect(wrapper.findAll('role-icon-stub')).toHaveLength(2);
  expect(composer(wrapper).findAll('.composer-quick button').map(item => item.text())).toEqual(['了解', '是', '不']);
  expect(composer(wrapper).findAll('.composer-tools button').map(item => item.text())).toEqual(['玩家', '角色', '自定义']);
  expect(wrapper.find('.composer-cards').exists()).toBe(false);
  expect(wrapper.find('.composer-send').exists()).toBe(false);
});

test('builds replies without sending until Send, then keeps one confirmed sent row', async () => {
  const { wrapper, receive, request, chat } = await viewer(); await receive();
  await button(wrapper, '了解').trigger('click'); await button(wrapper, '是').trigger('click'); await button(wrapper, '不').trigger('click');
  await button(wrapper, '玩家').trigger('click');
  expect(wrapper.get('[data-modal="night-received"]').attributes('style')).toContain('display: none');
  useNightPlayerSelectionStore().choose(1); await flushPromises();
  await button(wrapper, '角色').trigger('click'); await button(wrapper, '小恶魔').trigger('click');
  await button(wrapper, '自定义').trigger('click');
  expect(wrapper.text()).toContain('你有什么要问说书人吗？');
  await wrapper.get('input').setValue('确认目标'); await wrapper.get('form').trigger('submit');
  expect(request.mock.calls.filter(([event]) => event === SocketClientEvent.SendDMMessage)).toHaveLength(0);
  await button(wrapper, '发送').trigger('click'); await flushPromises();
  expect(request).toHaveBeenCalledWith(SocketClientEvent.SendDMMessage, {
    playerUserId: 'p1', channel: 'skill', content: [
      { type: 'text', text: '了解 是 不 2 号座位' }, { type: 'character', characterId: 'imp' }, { type: 'text', text: '确认目标' },
    ], context: { kind: 'night-info', levelDays: 1, actionId: 'reply:1', section: 'first' },
  });
  expect(wrapper.find('[data-modal="night-received"]').exists()).toBe(false);
  const saved = chat.getMessages('dm_skill', 'p1').find(item => item.messageId === '100')!;
  await receive(saved as NightInfoMessage);
  expect(wrapper.find('[data-modal="night-received"]').exists()).toBe(false);
  await button(wrapper, '夜间信息').trigger('click'); await flushPromises();
  expect(wrapper.get('.is-sent').text()).toContain('已发送：');
  expect(wrapper.findAll('.composer-segment')).toHaveLength(0);
  expect(wrapper.findAll('.is-sent')).toHaveLength(1);
  expect(wrapper.findAll('.night-exchange-row.is-received')).toHaveLength(1);
});

test('a socket echo before acknowledgement is not duplicated and does not clear the draft early', async () => {
  const { wrapper, receive, request, chat } = await viewer(); await receive();
  let resolve!: (value: any) => void;
  request.mockImplementation(() => new Promise(yes => { resolve = yes; }));
  await button(wrapper, '了解').trigger('click'); await button(wrapper, '发送').trigger('click');
  const sent = incoming('100', { senderUserId: 'p1', isDM: false, content: [{ type: 'text', text: '了解' }], context: { ...incoming().context, actionId: 'reply:1' } });
  chat.addMessage('dm_skill', 'p1', sent); await flushPromises();
  expect(wrapper.findAll('.composer-segment')).toHaveLength(1);
  resolve({ status: 200, data: { messageId: '100' } }); await flushPromises();
  expect(wrapper.find('[data-modal="night-received"]').exists()).toBe(false);
  await button(wrapper, '夜间信息').trigger('click'); await flushPromises();
  expect(wrapper.findAll('.is-sent')).toHaveLength(1);
  expect(wrapper.findAll('.composer-segment')).toHaveLength(0);
});

test('history and self echoes stay closed; the history trigger restores received and sent messages', async () => {
  const reply = incoming('2', { senderUserId: 'p1', isDM: false, content: [{ type: 'text', text: '了解' }], context: { ...incoming().context, actionId: 'reply:1' } });
  const { wrapper, receive } = await viewer({ history: [incoming(), reply] });
  expect(wrapper.find('[data-modal="night-received"]').exists()).toBe(false);
  await receive(reply);
  expect(wrapper.find('[data-modal="night-received"]').exists()).toBe(false);
  await button(wrapper, '夜间信息').trigger('click'); await flushPromises();
  expect(wrapper.findAll('.is-sent')).toHaveLength(1);
  expect(wrapper.findAll('.night-exchange-row.is-received')).toHaveLength(1);
});

test('continuous messages share one timeline without navigation and preserve the draft source until sent', async () => {
  const { wrapper, receive, request } = await viewer(); await receive();
  await button(wrapper, '了解').trigger('click'); await receive(incoming('2'));
  expect(wrapper.findAll('.composer-segment')).toHaveLength(1);
  await button(wrapper, '发送').trigger('click'); await flushPromises();
  expect(request.mock.calls.at(-1)![1]).toMatchObject({ context: { actionId: 'reply:1' } });
  expect(wrapper.findAll('.is-received')).toHaveLength(2);
  expect(wrapper.findAll('.is-sent')).toHaveLength(1);
  expect(wrapper.findAll('button').some(item => ['上一条', '下一条'].includes(item.text()))).toBe(false);
  await button(wrapper, '是').trigger('click'); await button(wrapper, '发送').trigger('click'); await flushPromises();
  expect(request.mock.calls.at(-1)![1]).toMatchObject({ context: { actionId: 'reply:2' } });
  expect(wrapper.find('[data-modal="night-received"]').exists()).toBe(false);
  await button(wrapper, '夜间信息').trigger('click'); await flushPromises();
  expect(wrapper.findAll('.night-exchange-row').map(item => item.classes().includes('is-sent'))).toEqual([false, false, true, true]);
});

test('keeps a draft after failure, blocks duplicate sends, then retries successfully', async () => {
  const { wrapper, receive, request } = await viewer(); await receive();
  let reject!: (reason: Error) => void;
  request.mockImplementation(() => new Promise((_, no) => { reject = no; }));
  await button(wrapper, '了解').trigger('click');
  composer(wrapper).vm.$emit('send', [{ type: 'text', text: '了解' }]);
  composer(wrapper).vm.$emit('send', [{ type: 'text', text: '了解' }]); await flushPromises();
  expect(request.mock.calls.filter(([event]) => event === SocketClientEvent.SendDMMessage)).toHaveLength(1);
  reject(new Error('连接中断')); await flushPromises();
  expect(wrapper.get('[role="status"]').text()).toBe('连接中断');
  expect(wrapper.findAll('.composer-segment')).toHaveLength(1);
  request.mockResolvedValue({ status: 200, data: { messageId: '100' } } as any);
  await button(wrapper, '发送').trigger('click'); await flushPromises();
  expect(wrapper.find('[data-modal="night-received"]').exists()).toBe(false);
  await button(wrapper, '夜间信息').trigger('click'); await flushPromises();
  expect(wrapper.findAll('.is-sent')).toHaveLength(1);
});

test('a fresh storyteller message reopens the player dialog after a successful reply closed it', async () => {
  const { wrapper, receive } = await viewer(); await receive();
  await button(wrapper, '是').trigger('click'); await button(wrapper, '发送').trigger('click'); await flushPromises();
  expect(wrapper.find('[data-modal="night-received"]').exists()).toBe(false);
  await receive(incoming('200', { content: [{ type: 'text', text: '做出你的选择 零' }] }));
  expect(wrapper.find('[data-modal="night-received"]').exists()).toBe(true);
  expect(wrapper.findAll('.is-received')).toHaveLength(2);
  expect(wrapper.findAll('.is-sent')).toHaveLength(1);
});

test('reconnect and phase changes block sending while keeping history and draft readable', async () => {
  const { wrapper, receive, request, controller, game } = await viewer(); await receive();
  await button(wrapper, '了解').trigger('click');
  controller.connectionStatus = 'reconnecting'; await flushPromises();
  expect(button(wrapper, '发送').attributes('disabled')).toBeDefined();
  composer(wrapper).vm.$emit('send', [{ type: 'text', text: '了解' }]); await flushPromises();
  expect(request.mock.calls.filter(([event]) => event === SocketClientEvent.SendDMMessage)).toHaveLength(0);
  controller.connectionStatus = 'connected'; game.level = 'day'; await flushPromises();
  expect(button(wrapper, '发送').attributes('disabled')).toBeDefined();
  expect(wrapper.text()).toContain('这条夜间信息已结束');
  expect(wrapper.findAll('.composer-segment')).toHaveLength(1);
});

test.each([{ dm: true }, { seat: 0 }])('does not show the player receipt UI to a storyteller or spectator (%j)', async options => {
  const { wrapper, receive, request } = await viewer(options); await receive();
  expect(wrapper.find('.night-info-viewer__trigger').exists()).toBe(false);
  expect(wrapper.find('[data-modal="night-received"]').exists()).toBe(false);
  expect(request).not.toHaveBeenCalled();
});

test('another player delivery does not open a dialog and duplicate pushes do not reopen it', async () => {
  const { wrapper, receive } = await viewer(); await receive(incoming(), 'p2');
  expect(wrapper.find('[data-modal="night-received"]').exists()).toBe(false);
  await receive(); await button(wrapper, '夜间信息').trigger('click');
  await receive();
  expect(wrapper.find('[data-modal="night-received"]').exists()).toBe(false);
});

test('a room or identity change clears private UI state and ignores a late reply acknowledgement', async () => {
  const { wrapper, receive, request, session, chat } = await viewer(); await receive();
  let resolve!: (value: any) => void;
  request.mockImplementation(((event: string) => event === SocketClientEvent.SendDMMessage
    ? new Promise(yes => { resolve = yes; }) : Promise.resolve({ status: 200, data: { messages: [] } })) as any);
  await button(wrapper, '了解').trigger('click'); await button(wrapper, '发送').trigger('click');
  session.setApiRoomSession({ roomId: 'OTHER', gameServerId: 'server' }); await flushPromises();
  expect(wrapper.find('[data-modal="night-received"]').exists()).toBe(false);
  resolve({ status: 200, data: { messageId: 'late' } }); await flushPromises();
  expect(chat.getMessages('dm_skill', 'p1').some(item => item.messageId === 'late')).toBe(false);
});

test('closing and reopening restores the unsent reply, and server rejection preserves it', async () => {
  const { wrapper, receive, request } = await viewer(); await receive();
  await button(wrapper, '了解').trigger('click');
  wrapper.findComponent(Modal).vm.$emit('close'); await flushPromises();
  await button(wrapper, '夜间信息').trigger('click'); await flushPromises();
  expect(wrapper.get('.composer-segment').text()).toContain('了解');
  request.mockResolvedValue({ status: 500, message: '发送失败' } as any);
  await button(wrapper, '发送').trigger('click'); await flushPromises();
  expect(wrapper.get('.composer-segment').text()).toContain('了解');
  expect(wrapper.get('[role="status"]').text()).toBe('发送失败');
  expect(wrapper.findAll('.is-sent')).toHaveLength(0);
});

test('a live message during a picker appears in the same window and keeps the original reply target', async () => {
  const { wrapper, receive, request } = await viewer(); await receive();
  await button(wrapper, '玩家').trigger('click'); await receive(incoming('2'));
  useNightPlayerSelectionStore().choose(0); await flushPromises();
  expect(wrapper.get('.composer-segment').text()).toContain('1 号座位');
  expect(wrapper.findAll('.is-received')).toHaveLength(2);
  await button(wrapper, '发送').trigger('click'); await flushPromises();
  expect(request.mock.calls.at(-1)![1]).toMatchObject({ context: { actionId: 'reply:1' } });
});

test('reopens every received and sent row in chronological order, including earlier nights', async () => {
  const sent = incoming('2', { senderUserId: 'p1', isDM: false, content: [{ type: 'text', text: '了解' }], context: { ...incoming().context, actionId: 'reply:1' } });
  const later = incoming('3', { context: { ...incoming().context, levelDays: 2 } });
  const { wrapper } = await viewer({ history: [later, sent, incoming()] });
  await button(wrapper, '夜间信息').trigger('click'); await flushPromises();
  expect(wrapper.findAll('.night-exchange-row').map(item => item.classes().includes('is-sent'))).toEqual([false, true, false]);
  expect(wrapper.findAll('.composer-quick')).toHaveLength(1);
  expect(wrapper.text()).not.toContain('上一条'); expect(wrapper.text()).not.toContain('下一条');
});

test('a late history response cannot repopulate private messages after switching rooms', async () => {
  const { wrapper, request, session, chat } = await viewer();
  let resolve!: (value: any) => void;
  request.mockImplementationOnce(() => new Promise(yes => { resolve = yes; }));
  await button(wrapper, '夜间信息').trigger('click');
  session.setApiRoomSession({ roomId: 'OTHER', gameServerId: 'server' }); chat.resetRoomState(); await flushPromises();
  resolve({ status: 200, data: { messages: [incoming()] } }); await flushPromises();
  expect(chat.getMessages('dm_skill', 'p1')).toHaveLength(0);
  expect(wrapper.find('[data-modal="night-received"]').exists()).toBe(false);
});

test('rich content preserves line breaks and repeated roles, escapes custom text, and labels seat references', () => {
  const wrapper = mount(NightMessageContent, { props: { content: [
    { type: 'text', text: '他们是你的爪牙\n\n<script>bad()</script> 13 号座位' },
    { type: 'character', characterId: 'unknown-role', newLine: true },
  ] }, global: { stubs: { 'font-awesome-icon': true, RoleIcon: true } } });
  mounted.push(wrapper);
  expect(wrapper.findAll('br')).toHaveLength(3);
  expect(wrapper.find('script').exists()).toBe(false);
  expect(wrapper.text()).toContain('<script>bad()</script>');
  expect(wrapper.get('.is-player').text()).toBe('13 号座位');
  expect(wrapper.text()).toContain('未知角色');
});

import { createPinia, setActivePinia } from 'pinia';
import { config, flushPromises, shallowMount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import RoomVoiceControls from '@/components/RoomVoiceControls.vue';
import RoomNotifications from '@/components/RoomNotifications.vue';
import SendRolesControl from '@/components/SendRolesControl.vue';
import { useGameController } from '@/controllers/GameController';
import { SocketClientEvent } from '@/types/socket';
import { useVoiceController } from '@/controllers/VoiceController';
import { useGameStore } from '@/stores/game';
import { useSessionStore } from '@/stores/session';
import { useRoomNotificationsStore } from '@/stores/roomNotifications';

let wrapper: ReturnType<typeof shallowMount> | undefined;
beforeEach(() => {
  config.global.stubs['font-awesome-icon'] = true;
  setActivePinia(createPinia());
  localStorage.clear();
  useSessionStore().setApiRoomSession({ roomId: 'ROOM', gameServerId: 'server' });
  useGameStore().currentPlayer = { userId: 'a', seat: 1 } as never;
  Object.defineProperty(navigator, 'permissions', { configurable: true,
    value: { query: vi.fn(async () => ({ state: 'granted' })) } });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true,
    value: { getUserMedia: vi.fn() } });
});
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.useRealTimers(); vi.restoreAllMocks(); });

test('only storytellers can send roles and duplicate clicks wait for the server', async () => {
  window.$toast = { success: vi.fn(), error: vi.fn() } as never;
  const game = useGameStore(), controller = useGameController();
  controller.connectionStatus = 'connected';
  controller.gameSocket = {} as never;
  game.level = 'prepare';
  wrapper = shallowMount(SendRolesControl);
  expect(wrapper.find('button').exists()).toBe(false);
  game.currentPlayer = { userId: 'dm', isDM: true, seat: 0 } as never;
  await flushPromises();
  let resolve!: (value: never) => void;
  const request = vi.spyOn(controller, 'request').mockReturnValue(new Promise(done => { resolve = done; }));
  await wrapper.get('button').trigger('click');
  await wrapper.get('button').trigger('click');
  expect(request).toHaveBeenCalledOnce();
  expect(request).toHaveBeenCalledWith(SocketClientEvent.DMSendRoles, {});
  expect(wrapper.get('button').attributes('disabled')).toBeDefined();
  resolve({ status: 200 } as never);
  await flushPromises();
  expect(window.$toast.success).toHaveBeenCalledOnce();
  request.mockRejectedValueOnce(new Error('没有待发送的角色'));
  await wrapper.get('button').trigger('click');
  await flushPromises();
  expect(window.$toast.error).toHaveBeenCalledWith('没有待发送的角色');
  game.level = 'end';
  await flushPromises();
  expect(wrapper.get('button').attributes('disabled')).toBeDefined();
});

test('speaker joins with a closed microphone; listening and microphone toggle independently', async () => {
  const voice = useVoiceController();
  vi.spyOn(voice, 'ensureConnected').mockImplementation(async () => { voice.connectionStatus.active = 'connected'; });
  wrapper = shallowMount(RoomVoiceControls);
  await wrapper.get('[aria-label="收听语音"]').trigger('click');
  await flushPromises();
  expect(voice.microphoneMuted).toBe(true);
  expect(voice.speakerMuted).toBe(false);
  expect(navigator.permissions.query).not.toHaveBeenCalled();
  await wrapper.get('[aria-label="开麦"]').trigger('click');
  await flushPromises();
  expect(voice.microphoneMuted).toBe(false);
  expect(voice.speakingMode).toBe('open-mic');
  expect(wrapper.find('[aria-label="按住发言"]').exists()).toBe(false);
  await wrapper.get('[aria-label="停止收听语音"]').trigger('click');
  await flushPromises();
  expect(voice.speakerMuted).toBe(true);
  expect(voice.microphoneMuted).toBe(false);
  await wrapper.get('[aria-label="闭麦"]').trigger('click');
  await flushPromises();
  expect(voice.microphoneMuted).toBe(true);
});

test('spectators can listen without a microphone permission request and cannot unmute', async () => {
  useGameStore().currentPlayer = null;
  const voice = useVoiceController();
  vi.spyOn(voice, 'ensureConnected').mockImplementation(async () => { voice.connectionStatus.active = 'connected'; });
  wrapper = shallowMount(RoomVoiceControls);
  expect(wrapper.get('[aria-label="旁观者只能收听，不能开麦"]').attributes('disabled')).toBeDefined();
  await wrapper.get('[aria-label="收听语音"]').trigger('click');
  await flushPromises();
  expect(voice.connectionStatus.active).toBe('connected');
  await expect(voice.setMicrophoneMuted(false)).rejects.toThrow('旁观者');
  expect(navigator.permissions.query).not.toHaveBeenCalled();
});

test('voice failures appear under the notification bell instead of opening a settings modal', async () => {
  vi.spyOn(useVoiceController(), 'ensureConnected').mockRejectedValue(new Error('语音服务暂不可用'));
  wrapper = shallowMount(RoomVoiceControls);
  await wrapper.get('[aria-label="收听语音"]').trigger('click');
  await flushPromises();
  expect(useRoomNotificationsStore().preview?.message).toBe('语音服务暂不可用');
});

test('notification preview expires while unread history remains; opening the bell marks it read', async () => {
  vi.useFakeTimers();
  const notices = useRoomNotificationsStore();
  notices.enterRoom('server:ROOM');
  wrapper = shallowMount(RoomNotifications);
  notices.add({ message: '房间公告示例' });
  await wrapper.vm.$nextTick();
  expect(wrapper.get('[role="status"]').text()).toContain('房间公告示例');
  await vi.advanceTimersByTimeAsync(8000);
  expect(wrapper.find('[role="status"]').exists()).toBe(false);
  expect(notices.unreadCount).toBe(1);
  await wrapper.get('.notification-bell').trigger('click');
  expect(notices.unreadCount).toBe(0);
  expect(wrapper.get('#room-notification-list').text()).toContain('房间公告示例');
  await wrapper.get('[aria-label="删除这条通知"]').trigger('click');
  expect(wrapper.text()).toContain('暂无房间通知');
});

test('room-close notices stay visible, updates do not duplicate, and switching rooms clears them', async () => {
  vi.useFakeTimers();
  const notices = useRoomNotificationsStore();
  notices.enterRoom('server:first');
  wrapper = shallowMount(RoomNotifications);
  notices.add({ key: 'close', message: '房间将在 22:22 关闭', sticky: true, tone: 'warning' });
  notices.add({ key: 'close', message: '房间将在 22:22 关闭', sticky: true, tone: 'warning' });
  await wrapper.vm.$nextTick();
  await vi.advanceTimersByTimeAsync(10000);
  expect(wrapper.get('[role="status"]').text()).toContain('22:22');
  expect(notices.items).toHaveLength(1);
  notices.enterRoom('server:second');
  await wrapper.vm.$nextTick();
  expect(wrapper.find('[role="status"]').exists()).toBe(false);
  expect(notices.items).toHaveLength(0);
});

test('retrying the same failed action shows the error again without duplicating history', () => {
  const notices = useRoomNotificationsStore();
  notices.add({ key: 'voice-error', message: '语音连接失败' });
  notices.markRead();
  notices.add({ key: 'voice-error', message: '语音连接失败' });
  expect(notices.preview?.message).toBe('语音连接失败');
  expect(notices.unreadCount).toBe(1);
  expect(notices.items).toHaveLength(1);
});

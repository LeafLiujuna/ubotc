import { createPinia, setActivePinia } from 'pinia';
import { config, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import RoomInfoModal from '@/components/modals/RoomInfoModal.vue';
import RoomMemberProfile from '@/components/modals/RoomMemberProfile.vue';
import { GameApi } from '@/api/http/game';
import { UserApi } from '@/api/http/user';
import { useAppStore } from '@/stores/app';
import { useGameStore } from '@/stores/game';
import { useSessionStore } from '@/stores/session';
import { useUserStore } from '@/stores/user';
import { useGameController } from '@/controllers/GameController';
import { useVoiceController } from '@/controllers/VoiceController';
import { requestInputModal } from '@/services/inputModalService';
import { SocketClientEvent } from '@/types/socket';

vi.mock('@/services/inputModalService', () => ({ requestInputModal: vi.fn(async () => true) }));
let wrapper: ReturnType<typeof mount> | undefined;
const member = { userId: 'guest', name: '旁观成员', isDM: false, isOwner: false, connected: true, seat: 0 };
beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  config.global.stubs['font-awesome-icon'] = true;
  useSessionStore().setApiRoomSession({ roomId: 'ROOM', gameServerId: 'server' });
  useUserStore().setCurrentUser({ id: 'host', displayName: '房主' } as never);
  const game = useGameStore();
  game.currentPlayer = { userId: 'host', isDM: true, seat: 0 } as never;
  game.roomMeta = { roomTitle: '原房名', dmUserIds: ['host'] } as never;
  game.roomUsers = {
    host: { userId: 'host', displayName: '房主', isDM: true, isRoomOwner: true },
    guest: { userId: 'guest', displayName: '旁观成员' },
    seated: { userId: 'seated', displayName: '离线玩家', disconnectedAt: 1 },
  } as never;
  game.players = { seated: { userId: 'seated', seat: 2, connected: false } } as never;
  const controller = useGameController();
  controller.connectionStatus = 'connected'; controller.gameSocket = {} as never;
  vi.spyOn(controller, 'request').mockResolvedValue({ status: 200 } as never);
  vi.spyOn(GameApi, 'getRoom').mockResolvedValue({ data: { name: '原房名', isPrivate: true } } as never);
  vi.spyOn(UserApi, 'getUserProfile').mockResolvedValue({ data: { id: 'guest', publicId: '12345678', stats: null, createdAt: 1700000000000 } } as never);
  vi.mocked(requestInputModal).mockResolvedValue(true);
});
afterEach(() => { wrapper?.unmount(); wrapper = undefined; vi.restoreAllMocks(); });

function openRoom() {
  useAppStore().toggleModal('roomInfo');
  wrapper = mount(RoomInfoModal, { global: { stubs: { Modal: { template: '<div><slot /></div>' } } } });
  return wrapper;
}
test('room uses actual privacy data, groups offline seats and opens member profiles', async () => {
  openRoom(); await flushPromises();
  expect(wrapper!.text()).toContain('需要房间密码');
  expect(wrapper!.get('section[aria-label="玩家"]').text()).toMatch(/2\.离线玩家\s*离线/);
  expect(wrapper!.get('section[aria-label="旁观者"]').text()).toContain('旁观成员');
  await wrapper!.get('[aria-label="查看旁观成员的资料"]').trigger('click'); await flushPromises();
  expect(UserApi.getUserProfile).toHaveBeenCalledWith('guest');
  expect(wrapper!.text()).toContain('12345678');
  expect(wrapper!.text()).toContain('未公开');
  expect(wrapper!.get('button.gold').text()).toContain('添加说书人');
});
test('room owner saves a trimmed title only after confirmation and copies a usable room link', async () => {
  const copy = vi.fn(async () => {});
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  openRoom(); await flushPromises();
  await wrapper!.get('input').setValue('  新房名  '); await flushPromises();
  expect(useGameController().request).toHaveBeenCalledWith(SocketClientEvent.AdminUpdateRoomMeta, { roomTitle: '新房名' });
  expect(useGameStore().roomMeta?.roomTitle).toBe('新房名');
  await wrapper!.get('[aria-label="复制房间链接"]').trigger('click'); await flushPromises();
  expect(copy).toHaveBeenCalledWith(new URL('/game/ROOM', window.location.origin).href);
});
test('ordinary members cannot edit room titles or manage other members', async () => {
  useGameStore().currentPlayer = null;
  useGameStore().roomUsers.host.isRoomOwner = false;
  openRoom(); await flushPromises();
  expect(wrapper!.get('input').attributes('readonly')).toBeDefined();
  await wrapper!.get('input').setValue('无权限');
  expect(useGameController().request).not.toHaveBeenCalled();
  await wrapper!.get('[aria-label="查看旁观成员的资料"]').trigger('click'); await flushPromises();
  expect(wrapper!.find('button.gold').exists()).toBe(false);
  expect(wrapper!.text()).not.toContain('踢出用户');
});
test('member promotion asks once and waits for the server, then reports errors', async () => {
  wrapper = mount(RoomMemberProfile, { props: { member } }); await flushPromises();
  let reject!: (reason: Error) => void;
  vi.mocked(useGameController().request).mockReturnValueOnce(new Promise((_resolve, done) => { reject = done; }));
  await wrapper.get('button.gold').trigger('click'); await flushPromises();
  await wrapper.get('button.gold').trigger('click');
  expect(requestInputModal).toHaveBeenCalledOnce();
  expect(useGameController().request).toHaveBeenCalledOnce();
  expect(useGameController().request).toHaveBeenCalledWith(SocketClientEvent.SetDM, { userId: 'guest', mode: 'set' });
  expect(wrapper.get('button.gold').attributes('disabled')).toBeDefined();
  reject(new Error('该成员已离线')); await flushPromises();
  expect(wrapper.get('[role="status"]').text()).toBe('该成员已离线');
  expect(wrapper.get('button.gold').attributes('disabled')).toBeUndefined();
});
test('owner and disconnected profiles cannot be changed, cancelling a kick sends nothing', async () => {
  wrapper = mount(RoomMemberProfile, { props: { member: { ...member, isOwner: true, isDM: true } } });
  await flushPromises();
  expect(wrapper.text()).not.toContain('移除说书人');
  expect(wrapper.text()).not.toContain('踢出用户');
  await wrapper.setProps({ member: { ...member, connected: false } });
  expect(wrapper.text()).not.toContain('添加说书人');
  expect(wrapper.text()).not.toContain('踢出用户');
  await wrapper.setProps({ member });
  vi.mocked(requestInputModal).mockResolvedValueOnce(false);
  const kick = vi.spyOn(useGameController(), 'kickUser');
  await wrapper.get('.profile-actions button:nth-last-child(2)').trigger('click'); await flushPromises();
  expect(kick).not.toHaveBeenCalled();
});
test('personal volume and mute affect the selected member only', async () => {
  const voice = useVoiceController();
  const volume = vi.spyOn(voice, 'setUserVolume'), mute = vi.spyOn(voice, 'toggleLocalMuteUser');
  wrapper = mount(RoomMemberProfile, { props: { member } }); await flushPromises();
  await wrapper.get('input[type="range"]').setValue('150');
  expect(volume).toHaveBeenCalledWith('guest', 150);
  await wrapper.get('[aria-label="静音该用户"]').trigger('click');
  expect(mute).toHaveBeenCalledWith('guest');
});

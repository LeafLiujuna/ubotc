import { flushPromises, mount, VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { UserApi } from '@/api/http/user'
import { useUserStore } from '@/stores/user'
import UserCenter from '@/views/UserCenter.vue'
import { prepareAvatar } from '@/utils/avatar'
vi.mock('@/utils/avatar', () => ({ prepareAvatar: vi.fn() }))

const wrappers: VueWrapper[] = []
const profile = { id: 'player-1', publicId: '12345678', displayName: '原昵称', username: 'player', email: 'player@example.test', emailLinked: true, lastLoginIp: '203.0.113.10', lastLoginAt: 1792500000, level: 1, storytellerLevel: 0, lastSeenAt: 0, hideGameResults: false }
function render() {
  const wrapper = mount(UserCenter, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
  wrappers.push(wrapper); return wrapper
}
beforeEach(() => {
  setActivePinia(createPinia()); vi.restoreAllMocks()
  vi.spyOn(UserApi, 'getMe').mockResolvedValue({ status: 200, data: { ...profile } })
  vi.spyOn(UserApi, 'getMyGames').mockResolvedValue({ status: 200, data: { items: [], page: 1, total: 0, totalPages: 0 } })
})
afterEach(() => wrappers.splice(0).forEach(wrapper => wrapper.unmount()))

test('loads account data and saves a trimmed nickname into shared navigation state', async () => {
  const save = vi.spyOn(UserApi, 'updateProfile').mockResolvedValue({ status: 200, data: { displayName: '新昵称' } })
  const wrapper = render(); await flushPromises()
  expect(wrapper.text()).toContain(profile.email); expect(wrapper.text()).toContain(profile.lastLoginIp)
  expect(wrapper.get('.user-id').text()).toBe('用户 ID：12345678')
  expect(wrapper.get('.user-id').text()).not.toContain(profile.id)
  await wrapper.get('#profile-name').setValue('  新昵称  ')
  await wrapper.get('form').trigger('submit'); await flushPromises()
  expect(save).toHaveBeenCalledWith('新昵称')
  expect(useUserStore().current?.displayName).toBe('新昵称')
  expect(wrapper.get('[role="status"]').text()).toContain('已保存')
})

test('previews an avatar and updates shared navigation only after saving', async () => {
  vi.mocked(prepareAvatar).mockResolvedValue('data:image/jpeg;base64,preview')
  const save = vi.spyOn(UserApi, 'updateAvatar').mockResolvedValue({ status: 200, data: { avatarUrl: '/api/avatars/12345678/new.jpg' } })
  const wrapper = render(); await flushPromises()
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [new File(['image'], 'avatar.png', { type: 'image/png' })] })
  await input.trigger('change'); await flushPromises()
  expect(wrapper.get('img[alt="新头像预览"]').attributes('src')).toContain('preview')
  expect(save).not.toHaveBeenCalled()
  await wrapper.findAll('button').find(b => b.text() === '保存头像')!.trigger('click'); await flushPromises()
  expect(save).toHaveBeenCalledWith('data:image/jpeg;base64,preview')
  expect(useUserStore().current?.avatarUrl).toBe('/api/avatars/12345678/new.jpg')
  expect(wrapper.find('img[alt="新头像预览"]').exists()).toBe(false)
})

test('avatar upload failure preserves the saved avatar and keeps a retry preview', async () => {
  vi.mocked(UserApi.getMe).mockResolvedValue({ status: 200, data: { ...profile, avatarUrl: '/old.jpg' } })
  vi.mocked(prepareAvatar).mockResolvedValue('data:image/jpeg;base64,preview')
  vi.spyOn(UserApi, 'updateAvatar').mockRejectedValue(new Error('上传失败'))
  const wrapper = render(); await flushPromises()
  const input = wrapper.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: [new File(['image'], 'avatar.png', { type: 'image/png' })] })
  await input.trigger('change'); await flushPromises()
  await wrapper.findAll('button').find(b => b.text() === '保存头像')!.trigger('click'); await flushPromises()
  expect(useUserStore().current?.avatarUrl).toBe('/old.jpg')
  expect(wrapper.find('img[alt="新头像预览"]').exists()).toBe(true)
  expect(wrapper.get('[role="alert"]').text()).toContain('上传失败')
})

test('failed privacy save restores the checkbox and preserves the previous preference', async () => {
  vi.spyOn(UserApi, 'setGameResultsHidden').mockRejectedValue(new Error('网络不可用'))
  const wrapper = render(); await flushPromises()
  await wrapper.get('input[type="checkbox"]').setValue(true); await flushPromises()
  expect(wrapper.get('input[type="checkbox"]').element).toHaveProperty('checked', false)
  expect(useUserStore().current?.hideGameResults).toBe(false)
  expect(wrapper.get('[role="alert"]').text()).toContain('网络不可用')
})

test('history pagination requests the next page and labels unfinished games correctly', async () => {
  vi.mocked(UserApi.getMyGames).mockResolvedValue({ status: 200, data: {
    items: [{ id: 1, gameResultId: 'game-1', isDM: false, characterId: 'washerwoman', team: 'good', result: 'incomplete', isMvp: false, playedAt: 1792500000 }], page: 1, total: 11, totalPages: 2,
  } })
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('tbody').text()).toContain('未完成')
  const next = wrapper.findAll('button').find(button => button.text() === '下一页')!
  await next.trigger('click'); await flushPromises()
  expect(UserApi.getMyGames).toHaveBeenLastCalledWith(2, 10)
})

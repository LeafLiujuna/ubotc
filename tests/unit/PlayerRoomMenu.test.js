import { shallowMount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia, getActivePinia } from 'pinia'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import PlayerRoomMenu from '@/components/PlayerRoomMenu.vue'
import { useAppStore } from '@/stores/app'
import { useGameStore } from '@/stores/game'
import { usePlayerViewStore } from '@/stores/playerView'
import { useSessionStore } from '@/stores/session'
import { useUserStore } from '@/stores/user'
import { useGameController } from '@/controllers/GameController'
import { requestInputModal } from '@/services/inputModalService'
import { SocketClientEvent } from '@/types/socket'
vi.mock('@/services/inputModalService', () => ({ requestInputModal: vi.fn() }))
let wrapper
const player = {
  id: 'a',
  role: { id: 'imp' },
  reminders: ['醉酒'],
  stReminders: ['中毒'],
}
beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  useUserStore().setCurrentUser({ id: 'a' })
  useSessionStore().setApiRoomSession({
    roomId: 'ROOM',
    gameServerId: 'server',
  })
  useAppStore().toggleMenu(true)
  useGameStore().currentPlayer = { userId: 'a', seat: 1, isDM: false }
  window.$toast = { error: vi.fn(), info: vi.fn(), success: vi.fn() }
  vi.clearAllMocks()
})
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks() })
function render() {
  wrapper = shallowMount(PlayerRoomMenu, {
    global: { stubs: { 'font-awesome-icon': true, SendRolesControl: false } },
  })
  return wrapper
}
function button(text) {
  return wrapper.findAll('button').find((item) => item.text().includes(text))
}

test('three ordered tabs show player commands, gate storyteller by seat, and omit unconfigured links', async () => {
  render()
  expect(
    wrapper.findAll('[role="tab"]').map((item) => item.attributes('aria-label'))
  ).toEqual(['游玩中', '游戏中', 'APP'])
  expect(wrapper.text()).not.toContain('成为说书人')
  useGameStore().currentPlayer = null
  await wrapper.vm.$nextTick()
  await button('成为说书人').trigger('click')
  expect(wrapper.emitted('become')).toEqual([[]])
  await wrapper.find('[aria-label="游戏中"]').trigger('click')
  expect(wrapper.text()).toContain('请求私聊')
  expect(wrapper.text()).not.toContain('管理')
  await wrapper.find('[aria-label="APP"]').trigger('click')
  for (const text of ['报告问题', '下载 Windows App', '改善此翻译'])
    expect(button(text)).toBeUndefined()
  await wrapper
    .find('[aria-label="APP"]')
    .trigger('keydown', { key: 'ArrowLeft' })
  expect(
    wrapper.find('[aria-label="游戏中"]').attributes('aria-selected')
  ).toBe('true')
})

test('clear requires confirmation and local masks survive updates without changing server records or other windows', async () => {
  render()
  requestInputModal.mockResolvedValueOnce(false)
  await button('清空魔典').trigger('click')
  await flushPromises()
  expect(usePlayerViewStore().rolesCleared).toBe(false)
  useAppStore().toggleMenu(true)
  await wrapper.vm.$nextTick()
  requestInputModal.mockResolvedValueOnce(true)
  await button('清空魔典').trigger('click')
  await flushPromises()
  const view = usePlayerViewStore()
  expect(view.project([player])[0]).toMatchObject({
    role: { id: '' },
    reminders: [],
    stReminders: [],
  })
  expect(view.project([{ ...player, role: { id: 'chef' } }])[0].role.id).toBe(
    ''
  )
  expect(player.role.id).toBe('imp')
  const currentWindow = getActivePinia()
  const otherWindow = createPinia()
  expect(usePlayerViewStore(otherWindow).project([player])[0].role.id).toBe(
    'imp'
  )
  setActivePinia(currentWindow)
  useSessionStore().setSessionId('OTHER')
  await wrapper.vm.$nextTick()
  expect(view.project([player])[0].role.id).toBe('imp')
})

test('leaving a seat sends the real request once without confirmation, hiding the table, or leaving the room', async () => {
  const controller = useGameController()
  let complete
  const leave = vi.spyOn(controller, 'leaveSeat').mockImplementation(() => new Promise(resolve => { complete = resolve }))
  const refresh = vi.spyOn(controller, 'refreshGameState').mockImplementation(async () => {
    useGameStore().currentPlayer = null
    return { status: 200 }
  })
  render()
  expect(wrapper.text()).not.toContain('清空坐席')
  await button('离开坐席').trigger('click')
  expect(leave).toHaveBeenCalledOnce()
  expect(button('离开坐席').attributes('disabled')).toBeDefined()
  await button('离开坐席').trigger('click')
  expect(leave).toHaveBeenCalledOnce()
  expect(useGameStore().currentPlayer.seat).toBe(1)
  expect(refresh).not.toHaveBeenCalled()
  complete({ status: 200 })
  await flushPromises()
  expect(refresh).toHaveBeenCalledOnce()
  expect(useGameStore().currentPlayer).toBeNull()
  expect(usePlayerViewStore().project([player])).toEqual([player])
  expect(useSessionStore().sessionId).toBe('ROOM')
  expect(wrapper.emitted('leave')).toBeUndefined()
  expect(requestInputModal).not.toHaveBeenCalled()
  expect(window.$toast.info).not.toHaveBeenCalled()
  expect(window.$toast.success).not.toHaveBeenCalled()
  expect(useAppStore().grimoire.isMenuOpen).toBe(false)
})

test('a rejected seat departure preserves the seat and allows retry; spectators cannot leave a seat', async () => {
  const controller = useGameController()
  const leave = vi.spyOn(controller, 'leaveSeat').mockRejectedValue(new Error('连接已断开'))
  const refresh = vi.spyOn(controller, 'refreshGameState')
  render()
  await button('离开坐席').trigger('click')
  await flushPromises()
  expect(useGameStore().currentPlayer.seat).toBe(1)
  expect(window.$toast.error).toHaveBeenCalledWith('连接已断开')
  expect(refresh).not.toHaveBeenCalled()
  expect(button('离开坐席').attributes('disabled')).toBeUndefined()
  useGameStore().currentPlayer = null
  await wrapper.vm.$nextTick()
  expect(button('离开坐席').attributes('disabled')).toBeDefined()
  await button('离开坐席').trigger('click')
  expect(leave).toHaveBeenCalledOnce()
})

test('hand signals never submit a vote, and player menu reuses member and role surfaces', async () => {
  const request = vi
    .spyOn(useGameController(), 'request')
    .mockResolvedValue({ status: 200 })
  const chat = vi.fn()
  const roles = vi.fn()
  window.addEventListener('ts-request-voice-chat', chat)
  window.addEventListener('ts-open-reference', roles)
  render()
  await wrapper.find('[aria-label="游戏中"]').trigger('click')
  await button('举手').trigger('click')
  await flushPromises()
  expect(request).toHaveBeenLastCalledWith(SocketClientEvent.SetHandSignal, {
    icon: '✋',
  })
  useGameStore().handSignals = { a: '✋' }
  await wrapper.vm.$nextTick()
  await button('放下手').trigger('click')
  await flushPromises()
  expect(request).toHaveBeenLastCalledWith(SocketClientEvent.SetHandSignal, {
    icon: null,
  })
  await button('请求私聊').trigger('click')
  expect(chat).toHaveBeenCalledOnce()
  useAppStore().toggleMenu(true)
  await wrapper.vm.$nextTick()
  await button('角色列表').trigger('click')
  expect(roles.mock.calls[0][0].detail).toBe('right-roles-panel')
  useAppStore().toggleMenu(true)
  await wrapper.vm.$nextTick()
  await button('用户列表').trigger('click')
  expect(useAppStore().modals.roomInfo).toBe(true)
  window.removeEventListener('ts-request-voice-chat', chat)
  window.removeEventListener('ts-open-reference', roles)
})


test('storyteller setup page follows the video and switches back when permission is removed', async () => {
  useGameStore().currentPlayer = { userId: 'a', seat: 0, isDM: true }
  render()
  expect(wrapper.find('[role="tab"]').attributes('aria-label')).toBe('新游戏')
  expect(wrapper.findAll('.player-menu-body > button').map(item => item.find('span').text())).toEqual([
    '添加玩家', '选择剧本', '阅读游戏规则', '添加 NPC', '选择角色', '发送角色', '揭晓魔典', '清空魔典', '卸任说书人', '离开游戏',
  ])
  expect(button('揭晓魔典').attributes('disabled')).toBeUndefined()
  await button('添加玩家').trigger('click')
  expect(wrapper.emitted('command')).toEqual([['seats']])
  useAppStore().toggleMenu(true)
  useGameStore().level = 'day'
  await wrapper.vm.$nextTick()
  for (const label of ['添加玩家', '选择剧本', '添加 NPC', '选择角色']) {
    expect(button(label).attributes('disabled')).toBeUndefined()
  }
  await button('揭晓魔典').trigger('click')
  expect(wrapper.emitted('command').at(-1)).toEqual(['reveal'])
  useAppStore().toggleMenu(true)
  useGameStore().currentPlayer = null
  await wrapper.vm.$nextTick()
  expect(wrapper.find('[role="tab"]').attributes('aria-label')).toBe('游玩中')
  expect(wrapper.text()).not.toContain('卸任说书人')
  expect(wrapper.text()).toContain('成为说书人')
})

test('storyteller game page retains ordered commands and permits its independent hand signal', async () => {
  useGameStore().currentPlayer = { userId: 'a', seat: 0, isDM: true }
  const request = vi.spyOn(useGameController(), 'request').mockResolvedValue({ status: 200 })
  render()
  await wrapper.find('[aria-label="游戏中"]').trigger('click')
  expect(wrapper.findAll('.player-menu-body > button, .hand-row > button:first-child').map(item => item.text())).toEqual([
    '请求私聊ENTER', '举手', '显示城镇广场T', '前往夜晚阶段N', '角色列表C', '夜晚顺序表O', '投票历史记录V', '让大家回到城镇广场R', '设定计时器Z', '用户列表U',
  ])
  await button('举手').trigger('click')
  await flushPromises()
  expect(request).toHaveBeenLastCalledWith(SocketClientEvent.SetHandSignal, { icon: '✋' })
  await button('设定计时器').trigger('click')
  expect(wrapper.emitted('command').at(-1)).toEqual(['timer'])
})

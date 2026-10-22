import { beforeEach, expect, test, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ReminderToken from '@/components/ReminderToken.vue'
import TownSquare from '@/components/TownSquare.vue'
import { usePlayerViewStore } from '@/stores/playerView'
import { useSessionStore } from '@/stores/session'
import { useUserStore } from '@/stores/user'
import { useAppStore } from '@/stores/app'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  window.$toast = { error: vi.fn() } as never
})

test('clicking a reminder is harmless; rotate and delete are separate labelled actions', async () => {
  const wrapper = shallowMount(ReminderToken, {
    props: { name: '中毒', role: { id: 'poisoner' }, canEdit: true, rotated: false, pending: false, isImageOptIn: true },
    global: { stubs: { 'font-awesome-icon': true } },
  })
  await wrapper.get('[aria-label="操作提示：中毒"]').trigger('click')
  expect(wrapper.emitted('remove')).toBeUndefined()
  expect(wrapper.emitted('rotate')).toBeUndefined()
  await wrapper.get('[aria-label="旋转提示：中毒"]').trigger('click')
  expect(wrapper.emitted('rotate')).toHaveLength(1)
  expect(wrapper.emitted('remove')).toBeUndefined()
  await wrapper.setProps({ rotated: true, pending: true })
  expect(wrapper.get('[aria-label="恢复提示：中毒"]').attributes('aria-pressed')).toBe('true')
  expect(wrapper.findAll('button').every(button => button.attributes('disabled') !== undefined)).toBe(true)
  await wrapper.setProps({ pending: false })
  await wrapper.get('[aria-label="删除提示：中毒"]').trigger('click')
  expect(wrapper.emitted('remove')).toHaveLength(1)
  await wrapper.setProps({ canEdit: false })
  expect(wrapper.find('[role="group"]').exists()).toBe(false)
  wrapper.unmount()
})

function context(overrides: Record<string, unknown> = {}) {
  const player = { id: 'one', reminders: ['中毒', { name: '醉酒', role: 'drunk' }] }
  const ctx: any = {
    players: [player], canManageActionSeat: true, isPersonalGrimoire: false, isApiRoom: false,
    emptySeatReminders: {}, reminderActionPending: '',
    gameStore: { players: { one: { hiddenExtras: { apparentCharacterId: 'chef', rotatedReminders: ['醉酒'] } } } },
    gameController: { updatePlayer: vi.fn().mockResolvedValue({}), refreshGameState: vi.fn().mockResolvedValue({}) },
    updatePlayerState: ({ player, property, value }: any) => { player[property] = value },
    ...overrides,
  }
  for (const name of ['reminderEntries', 'isReminderRotated', 'rotateApiReminder', 'removeApiReminder'] as const) {
    ctx[name] = (...args: unknown[]) => (TownSquare.methods[name] as any).apply(ctx, args)
  }
  return ctx
}

test('rotation toggles just the chosen local reminder and preserves its role and neighbours', async () => {
  const ctx = context()
  await ctx.rotateApiReminder(0, '醉酒')
  expect(ctx.players[0].reminders).toEqual(['中毒', { name: '醉酒', role: 'drunk', isRotated: true }])
  await ctx.rotateApiReminder(0, '醉酒')
  expect(ctx.isReminderRotated(0, '醉酒')).toBe(false)
  await ctx.rotateApiReminder(0, '中毒')
  expect(ctx.isReminderRotated(0, '中毒')).toBe(true)
  await ctx.removeApiReminder(0, '中毒')
  expect(ctx.players[0].reminders).toEqual([{ name: '醉酒', role: 'drunk', isRotated: false }])
  expect(ctx.gameController.updatePlayer).not.toHaveBeenCalled()
})

test('personal rotation survives notebook reload without writing to the server', async () => {
  useUserStore().setCurrentUser({ id: 'me' } as never)
  useSessionStore().setApiRoomSession({ roomId: 'ROOM', gameServerId: 'server' })
  const ctx = context({ isPersonalGrimoire: true, canManageActionSeat: false, isApiRoom: true })
  const original = ctx.players
  await ctx.rotateApiReminder(0, '中毒')
  expect(original[0].reminders[0]).toBe('中毒')
  ctx.players = usePlayerViewStore().project(original as never)
  expect(ctx.isReminderRotated(0, '中毒')).toBe(true)
  const stored = JSON.parse(localStorage.getItem(usePlayerViewStore().notebookKey) || '{}')
  expect(stored.notes['user:one'].reminders[0]).toEqual({ name: '中毒', isRotated: true })
  usePlayerViewStore().$dispose()
  setActivePinia(createPinia())
  useUserStore().setCurrentUser({ id: 'me' } as never)
  useSessionStore().setApiRoomSession({ roomId: 'ROOM', gameServerId: 'server' })
  ctx.players = usePlayerViewStore().project(original as never)
  expect(ctx.isReminderRotated(0, '中毒')).toBe(true)
  expect(ctx.gameController.updatePlayer).not.toHaveBeenCalled()
})

test('online rotation preserves hidden role data; deleting removes its saved rotation too', async () => {
  const ctx = context({ isApiRoom: true })
  await ctx.rotateApiReminder(0, '中毒')
  expect(ctx.gameController.updatePlayer).toHaveBeenLastCalledWith({ userId: 'one', hiddenExtras: {
    apparentCharacterId: 'chef', rotatedReminders: ['醉酒', '中毒'],
  } })
  expect(ctx.gameController.refreshGameState).toHaveBeenCalledOnce()
  await ctx.removeApiReminder(0, '醉酒')
  expect(ctx.gameController.updatePlayer).toHaveBeenLastCalledWith({ userId: 'one', marks: ['中毒'], hiddenExtras: {
    apparentCharacterId: 'chef', rotatedReminders: [],
  } })
})

test('read-only users cannot edit; pending requests block repeat clicks and recover after failure', async () => {
  const ctx = context({ isApiRoom: true, canManageActionSeat: false })
  await ctx.rotateApiReminder(0, '中毒')
  await ctx.removeApiReminder(0, '中毒')
  expect(ctx.gameController.updatePlayer).not.toHaveBeenCalled()
  ctx.canManageActionSeat = true
  let fail!: (error: Error) => void
  ctx.gameController.updatePlayer.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
  const pending = ctx.rotateApiReminder(0, '中毒')
  await ctx.rotateApiReminder(0, '中毒')
  await ctx.removeApiReminder(0, '中毒')
  expect(ctx.gameController.updatePlayer).toHaveBeenCalledOnce()
  fail(new Error('连接失败'))
  await pending
  expect(ctx.reminderActionPending).toBe('')
  expect(window.$toast.error).toHaveBeenCalledWith('连接失败')
  expect(ctx.gameController.refreshGameState).not.toHaveBeenCalled()
})

test('other reminders include every script role, including unassigned roles and related reminders', () => {
  useAppStore().otherTravelers = new Map()
  const roles = new Map([
    ['active', { id: 'active', reminders: ['已使用'] }],
    ['absent', { id: 'absent', reminders: ['醉酒', '醉酒'], remindersGlobal: ['醉酒', '是酒鬼'] }],
    ['custom', { id: 'custom-role', image: '/custom.png', reminders: ['自制提示'] }],
  ])
  const ctx: any = { roles, players: [{ id: 'one', role: { id: 'active' }, reminders: [] }],
    fabled: [], emptySeatReminders: {}, reminderPickerTab: 'other', reminderSearch: '', isPersonalGrimoire: true }
  ctx.apiReminderOptions = TownSquare.computed.apiReminderOptions.call(ctx)
  ctx.apiReminderRelatedOptions = TownSquare.computed.apiReminderRelatedOptions.call(ctx)
  const options = TownSquare.methods.availableApiReminders.call(ctx, 0)
  expect(options.map((option: any) => option.name)).toEqual(['已使用', '醉酒', '是酒鬼', '自制提示', '善良', '邪恶', '自定义'])
  expect(options.find((option: any) => option.name === '自制提示')).toMatchObject({ role: 'custom-role', image: '/custom.png' })
  ctx.reminderPickerTab = 'related'
  expect(TownSquare.methods.availableApiReminders.call(ctx, 0).map((option: any) => option.name))
    .toEqual(['已使用', '善良', '邪恶', '自定义'])
})

test('script-wide reminders respect search and existing marks, and change with the script', () => {
  useAppStore().otherTravelers = new Map()
  const ctx: any = { roles: new Map([['first', { id: 'first', reminders: ['中毒', '醉酒'] }]]),
    players: [{ id: 'one', role: { id: '' }, reminders: ['中毒'] }], fabled: [], emptySeatReminders: {},
    reminderPickerTab: 'other', reminderSearch: '醉', isPersonalGrimoire: true }
  ctx.apiReminderOptions = TownSquare.computed.apiReminderOptions.call(ctx)
  expect(TownSquare.methods.availableApiReminders.call(ctx, 0).map((option: any) => option.name)).toEqual(['醉酒'])
  ctx.reminderSearch = '中毒'
  expect(TownSquare.methods.availableApiReminders.call(ctx, 0)).toEqual([])
  ctx.roles = new Map([['second', { id: 'second', reminders: ['已保护'] }]])
  ctx.reminderSearch = ''
  ctx.apiReminderOptions = TownSquare.computed.apiReminderOptions.call(ctx)
  expect(TownSquare.methods.availableApiReminders.call(ctx, 0).map((option: any) => option.name))
    .toEqual(['已保护', '善良', '邪恶', '自定义'])
})

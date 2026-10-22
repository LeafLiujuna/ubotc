import { shallowMount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import RolesModal from '@/components/modals/RolesModal.vue'
import RoleModal from '@/components/modals/RoleModal.vue'
import Token from '@/components/Token.vue'
import FabledModal from '@/components/modals/FabledModal.vue'
import { useAppStore } from '@/stores/app'
import { useGameStore } from '@/stores/game'
import { usePlayersStore } from '@/stores/players'
import { useSessionStore } from '@/stores/session'
import { useGameController } from '@/controllers/GameController'
import { usePlayerViewStore } from '@/stores/playerView'
import TownSquare from '@/components/TownSquare.vue'
import { requestInputModal } from '@/services/inputModalService'
vi.mock('@/services/inputModalService', () => ({ requestInputModal: vi.fn() }))
let wrapper
beforeEach(() => {
  setActivePinia(createPinia())
  useSessionStore().setApiRoomSession({ roomId: 'ROOM', gameServerId: 'server' })
  const app = useAppStore()
  app.roles = new Map([['chef', { id: 'chef', name: '厨师', team: 'townsfolk' }]])
  app.toggleModal('roles')
  useGameStore().currentPlayer = { userId: 'dm', isDM: true, seat: 0 }
  useGameStore().players = { a: { userId: 'a', seat: 1, characterId: '' } }
  useGameStore().seatCount = 1
  usePlayersStore().set([{ id: 'a', role: { id: '' }, reminders: [] }])
  requestInputModal.mockResolvedValue(true)
  window.$toast = { error: vi.fn(), success: vi.fn() }
})
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks() })
function render() {
  wrapper = shallowMount(RolesModal, { global: { stubs: { Modal: { template: '<div><slot /></div>' }, 'font-awesome-icon': true } } })
}
test('API assignment waits for the server and never changes the local role optimistically', async () => {
  let accept
  const controller = useGameController()
  const update = vi.spyOn(controller, 'request').mockImplementation(() => new Promise(resolve => { accept = resolve }))
  vi.spyOn(controller, 'refreshGameState').mockResolvedValue({ status: 200 })
  render()
  const assign = wrapper.get('.role-action--primary')
  expect(assign.text()).toContain('配置 0 个角色')
  expect(assign.attributes('disabled')).toBeDefined()
  await wrapper.get('.role-toggle').trigger('click')
  expect(assign.attributes('disabled')).toBeUndefined()
  await assign.trigger('click')
  await flushPromises()
  expect(update).toHaveBeenCalledWith('dmSetSeatRoles', { assignments: [{ seat: 1, characterId: 'chef' }], expectedSeatUsers: ['a'] })
  expect(usePlayersStore().players[0].role.id).toBe('')
  expect(useGameStore().players.a.characterId).toBe('')
  expect(useAppStore().modals.roles).toBe(true)
  accept({ status: 200 })
  await flushPromises()
  expect(controller.refreshGameState).toHaveBeenCalledOnce()
  expect(useAppStore().modals.roles).toBe(false)
  expect(useAppStore().roles.get('chef')).not.toHaveProperty('selected')
})
test('role selection requires seats and allows storytellers to configure roles during play', async () => {
  useGameStore().players = {}
  useGameStore().seatCount = 0
  render()
  expect(wrapper.text()).toContain('请先添加座位')
  const assign = () => wrapper.get('.role-action--primary')
  expect(assign().attributes('disabled')).toBeDefined()
  useGameStore().players = { a: { userId: 'a', seat: 1, characterId: '' } }
  useGameStore().seatCount = 1
  useGameStore().level = 'day'
  await wrapper.vm.$nextTick()
  await wrapper.get('.role-toggle').trigger('click')
  expect(assign().attributes('disabled')).toBeUndefined()
  useGameStore().currentPlayer = { userId: 'a', isDM: false, seat: 1 }
  await wrapper.vm.$nextTick()
  expect(assign().attributes('disabled')).toBeDefined()
})

test('seven empty seats recommend five townsfolk and can receive all seven roles atomically', async () => {
  const game = useGameStore(), app = useAppStore(), controller = useGameController()
  game.seatCount = 7; game.players = {}
  app.roles = new Map([
    ...Array.from({ length: 5 }, (_, i) => [`town${i}`, { id: `town${i}`, team: 'townsfolk', name: `镇民${i}` }]),
    ['butler', { id: 'butler', name: '管家', team: 'outsider' }],
    ['poisoner', { id: 'poisoner', name: '投毒者', team: 'minion' }],
    ['imp', { id: 'imp', name: '小恶魔', team: 'demon' }],
  ])
  const request = vi.spyOn(controller, 'request').mockResolvedValue({ status: 200 })
  vi.spyOn(controller, 'refreshGameState').mockResolvedValue({ status: 200 })
  render()
  expect(wrapper.findAll('.team-count').map(count => count.text())).toEqual(['0 / 5', '0 / 0', '0 / 1', '0 / 1'])
  for (const toggle of wrapper.findAll('.selection-team:not(.selection-team--outsider) .role-toggle')) await toggle.trigger('click')
  expect(wrapper.get('.role-action--primary').attributes('disabled')).toBeUndefined()
  expect(wrapper.text()).toContain('点击说书人菜单中的“发送角色”后玩家才会看到身份')
  await wrapper.get('.role-action--primary').trigger('click'); await flushPromises()
  expect(request).toHaveBeenCalledOnce()
  const [event, payload] = request.mock.calls[0]
  expect(event).toBe('dmSetSeatRoles')
  expect(payload.expectedSeatUsers).toEqual(Array(7).fill(''))
  expect(payload.assignments.map(role => role.seat)).toEqual([1, 2, 3, 4, 5, 6, 7])
  expect(payload.assignments.map(role => role.characterId).sort()).toEqual(['town0', 'town1', 'town2', 'town3', 'town4', 'poisoner', 'imp'].sort())
})

test('occupied and reserved traveler seats are excluded from the recommended distribution', () => {
  const game = useGameStore(), app = useAppStore()
  app.roles.set('traveler', { id: 'traveler', team: 'traveler' })
  game.seatCount = 9
  game.players = { a: { userId: 'a', seat: 1, characterId: 'traveler' } }
  game.seatRoles = { 2: { characterId: 'traveler' } }
  render()
  expect(wrapper.get('.team-count').text()).toBe('0 / 5')
  expect(wrapper.text()).toContain('0 / 7 个角色')
})

test('shuffles within teams and restores script order without changing the selected roles', async () => {
  useAppStore().roles = new Map([
    ['chef', { id: 'chef', name: '厨师', team: 'townsfolk' }],
    ['empath', { id: 'empath', name: '共情者', team: 'townsfolk' }],
    ['imp', { id: 'imp', name: '小恶魔', team: 'demon' }],
  ])
  render()
  const order = () => wrapper.findAll('.selection-card').map(card => card.attributes('data-role-id'))
  expect(order()).toEqual(['chef', 'empath', 'imp'])
  expect(wrapper.findAll('.role-action')[2].attributes('disabled')).toBeDefined()
  await wrapper.get('[data-role-id="chef"] .role-toggle').trigger('click')
  vi.spyOn(Math, 'random').mockReturnValue(0)
  await wrapper.findAll('.role-action')[1].trigger('click')
  expect(order()).toEqual(['empath', 'chef', 'imp'])
  expect(wrapper.get('[data-role-id="chef"] .role-toggle').attributes('aria-pressed')).toBe('true')
  expect(wrapper.get('.role-action--primary').text()).toContain('配置 1 个角色')
  await wrapper.findAll('.role-action')[2].trigger('click')
  expect(order()).toEqual(['chef', 'empath', 'imp'])
  expect(wrapper.get('[data-role-id="chef"] .role-toggle').attributes('aria-pressed')).toBe('true')
})

test('uses the shuffled order when assigning roles in a local game', async () => {
  const session = useSessionStore()
  session.clearApiRoomSession()
  const app = useAppStore()
  app.roles = new Map([
    ['chef', { id: 'chef', name: '厨师', team: 'townsfolk' }],
    ['empath', { id: 'empath', name: '共情者', team: 'townsfolk' }],
  ])
  usePlayersStore().set([
    { id: 'a', role: { id: '' }, reminders: [] },
    { id: 'b', role: { id: '' }, reminders: [] },
    { id: 'c', role: { id: '' }, reminders: [] },
    { id: 'd', role: { id: '' }, reminders: [] },
    { id: 'e', role: { id: '' }, reminders: [] },
  ])
  render()
  await wrapper.get('[data-role-id="chef"] .role-toggle').trigger('click')
  await wrapper.get('[data-role-id="empath"] .role-toggle').trigger('click')

  // Swap the visible team order, then leave the shuffled assignment order intact.
  vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.999)
  await wrapper.findAll('.role-action')[1].trigger('click')
  await wrapper.get('.role-action--primary').trigger('click')

  expect(usePlayersStore().players.map(player => player.role.id)).toEqual(['empath', 'chef', '', '', ''])
  expect(useSessionStore().roleAssignmentSnapshot).toEqual(['empath', 'chef', '', '', ''])
  expect(useAppStore().modals.roles).toBe(false)
})

test('local shuffle fills the recommended lineup when no roles were selected', async () => {
  const session = useSessionStore()
  session.clearApiRoomSession()
  const app = useAppStore()
  app.roles = new Map([
    ['town-a', { id: 'town-a', name: '镇民甲', team: 'townsfolk' }],
    ['town-b', { id: 'town-b', name: '镇民乙', team: 'townsfolk' }],
    ['town-c', { id: 'town-c', name: '镇民丙', team: 'townsfolk' }],
    ['minion', { id: 'minion', name: '爪牙', team: 'minion' }],
    ['demon', { id: 'demon', name: '恶魔', team: 'demon' }],
  ])
  usePlayersStore().set(Array.from({ length: 5 }, (_, index) => ({ id: String(index), role: { id: '' }, reminders: [] })))
  render()
  expect(wrapper.get('.role-action--primary').attributes('disabled')).toBeDefined()
  await wrapper.findAll('.role-action')[1].trigger('click')
  expect(wrapper.get('.role-action--primary').attributes('disabled')).toBeUndefined()
  expect(wrapper.get('.role-action--primary').text()).toContain('发送 5 个角色')
  expect(wrapper.findAll('.selection-card.selected')).toHaveLength(5)
})

test('keeps repeated role controls in the compact options menu and updates team counts', async () => {
  render()
  await wrapper.get('.multiple-toggle input').setValue(true)
  await wrapper.get('.role-toggle').trigger('click')
  await wrapper.get('[aria-label="增加一个厨师"]').trigger('click')
  expect(wrapper.get('.team-count').text()).toBe('2 / 3')
  expect(wrapper.get('.role-action--primary').attributes('disabled')).toBeDefined()
  await wrapper.get('.multiple-toggle input').setValue(false)
  expect(wrapper.get('.team-count').text()).toBe('1 / 3')
  expect(wrapper.find('.quantity-controls').exists()).toBe(false)
})

test.each([[0, undefined], [1, 'good'], [2, 'evil']])('storyteller role picker saves role and alignment together after %i clicks', async (clicks, alignment) => {
  const app = useAppStore(), game = useGameStore(), controller = useGameController()
  game.players.a.privateExtras = { alignment: 'evil', keep: 'private setting' }
  app.toggleModal('role')
  controller.gameSocket = {}; controller.connectionStatus = 'connected'
  let accept
  const update = vi.spyOn(controller, 'updatePlayer').mockImplementation(() => new Promise(resolve => { accept = resolve }))
  vi.spyOn(controller, 'refreshGameState').mockResolvedValue({ status: 200 })
  wrapper = shallowMount(RoleModal, { props: { playerIndex: 0 }, global: { stubs: { Modal: { template: '<div><slot /></div>' }, 'font-awesome-icon': true } } })
  expect(wrapper.get('.role-alignment-toggle').text()).toBe('常规阵营')
  expect(wrapper.find('.role-local-notice').exists()).toBe(false)
  for (let i = 0; i < clicks; i++) await wrapper.get('.role-alignment-toggle').trigger('click')
  expect(wrapper.findComponent(Token).props('role').alignment).toBe(alignment)
  expect(app.roles.get('chef').alignment).toBeUndefined()
  await wrapper.get('[aria-label="厨师"]').trigger('click')
  const privateExtras = { keep: 'private setting', ...(alignment ? { alignment } : {}) }
  expect(update).toHaveBeenCalledWith({ userId: 'a', characterId: 'chef', privateExtras })
  expect(usePlayersStore().players[0].role.id).toBe('')
  expect(game.players.a.privateExtras.alignment).toBe('evil')
  expect(app.modals.role).toBe(true)
  expect(wrapper.get('.role-alignment-toggle').attributes('disabled')).toBeDefined()
  accept({ status: 200 }); await flushPromises()
  expect(controller.refreshGameState).toHaveBeenCalledOnce()
  expect(app.modals.role).toBe(false)
  expect(wrapper.emitted('role-selected')[0][0].role.alignment).toBe(alignment)
})

test('storyteller personal profile picker emits the chosen alignment and resets when reopened', async () => {
  const app = useAppStore(); app.toggleModal('role')
  wrapper = shallowMount(RoleModal, { props: { profileRole: true }, global: { stubs: { Modal: { template: '<div><slot /></div>' }, 'font-awesome-icon': true } } })
  for (const name of ['善良阵营', '邪恶阵营', '常规阵营', '善良阵营']) {
    await wrapper.get('.role-alignment-toggle').trigger('click')
    expect(wrapper.get('.role-alignment-toggle').text()).toBe(name)
  }
  await wrapper.get('[aria-label="厨师"]').trigger('click')
  expect(wrapper.emitted('profile-role-selected')).toEqual([[{ id: 'chef', name: '厨师', team: 'townsfolk', alignment: 'good' }]])
  app.toggleModal('role'); await flushPromises()
  expect(wrapper.get('.role-alignment-toggle').text()).toBe('常规阵营')
})

test('empty seats can select travelers outside the script and reopening clears old filters', async () => {
  const app = useAppStore(), game = useGameStore(), controller = useGameController()
  const traveler = { id: 'judge', name: '法官', team: 'traveler' }
  app.otherTravelers = new Map([['judge', traveler]])
  game.players = {}
  usePlayersStore().set([{ id: '', role: { id: '' }, reminders: [] }])
  app.toggleModal('role')
  const request = vi.spyOn(controller, 'request').mockResolvedValue({ status: 200 })
  vi.spyOn(controller, 'refreshGameState').mockResolvedValue({ status: 200 })
  wrapper = shallowMount(RoleModal, { global: { stubs: { Modal: { template: '<div><slot /></div>' }, 'font-awesome-icon': true } } })
  await wrapper.get('input[aria-label="搜索角色"]').setValue('法官')
  await wrapper.get('.role-tabs button:last-child').trigger('click')
  await wrapper.get('[aria-label="法官"]').trigger('click')
  await flushPromises()
  expect(request).toHaveBeenCalledWith('dmSetSeatRoles', { assignments: [{ seat: 1, characterId: 'judge' }], expectedSeatUsers: [''] })
  expect(app.modals.role).toBe(false)
  game.level = 'end'; game.grimoireReveal = { id: 'old', revealedUserIds: [], resultPublished: true }
  game.level = 'prepare'; game.grimoireReveal = null
  app.toggleModal('role'); await flushPromises()
  expect(wrapper.get('input[aria-label="搜索角色"]').element.value).toBe('')
  expect(wrapper.get('[aria-label="厨师"]').attributes('disabled')).toBeUndefined()
})

test('a player can note both script travelers and other travelers in their personal grimoire', async () => {
  const app = useAppStore(), game = useGameStore(), session = useSessionStore()
  game.currentPlayer = { userId: 'a', seat: 1, isDM: false }
  session.setSpectator(true)
  app.roles.set('beggar', { id: 'beggar', name: '乞丐', team: 'traveler' })
  app.otherTravelers = new Map([['judge', { id: 'judge', name: '法官', team: 'traveler' }]])
  app.toggleModal('role')
  const view = usePlayerViewStore(), save = vi.spyOn(view, 'setRole')
  wrapper = shallowMount(RoleModal, { global: { stubs: { Modal: { template: '<div><slot /></div>' }, 'font-awesome-icon': true } } })
  await wrapper.get('[aria-label="乞丐"]').trigger('click'); await flushPromises()
  expect(save).toHaveBeenLastCalledWith(usePlayersStore().players[0], 0, expect.objectContaining({ id: 'beggar' }))
  app.toggleModal('role'); await flushPromises()
  await wrapper.get('.role-tabs button:last-child').trigger('click')
  await wrapper.get('[aria-label="法官"]').trigger('click'); await flushPromises()
  expect(save).toHaveBeenLastCalledWith(usePlayersStore().players[0], 0, expect.objectContaining({ id: 'judge' }))
  expect(game.players.a.characterId).toBe('')
})

test('the next round clears stale seat operations so every role token can open again', () => {
  const app = useAppStore(); app.modals.role = true
  const context = { closeSeatActions: vi.fn(), cancelNominationDraft: vi.fn(), endRevealPreview: vi.fn(),
    emptySeatRoles: { 0: { id: 'judge' } }, emptySeatReminders: { 0: ['中毒'] }, swap: 1,
    reminderPickerSeat: 1, profileRolePickerOpen: true, previewRevealSeat: 1, revealLongPress: true }
  TownSquare.watch.roundLevel.call(context, 'prepare', 'end')
  expect(context.closeSeatActions).toHaveBeenCalledOnce()
  expect(context.emptySeatRoles).toEqual({}); expect(context.emptySeatReminders).toEqual({})
  expect(context.swap).toBe(-1); expect(context.previewRevealSeat).toBe(-1)
  expect(app.modals.role).toBe(false)
})


test('NPC tabs separate fabled and loric roles and use the existing server command', async () => {
  useGameStore().level = 'night'
  const app = useAppStore()
  app.toggleModal('fabled')
  app.fabled = new Map([
    ['angel', { id: 'angel', name: '天使', team: 'fabled' }],
    ['gardener', { id: 'gardener', name: '园丁', team: 'loric' }],
  ])
  const controller = useGameController()
  controller.gameSocket = {}
  controller.connectionStatus = 'connected'
  const save = vi.spyOn(controller, 'setFabled').mockResolvedValue({ status: 200 })
  wrapper = shallowMount(FabledModal, { global: { stubs: { Modal: { template: '<div><slot /></div>' }, 'font-awesome-icon': true } } })
  expect(wrapper.find('.fabled-manager__available').text()).toContain('天使')
  expect(wrapper.find('.fabled-manager__available').text()).not.toContain('园丁')
  await wrapper.findAll('.npc-tabs button')[1].trigger('click')
  expect(wrapper.find('.fabled-manager__available').text()).toContain('园丁')
  await wrapper.find('.fabled-manager__role-button').trigger('click')
  expect(save).toHaveBeenCalledWith({ fabledRoleIds: ['gardener'] })
  expect(useGameStore().fabledRoleIds).toEqual([])
})

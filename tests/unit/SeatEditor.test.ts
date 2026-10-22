// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import SeatEditor from '@/components/SeatEditor.vue'
import StorytellerStage from '@/components/StorytellerStage.vue'
import { useSeatEditorStore } from '@/stores/seatEditor'
import { usePlayersStore } from '@/stores/players'
import { useSessionStore } from '@/stores/session'
import { useGameStore } from '@/stores/game'
import { useAppStore } from '@/stores/app'
import { useGameController } from '@/controllers/GameController'

beforeEach(() => {
  setActivePinia(createPinia())
  window.$toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
})
function setupApi() {
  useSessionStore().setApiRoomSession({ roomId: 'EDIT12', gameServerId: 'game-1' })
  useGameStore().currentPlayer = { isDM: true } as never
  const controller = useGameController()
  controller.connectionStatus = 'connected'
  controller.gameSocket = {} as never
  vi.spyOn(controller, 'refreshGameState').mockResolvedValue({ status: 200 } as never)
  return controller
}

describe('seat editor interaction', () => {
  test('welcomes an empty room before opening the existing seat editor and adding the first seat', async () => {
    const controller = setupApi()
    const players = usePlayersStore()
    const editor = useSeatEditorStore()
    useAppStore().grimoire.showTutorial = false
    const wrapper = mount({ components: { StorytellerStage, SeatEditor }, template: '<StorytellerStage /><SeatEditor />' }, {
      global: { stubs: { 'font-awesome-icon': true } },
    })
    expect(wrapper.text()).toContain('欢迎来到')
    expect(wrapper.find('.seat-editor').exists()).toBe(false)
    await wrapper.get('.stage-welcome button').trigger('click')
    expect(editor.open).toBe(true)
    expect(wrapper.find('.stage-welcome').exists()).toBe(false)
    expect(wrapper.get('.seat-editor').text()).toContain('添加座位')
    expect(players.players).toHaveLength(0)
    const setCount = vi.spyOn(controller, 'setSeatCount').mockImplementation(async ({ seatCount }) => {
      if (seatCount === 1) players.add('')
      else players.set([])
      return { status: 200 } as never
    })
    await wrapper.get('.seat-editor__add').trigger('click')
    await flushPromises()
    expect(setCount).toHaveBeenCalledWith({ seatCount: 1 })
    expect(players.players).toHaveLength(1)
    expect(editor.open).toBe(true)
    await editor.removeSeat(0)
    expect(setCount).toHaveBeenLastCalledWith({ seatCount: 0, seatOrder: [], expectedSeatUsers: [''] })
    expect(players.players).toHaveLength(0)
    wrapper.unmount()
  })

  test('clears every online seat without leaving placeholder seats', async () => {
    const controller = setupApi()
    const players = usePlayersStore()
    players.add(''); players.add('')
    const request = vi.spyOn(controller, 'setSeatCount').mockResolvedValue({ status: 200 } as never)
    const clearing = useSeatEditorStore().clearPlayers()
    useSessionStore().inputResolver?.(true)
    await clearing
    expect(request).toHaveBeenCalledWith({ seatCount: 0, seatOrder: [], expectedSeatUsers: ['', ''] })
  })

  test('opens without adding a seat, keeps controls open for repeated adds, and disables at twenty', async () => {
    const editor = useSeatEditorStore()
    const players = usePlayersStore()
    useAppStore().toggleMenu(true)
    editor.show()
    expect(players.players).toHaveLength(0)
    expect(useAppStore().grimoire.isMenuOpen).toBe(false)
    const wrapper = mount(SeatEditor, { global: { stubs: { 'font-awesome-icon': true } } })
    for (let i = 0; i < 20; i++) await wrapper.get('.seat-editor__add').trigger('click')
    expect(players.players).toHaveLength(20)
    expect(editor.open).toBe(true)
    expect(wrapper.get('.seat-editor__add').attributes('disabled')).toBeDefined()
    await editor.addPlayer()
    expect(players.players).toHaveLength(20)
    await wrapper.get('[aria-label="关闭座位编辑"]').trigger('click')
    expect(editor.open).toBe(false)
    wrapper.unmount()
  })

  test('does not send duplicate additions while the authoritative request is pending', async () => {
    const controller = setupApi()
    const players = usePlayersStore()
    players.add('一号'); players.add('二号')
    let resolve!: () => void
    const setCount = vi.spyOn(controller, 'setSeatCount').mockImplementation(() => new Promise<void>(done => { resolve = done }) as never)
    const editor = useSeatEditorStore()
    const request = editor.addPlayer()
    await editor.addPlayer()
    expect(setCount).toHaveBeenCalledTimes(1)
    expect(editor.pending).toBe(true)
    resolve()
    await request
    expect(controller.refreshGameState).toHaveBeenCalledOnce()
    expect(editor.pending).toBe(false)
  })

  test('moves the entire player with their role and reminders instead of swapping labels', async () => {
    const players = usePlayersStore()
    players.add({ name: '一号', role: { id: 'imp' }, reminders: ['中毒'] })
    players.add('二号'); players.add('三号')
    await useSeatEditorStore().moveSeat(0, 2)
    expect(players.players.map(player => player.name)).toEqual(['二号', '三号', '一号'])
    expect(players.players[2].role.id).toBe('imp')
    expect(players.players[2].reminders).toEqual(['中毒'])
  })

  test('submits a guarded layout and preserves local data when the server rejects it', async () => {
    const controller = setupApi()
    const players = usePlayersStore()
    players.add({ name: '甲', id: 'a' }); players.add(''); players.add({ name: '乙', id: 'b' })
    const request = vi.spyOn(controller, 'setSeatCount').mockRejectedValue(new Error('座位已变更'))
    await useSeatEditorStore().moveSeat(0, 2)
    expect(request).toHaveBeenCalledWith({ seatCount: 3, seatOrder: [1, 2, 0], expectedSeatUsers: ['a', '', 'b'] })
    expect(players.players.map(player => player.id)).toEqual(['a', '', 'b'])
    expect(window.$toast.error).toHaveBeenCalledWith('座位已变更')
  })

  test('allows seat changes during play while retaining storyteller and connection guards', async () => {
    const controller = setupApi()
    const request = vi.spyOn(controller, 'setSeatCount').mockResolvedValue({ status: 200 } as never)
    usePlayersStore().add('一号'); usePlayersStore().add('二号')
    const editor = useSeatEditorStore()
    useGameStore().level = 'night'
    await editor.addPlayer()
    await editor.moveSeat(0, 1)
    expect(request).toHaveBeenCalledWith({ seatCount: 3 })
    expect(request).toHaveBeenCalledWith({ seatCount: 2, seatOrder: [1, 0], expectedSeatUsers: ['', ''] })
    expect(useGameStore().level).toBe('night')
    request.mockClear()
    useGameStore().currentPlayer = { isDM: false } as never
    await editor.addPlayer()
    expect(request).not.toHaveBeenCalled()
    useGameStore().currentPlayer = { isDM: true } as never
    controller.connectionStatus = 'disconnected'
    await editor.addPlayer()
    expect(request).not.toHaveBeenCalled()
  })

  test('cannot remove a newly seated player after confirmation for a different occupant', async () => {
    setupApi()
    const players = usePlayersStore()
    players.add({ name: '甲', id: 'a' }); players.add(''); players.add('')
    const editor = useSeatEditorStore()
    const request = editor.removeSeat(0)
    players.set([{ ...players.players[0], id: 'b' }, ...players.players.slice(1)])
    useSessionStore().inputResolver?.(true)
    await request
    expect(players.players).toHaveLength(3)
    expect(window.$toast.warning).toHaveBeenCalledWith('座位上的玩家已变更，请重试。')
  })
})

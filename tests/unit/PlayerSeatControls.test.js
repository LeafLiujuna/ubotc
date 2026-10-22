// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import PlayerSeatControls from '@/components/PlayerSeatControls.vue'
import { useGameController } from '@/controllers/GameController'
import { useGameStore } from '@/stores/game'
import { usePlayersStore } from '@/stores/players'
import { useSessionStore } from '@/stores/session'

beforeEach(() => {
  setActivePinia(createPinia())
  window.$toast = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }
})

describe('PlayerSeatControls', () => {
  test('adds local seats and randomizes them after confirmation', async () => {
    const playersStore = usePlayersStore()
    const sessionStore = useSessionStore()
    const add = vi.spyOn(playersStore, 'add')
    const randomize = vi.spyOn(playersStore, 'randomize')
    const wrapper = mount(PlayerSeatControls)

    await wrapper.vm.addPlayer(null, '说书人')
    expect(add).toHaveBeenCalledWith({
      name: '',
      stImage: null,
      stName: '说书人',
    })

    const request = wrapper.vm.randomizeSeatings()
    sessionStore.inputResolver?.(true)
    await request
    expect(randomize).toHaveBeenCalledOnce()
  })

  test('clears a local nomination and all seats after confirmation', async () => {
    const playersStore = usePlayersStore()
    const sessionStore = useSessionStore()
    playersStore.add('一号')
    playersStore.add('二号')
    sessionStore.nomination = true
    sessionStore.setSessionId('room-12')
    const clear = vi.spyOn(playersStore, 'clear')
    const nominationUpdate = vi.spyOn(sessionStore, 'nominationUpdate')
    const wrapper = mount(PlayerSeatControls)

    const request = wrapper.vm.clearPlayers()
    sessionStore.inputResolver?.(true)
    await request

    expect(nominationUpdate).toHaveBeenCalledWith({})
    expect(clear).toHaveBeenCalledWith(false)
  })

  test('clears roles only after confirmation', async () => {
    const playersStore = usePlayersStore()
    const sessionStore = useSessionStore()
    const clearRoles = vi.spyOn(playersStore, 'clearRoles')
    const wrapper = mount(PlayerSeatControls)

    const request = wrapper.vm.clearRoles()
    sessionStore.inputResolver?.(true)
    await request

    expect(clearRoles).toHaveBeenCalledOnce()
  })

  test('uses the authoritative controller when an API storyteller adds a seat', async () => {
    const controller = useGameController()
    const gameStore = useGameStore()
    const playersStore = usePlayersStore()
    const sessionStore = useSessionStore()
    sessionStore.setApiRoomSession({
      roomId: 'ROOM12',
      gameServerId: 'game-1',
    })
    gameStore.currentPlayer = { isDM: true }
    playersStore.add('一号')
    playersStore.add('二号')
    controller.connectionStatus = 'connected'
    controller.gameSocket = {}
    const setSeatCount = vi
      .spyOn(controller, 'setSeatCount')
      .mockResolvedValue({ status: 200 })
    const refreshGameState = vi
      .spyOn(controller, 'refreshGameState')
      .mockResolvedValue({ status: 200 })
    const wrapper = mount(PlayerSeatControls)

    await wrapper.vm.addPlayer()

    expect(setSeatCount).toHaveBeenCalledWith({ seatCount: 3 })
    expect(refreshGameState).toHaveBeenCalledOnce()
  })
})

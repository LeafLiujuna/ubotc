// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import RoomSessionControls from '@/components/RoomSessionControls.vue'
import { useAppStore } from '@/stores/app'
import { usePlayersStore } from '@/stores/players'
import { useSessionStore } from '@/stores/session'

let writeText

beforeEach(() => {
  setActivePinia(createPinia())
  writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
})

describe('RoomSessionControls', () => {
  test('creates a legacy room after collecting identity and room details', async () => {
    const sessionStore = useSessionStore()
    const playersStore = usePlayersStore()
    sessionStore.rooms = []
    const wrapper = mount(RoomSessionControls)

    const request = wrapper.vm.hostSession()
    sessionStore.inputResolver?.(['说书人'])
    await flushPromises()
    sessionStore.inputResolver?.(['1234', '3'])
    await request

    expect(sessionStore.playerName).toBe('说书人')
    expect(sessionStore.sessionId).toBe('1234')
    expect(sessionStore.isSpectator).toBe(false)
    expect(playersStore.players).toHaveLength(3)
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.href.split('#')[0]}#1234`
    )
  })

  test('joins a legacy room from a shared link as a spectator', async () => {
    const appStore = useAppStore()
    const sessionStore = useSessionStore()
    sessionStore.rooms = []
    sessionStore.setPlayerName('玩家')
    appStore.toggleGrimoire(true)
    const wrapper = mount(RoomSessionControls)

    const request = wrapper.vm.joinSession()
    sessionStore.inputResolver?.(['https://example.test/#5678'])
    await request

    expect(sessionStore.sessionId).toBe('5678')
    expect(sessionStore.isSpectator).toBe(true)
    expect(appStore.grimoire.isPublic).toBe(false)
  })

  test('clears room state after confirmed leave', async () => {
    const sessionStore = useSessionStore()
    const playersStore = usePlayersStore()
    sessionStore.setSessionId('room-12')
    sessionStore.setRoomActive(true)
    playersStore.add('一号')
    playersStore.add('二号')
    const wrapper = mount(RoomSessionControls)

    const request = wrapper.vm.leaveSession()
    sessionStore.inputResolver?.(true)
    await request

    expect(sessionStore.sessionId).toBe('')
    expect(sessionStore.isRoomActive).toBe(false)
    expect(playersStore.players).toHaveLength(0)
  })
})

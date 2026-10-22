// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import RoleDistributionControls from '@/components/RoleDistributionControls.vue'
import { useAppStore } from '@/stores/app'
import { usePlayersStore } from '@/stores/players'
import { useSessionStore } from '@/stores/session'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
})

describe('RoleDistributionControls', () => {
  test('sends roles and demon bluffs, then clears both feedback flags', async () => {
    const sessionStore = useSessionStore()
    const distributeRoles = vi.spyOn(sessionStore, 'distributeRoles')
    const distributeBluffs = vi.spyOn(sessionStore, 'distributeBluffs')
    const wrapper = mount(RoleDistributionControls)

    wrapper.vm.openRoles()
    await flushPromises()

    const dialog = wrapper.get('[data-testid="distribution-dialog-roles"]')
    expect(dialog.attributes('role')).toBe('dialog')
    expect(dialog.attributes('aria-modal')).toBe('true')

    await wrapper
      .get('[data-testid="distribution-confirm-roles"]')
      .trigger('click')

    expect(distributeRoles).toHaveBeenCalledWith(true)
    expect(distributeBluffs).toHaveBeenCalledWith({
      val: true,
      role: 'demonAll',
    })
    expect(wrapper.get('[data-testid="distribution-status"]').text()).toBe(
      '已发送角色与恶魔伪装身份'
    )

    vi.advanceTimersByTime(2000)

    expect(distributeRoles).toHaveBeenLastCalledWith(false)
    expect(distributeBluffs).toHaveBeenLastCalledWith({ val: false })
  })

  test('re-applies the saved local deal over manual grimoire edits before sending', async () => {
    const sessionStore = useSessionStore()
    const appStore = useAppStore()
    const playersStore = usePlayersStore()
    const chef = { id: 'chef', name: '厨师', team: 'townsfolk' }
    const empath = { id: 'empath', name: '共情者', team: 'townsfolk' }
    const imp = { id: 'imp', name: '小恶魔', team: 'demon' }
    appStore.roles = new Map([
      ['chef', chef],
      ['empath', empath],
      ['imp', imp],
    ])
    playersStore.set([
      { id: 'a', role: chef, reminders: [] },
      { id: 'b', role: empath, reminders: [] },
    ])
    sessionStore.setRoleAssignmentSnapshot(['chef', 'empath'])

    // A storyteller edits the grimoire after the initial deal.
    playersStore.update({ player: playersStore.players[0], property: 'role', value: imp })
    expect(playersStore.players.map((player) => player.role.id)).toEqual(['imp', 'empath'])

    const distributeRoles = vi.spyOn(sessionStore, 'distributeRoles')
    const wrapper = mount(RoleDistributionControls)
    wrapper.vm.openRoles()
    await flushPromises()
    await wrapper.get('[data-testid="distribution-confirm-roles"]').trigger('click')

    expect(playersStore.players.map((player) => player.role.id)).toEqual(['chef', 'empath'])
    expect(sessionStore.roleAssignmentSnapshot).toEqual(['chef', 'empath'])
    expect(distributeRoles).toHaveBeenCalledWith(true)
  })

  test('can send role types after confirmation', async () => {
    const sessionStore = useSessionStore()
    const distributeTypes = vi.spyOn(sessionStore, 'distributeTypes')
    const wrapper = mount(RoleDistributionControls)

    const request = wrapper.vm.openTypes()
    sessionStore.inputResolver?.(true)
    await request
    await flushPromises()

    expect(distributeTypes).toHaveBeenCalledWith(true)
    expect(wrapper.get('[data-testid="distribution-status"]').text()).toBe(
      '已发送角色类型'
    )

    vi.advanceTimersByTime(2000)
    expect(distributeTypes).toHaveBeenLastCalledWith(false)
  })

  test('keeps role-specific bluff behavior behind a confirmation', async () => {
    const sessionStore = useSessionStore()
    const distributeBluffs = vi.spyOn(sessionStore, 'distributeBluffs')
    const wrapper = mount(RoleDistributionControls)

    wrapper.vm.openBluffs()
    await flushPromises()
    await wrapper.get('[data-autofocus]').trigger('click')
    sessionStore.inputResolver?.(true)
    await flushPromises()

    expect(distributeBluffs).toHaveBeenCalledWith({
      val: true,
      role: 'demon',
      seatNum: undefined,
    })
    expect(
      wrapper.find('[data-testid="distribution-dialog-bluffs"]').exists()
    ).toBe(false)
  })

  test('passes a chosen seat through the grimoire flow', async () => {
    const sessionStore = useSessionStore()
    const distributeGrimoire = vi.spyOn(sessionStore, 'distributeGrimoire')
    const wrapper = mount(RoleDistributionControls)

    wrapper.vm.openGrimoire()
    await flushPromises()
    await wrapper
      .get('[data-testid="distribution-grimoire-seat"]')
      .trigger('click')
    sessionStore.inputResolver?.(['7'])
    await flushPromises()
    sessionStore.inputResolver?.(true)
    await flushPromises()

    expect(distributeGrimoire).toHaveBeenCalledWith({
      val: true,
      role: null,
      seatNum: 7,
    })
    expect(wrapper.get('[data-testid="distribution-status"]').text()).toBe(
      '已发送魔典给7号位'
    )
  })
})

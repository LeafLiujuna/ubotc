// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest'
import { mount, shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import HandSignal from '@/components/HandSignal.vue'
import StorytellerProfile from '@/components/StorytellerProfile.vue'
import TownSquare from '@/components/TownSquare.vue'
import { usePlayerViewStore } from '@/stores/playerView'
import { useGameStore } from '@/stores/game'
import { useUserStore } from '@/stores/user'
import { useGameController } from '@/controllers/GameController'
import { createHandShortcut } from '@/utils/handShortcut'

beforeEach(() => {
  setActivePinia(createPinia())
  useUserStore().setCurrentUser({ id: 'a' } as never)
  window.$toast = { error: vi.fn() } as never
})

test.each([-90, -45, 0, 45, 90, 135, 180, 225])('places the raised hand toward the table center at %s degrees', (angle) => {
  const view = mount(HandSignal, { props: { icon: '✋', name: '玩家', seatAngle: angle } })
  const hand = view.element as HTMLElement
  const dx = parseFloat(hand.style.left) - 50
  const dy = parseFloat(hand.style.top) - 50
  expect(dx * Math.cos(angle * Math.PI / 180) + dy * Math.sin(angle * Math.PI / 180)).toBeCloseTo(-80)
  expect(hand.style.transform).toContain(`rotate(${angle + 315}deg)`)
  expect(view.attributes('aria-label')).toBe('玩家 正在举手')
  view.unmount()
})

test('shows the storyteller hand beside the portrait and removes it when lowered', async () => {
  const view = mount(StorytellerProfile, { props: { name: '说书人', avatar: '/avatar.png', reminders: [], isImageOptIn: false, handSignal: '✋' }, global: { stubs: { FontAwesomeIcon: true } } })
  expect(view.find('.storyteller-profile__hand').text()).toBe('✋')
  expect(view.find('.storyteller-profile__portrait .hand-signal').exists()).toBe(false)
  await view.setProps({ handSignal: undefined })
  expect(view.find('.hand-signal').exists()).toBe(false)
  view.unmount()
})

test('keeps chosen role icons available', () => {
  const view = shallowMount(HandSignal, { props: { icon: 'role:imp', name: '玩家', seatAngle: 90 } })
  expect(view.findComponent({ name: 'RoleIcon' }).props('role').id).toBe('imp')
  view.unmount()
})

test('does not duplicate the current or a seated storyteller in the portrait list', () => {
  const raised = TownSquare.computed!.raisedStorytellers as (this: unknown) => Array<{ userId: string }>
  const result = raised.call({ isStoryteller: true, players: [{ id: 'seated' }], gameStore: {
    handSignals: { a: '✋', other: '👋', seated: '✋', player: '✋' },
    dms: { a: true, other: true, seated: true }, currentPlayer: { userId: 'a' }, roomUsers: {},
  } })
  expect(result.map((entry: { userId: string }) => entry.userId)).toEqual(['other'])
})

test('online storytellers use their existing portraits for hand signals', () => {
  const raised = TownSquare.computed!.raisedStorytellers as (this: unknown) => Array<{ userId: string }>
  expect(raised.call({ isApiRoom: true })).toEqual([])
})

test('waits for authoritative hand state, blocks duplicate clicks, and lowers without touching votes', async () => {
  const game = useGameStore()
  game.currentPlayer = { userId: 'a', seat: 1, isDM: false } as never
  let finish!: (value: unknown) => void
  const request = vi.spyOn(useGameController(), 'request').mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const view = usePlayerViewStore()
  const pending = view.toggleHand()
  await view.toggleHand()
  expect(request).toHaveBeenCalledTimes(1)
  expect(game.handSignals).toEqual({})
  expect(view.handPending).toBe(true)
  game.handSignals = { a: '✋' }
  finish({ status: 200 })
  await pending
  request.mockResolvedValue({ status: 200 })
  await view.toggleHand()
  expect(request).toHaveBeenLastCalledWith('setHandSignal', { icon: null })
  expect(view.handPending).toBe(false)
})

test('leaves failed hands lowered and permits retry; unseated spectators cannot raise', async () => {
  const game = useGameStore()
  game.currentPlayer = { userId: 'a', seat: 1, isDM: false } as never
  const request = vi.spyOn(useGameController(), 'request').mockRejectedValue(new Error('连接中断'))
  const view = usePlayerViewStore()
  await view.toggleHand()
  expect(game.handSignals).toEqual({})
  expect(view.handPending).toBe(false)
  expect(window.$toast.error).toHaveBeenCalledWith('连接中断')
  request.mockClear()
  game.currentPlayer = { userId: 'a', seat: 0, isDM: false } as never
  await view.toggleHand()
  expect(request).not.toHaveBeenCalled()
})

test('a tap toggles once on keydown, never again on keyup', () => {
  const toggle = vi.fn()
  const shortcut = createHandShortcut(toggle)
  expect(shortcut.keydown({ key: ' ', repeat: false, ctrlKey: false, metaKey: false, altKey: false }, true)).toBe(true)
  expect(shortcut.keyup({ key: ' ' })).toBe(true)
  expect(toggle).toHaveBeenCalledOnce()
})

test('holding space repeats the raise/lower motion at a bounded rate and stops on release', () => {
  let time = 0
  const toggle = vi.fn()
  const shortcut = createHandShortcut(toggle, () => time)
  const key = { key: ' ', repeat: false, ctrlKey: false, metaKey: false, altKey: false }
  shortcut.keydown(key, true)
  for (time = 500; time < 1500; time += 30) shortcut.keydown({ ...key, repeat: true }, true)
  expect(toggle.mock.calls.length).toBeGreaterThan(2)
  expect(toggle.mock.calls.length).toBeLessThanOrEqual(5)
  shortcut.keyup(key)
  const callsAfterRelease = toggle.mock.calls.length
  time = 2000
  expect(shortcut.keydown({ ...key, repeat: true }, true)).toBe(false)
  expect(toggle).toHaveBeenCalledTimes(callsAfterRelease)
  shortcut.keydown(key, true)
  expect(toggle).toHaveBeenCalledTimes(callsAfterRelease + 1)
})

test('typing, disabled shortcuts, modifiers and losing focus cannot start or continue a held wave', () => {
  const toggle = vi.fn()
  const shortcut = createHandShortcut(toggle, () => 1000)
  const key = { key: ' ', repeat: false, ctrlKey: false, metaKey: false, altKey: false }
  expect(shortcut.keydown(key, false)).toBe(false)
  expect(shortcut.keydown({ ...key, repeat: true }, true)).toBe(false)
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) expect(shortcut.keydown({ ...key, [modifier]: true }, true)).toBe(false)
  expect(toggle).not.toHaveBeenCalled()
  shortcut.keydown(key, true)
  shortcut.reset()
  shortcut.keydown({ ...key, repeat: true }, true)
  expect(toggle).toHaveBeenCalledOnce()
})

import { shallowMount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import VoiceSidebar from '@/components/VoiceSidebar.vue'
import VoiceConversation from '@/components/VoiceConversation.vue'
import { useVoiceController } from '@/controllers/VoiceController'
import { useGameStore } from '@/stores/game'
import { useUserStore } from '@/stores/user'
import { usePlayerViewStore } from '@/stores/playerView'
import Token from '@/components/Token.vue'
import TownSquare from '@/components/TownSquare.vue'
let wrapper
beforeEach(() => {
  setActivePinia(createPinia())
  useUserStore().setCurrentUser({ id: 'a', displayName: '玩家甲' })
  useUserStore().cachedUsers.b = { id: 'b', displayName: '玩家乙' }
  const game = useGameStore()
  game.currentPlayer = { userId: 'a', seat: 1 }
  game.players = {
    a: { userId: 'a', seat: 1, characterId: 'chef' },
    b: { userId: 'b', seat: 2, characterId: '' },
  }
  game.roomUsers = {
    a: { userId: 'a', displayName: '玩家甲' },
    b: { userId: 'b', displayName: '玩家乙' },
    guest: { userId: 'guest', displayName: '旁观者' },
  }
  game.level = 'day'
})
afterEach(() => wrapper?.unmount())

test('empty and occupied fixed locations both join directly; only accepted invitation rooms are listed', async () => {
  const voice = useVoiceController()
  voice.applyRoomOverview({
    isUpdate: false,
    rooms: [
      {
        chatRoomId: 'tower',
        scene: '塔楼',
        access: 'open',
        users: [{ userId: 'b' }],
      },
      {
        chatRoomId: 'allowed',
        scene: '已接受的私聊',
        access: 'invite',
        allowedUserIds: ['a'],
        users: [],
      },
      {
        chatRoomId: 'other',
        scene: '未受邀的私聊',
        access: 'invite',
        allowedUserIds: ['b'],
        users: [],
      },
    ],
  })
  const join = vi.spyOn(voice, 'joinPlace').mockResolvedValue(undefined)
  wrapper = shallowMount(VoiceSidebar)
  for (const name of ['药水商店', '塔楼', '大教堂', '营火', '溪边'])
    expect(wrapper.text()).toContain(name)
  expect(wrapper.text()).toContain('玩家乙')
  expect(wrapper.text()).toContain('已接受的私聊')
  expect(wrapper.text()).not.toContain('未受邀的私聊')
  const button = (name) =>
    wrapper.findAll('button').find((item) => item.text() === name)
  await button('药水商店').trigger('click')
  await flushPromises()
  expect(join).toHaveBeenLastCalledWith('potion-shop')
  await button('塔楼').trigger('click')
  await flushPromises()
  expect(join).toHaveBeenLastCalledWith('tower')
  useGameStore().level = 'night'
  await wrapper.vm.$nextTick()
  expect(button('塔楼').attributes('disabled')).toBeDefined()
})

test('request chat starts and cancels table selection without opening a modal', async () => {
  wrapper = shallowMount(VoiceSidebar, {
    global: { stubs: { Modal: { template: '<section><slot /></section>' } } },
  })
  await wrapper.find('.request-chat').trigger('click')
  expect(useVoiceController().selectingInvitee).toBe(true)
  expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0)
  expect(wrapper.find('modal-stub').exists()).toBe(false)
  expect(wrapper.text()).not.toContain('旁观者')
  await wrapper.find('.request-chat').trigger('click')
  expect(useVoiceController().selectingInvitee).toBe(false)
})

test('both request directions stay in the sidebar with inline accept, reject and cancel controls', async () => {
  const voice = useVoiceController()
  voice.outgoingInvites = [{ chatRoomId: 'private', userId: 'b', status: 'pending' }]
  voice.receiveInvite({ applyId: 'incoming', fromUserId: 'b', type: 'voiceRoomInvite' })
  const respond = vi.spyOn(voice, 'respondToInvite').mockResolvedValue(undefined)
  const cancel = vi.spyOn(voice, 'cancelInvite').mockResolvedValue(undefined)
  wrapper = shallowMount(VoiceSidebar)
  expect(wrapper.get('header strong').text()).toBe('聊天请求')
  expect(wrapper.get('.voice-request--outgoing').text()).toContain('等待回应')
  await wrapper.get('[aria-label="同意 玩家乙 的私聊请求"]').trigger('click')
  expect(respond).toHaveBeenLastCalledWith('incoming', true)
  await wrapper.get('[aria-label="拒绝 玩家乙 的私聊请求"]').trigger('click')
  expect(respond).toHaveBeenLastCalledWith('incoming', false)
  await wrapper.get('[aria-label="取消向 玩家乙 的私聊请求"]').trigger('click')
  await flushPromises()
  expect(cancel).toHaveBeenCalledWith('private')
  voice.finishInvite('incoming')
  await wrapper.vm.$nextTick()
  expect(wrapper.find('.voice-request--incoming').exists()).toBe(false)
})

test('central avatars render only already-visible roles, local clearing hides them, public square restores the table', async () => {
  const voice = useVoiceController()
  voice.publicRoomId = 'public'
  voice.currentActiveRoomId = 'tower'
  voice.applyRoomOverview({
    isUpdate: false,
    rooms: [
      {
        chatRoomId: 'tower',
        scene: '塔楼',
        access: 'open',
        users: [{ userId: 'a' }, { userId: 'b' }],
      },
    ],
  })
  wrapper = shallowMount(VoiceConversation)
  expect(wrapper.findAll('.voice-member-card')).toHaveLength(2)
  expect(wrapper.findAll('.voice-member-role')).toHaveLength(2)
  expect(wrapper.findAllComponents(Token).map(token => token.props('role').id)).toEqual(['chef', ''])
  usePlayerViewStore().rolesCleared = true
  await wrapper.vm.$nextTick()
  expect(wrapper.findAllComponents(Token).map(token => token.props('role').id)).toEqual(['', ''])
  expect(useGameStore().players.a.characterId).toBe('chef')
  voice.currentActiveRoomId = 'public'
  await wrapper.vm.$nextTick()
  expect(wrapper.find('.voice-conversation').exists()).toBe(false)
})

test('enlarged cards stay on the table and badge operations use the same grimoire seat handler', async () => {
  const voice = useVoiceController()
  voice.publicRoomId = 'public'; voice.currentActiveRoomId = 'tower'
  voice.applyRoomOverview({ isUpdate: false, rooms: [{ chatRoomId: 'tower', scene: '塔楼', users: [{ userId: 'a' }, { userId: 'b' }] }] })
  const players = [{ id: 'a', role: { id: 'chef' } }, { id: 'b', role: { id: 'imp', name: '小恶魔' } }]
  wrapper = shallowMount(VoiceConversation, { props: { players } })
  await wrapper.get('.voice-member-portrait').trigger('click')
  expect(wrapper.get('.voice-member-card').classes()).toContain('is-expanded')
  expect(wrapper.find('modal-stub').exists()).toBe(false)
  expect(document.body.dataset.tsModalLockCount).toBeUndefined()
  expect(wrapper.findAllComponents(Token)[1].props('role').id).toBe('imp')
  await wrapper.findAll('.voice-member-role')[1].trigger('click')
  const [id, event] = wrapper.emitted('roleAction')[0]
  const handle = vi.fn()
  TownSquare.methods.handleVoiceRoleAction.call({ players, handleTableTokenClick: handle }, id, event)
  expect(handle).toHaveBeenCalledWith(1, event)
  await wrapper.findAll('header button')[0].trigger('click')
  expect(wrapper.get('.voice-conversation').classes()).toContain('is-collapsed')
  expect(voice.currentActiveRoomId).toBe('tower')
  await wrapper.setProps({ players: [players[0], { ...players[1], role: { id: 'monk' } }] })
  expect(wrapper.findAllComponents(Token)[1].props('role').id).toBe('monk')
})

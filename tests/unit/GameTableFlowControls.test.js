// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import GameTableFlowControls from '@/components/GameTableFlowControls.vue'
import NightOrderModal from '@/components/modals/NightOrderModal.vue'
import NightMessageComposer from '@/components/NightMessageComposer.vue'
import { useGameController } from '@/controllers/GameController'
import { useAppStore } from '@/stores/app'
import { useGameStore } from '@/stores/game'
import { useGameScriptStore } from '@/stores/gameScript'
import { usePlayersStore } from '@/stores/players'
import { usePlayerViewStore } from '@/stores/playerView'
import { useSessionStore } from '@/stores/session'
import { useDemoStore } from '@/stores/demo'
import { SocketClientEvent } from '@/types/socket'

beforeEach(() => {
  setActivePinia(createPinia())
  window.$toast = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }
})

function configureConnectedStoryteller() {
  const controller = useGameController()
  const gameStore = useGameStore()
  const sessionStore = useSessionStore()
  sessionStore.setApiRoomSession({
    roomId: 'ROOM12',
    gameServerId: 'game-1',
  })
  gameStore.currentPlayer = { isDM: true }
  gameStore.players = {
    'player-1': {
      userId: 'player-1',
      isDM: false,
      seat: 1,
      characterId: 'washerwoman',
    },
  }
  useGameScriptStore().applyGameScript('script-1', {
    name: '测试剧本',
    characters: [],
  })
  controller.connectionStatus = 'connected'
  controller.gameSocket = {}
  return { controller, gameStore, sessionStore }
}

describe('GameTableFlowControls', () => {
  test('toggles a local night and resets the marked player', () => {
    const appStore = useAppStore()
    const sessionStore = useSessionStore()
    sessionStore.setMarkedPlayer({ val: 3, force: true })
    const setMarkedPlayer = vi.spyOn(sessionStore, 'setMarkedPlayer')
    const wrapper = mount(GameTableFlowControls)

    wrapper.vm.toggleNight()

    expect(appStore.grimoire.isNight).toBe(true)
    expect(setMarkedPlayer).toHaveBeenCalledWith({ val: -1, force: true })
  })

  test('starts an API room through the authoritative controller without confirmation', async () => {
    const appStore = useAppStore()
    const { controller, sessionStore } = configureConnectedStoryteller()
    appStore.toggleMenu(true)
    const changeLevel = vi
      .spyOn(controller, 'changeLevel')
      .mockResolvedValue({ status: 200 })
    const refreshGameState = vi
      .spyOn(controller, 'refreshGameState')
      .mockResolvedValue({ status: 200 })
    const wrapper = mount(GameTableFlowControls)

    const phaseChange = wrapper.vm.goNight()
    expect(sessionStore.inputResolver).toBeFalsy()
    await phaseChange

    expect(changeLevel).toHaveBeenCalledWith({ nextLevel: 'night' })
    expect(refreshGameState).toHaveBeenCalledOnce()
    expect(window.$toast.success).toHaveBeenCalledWith('已切换到第 1 夜。')
    expect(appStore.grimoire.isMenuOpen).toBe(false)
  })

  test('renders a direct phase action without setup requirements', async () => {
    const { gameStore } = configureConnectedStoryteller()
    const wrapper = mount(GameTableFlowControls, {
      props: { visible: true },
    })

    expect(wrapper.text()).toContain('准备阶段')
    expect(wrapper.text()).toContain('可直接进入首夜。')
    expect(wrapper.find('.phase-setup-checklist').exists()).toBe(false)
    expect(wrapper.get('.phase-control-panel__action').text())
      .toContain('开启游戏并进入第一夜')
    expect(wrapper.get('.phase-control-panel__action').attributes('disabled'))
      .toBeUndefined()

    gameStore.players['player-1'].characterId = ''
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.phase-control-panel__action').attributes('disabled'))
      .toBeUndefined()
  })

  test('compact mode keeps only the advance button', () => {
    const { gameStore } = configureConnectedStoryteller()
    const wrapper = mount(GameTableFlowControls, {
      props: { visible: true, compact: true },
    })

    // 侧栏和完整卡片都允许直接推进，紧凑模式省略重复状态。
    expect(wrapper.find('.phase-control-panel__header').exists()).toBe(false)
    expect(wrapper.find('.phase-setup-checklist').exists()).toBe(false)
    expect(wrapper.find('.phase-control-panel__guidance').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('权威阶段')
    expect(wrapper.text()).not.toContain('服务器已同步')
    expect(wrapper.get('.phase-control-panel__action').text())
      .toContain('开启游戏并进入第一夜')

    gameStore.players['player-1'].characterId = ''
    return wrapper.vm.$nextTick().then(() => {
      expect(wrapper.get('.phase-control-panel__action').attributes('disabled'))
        .toBeUndefined()
    })
  })

  test('shows phase status to players without exposing a transition action', () => {
    const { gameStore } = configureConnectedStoryteller()
    gameStore.currentPlayer = { isDM: false }
    gameStore.level = 'day'
    gameStore.levelDays = 2
    const wrapper = mount(GameTableFlowControls, {
      props: { visible: true },
    })

    expect(wrapper.text()).toContain('第 2 天')
    expect(wrapper.text()).toContain('只有说书人可以切换房间阶段')
    expect(wrapper.find('.phase-control-panel__action').exists()).toBe(false)
  })

  test('opens the phase surface before a server script has been selected', async () => {
    const appStore = useAppStore()
    const gameStore = useGameStore()
    const sessionStore = useSessionStore()
    sessionStore.setApiRoomSession({ roomId: 'ROOM12', gameServerId: 'game-1' })
    gameStore.currentPlayer = { isDM: true }
    usePlayersStore().players = Array.from({ length: 8 }, () => ({
      id: '',
      role: {},
    }))
    appStore.toggleModal('nightOrder')

    const wrapper = mount(NightOrderModal, {
      global: {
        stubs: {
          'font-awesome-icon': true,
          RoleIcon: true,
        },
      },
    })
    await flushPromises()

    const modalText = document.body.textContent
    expect(modalText).toContain('阶段与夜间顺序')
    expect(modalText).toContain('当前剧本：尚未选择剧本')
    expect(modalText).toContain('尚未选择剧本')
    expect(modalText).toContain('本剧本没有首夜行动角色')
    expect(modalText).toContain('本剧本没有其他夜行动角色')
    expect(modalText).not.toContain('洗衣妇')
    expect(modalText).not.toContain('爪牙信息')
    wrapper.unmount()

    useGameScriptStore().applyGameScript('script-1', {
      name: '权威测试剧本',
      characters: [
        {
          id: 'night-role',
          name: '首夜角色',
          team: 'townsfolk',
          ability: '',
          firstNight: 5,
        },
      ],
    })
    gameStore.level = 'night'
    gameStore.levelDays = 1
    const hydratedWrapper = mount(NightOrderModal, {
      global: {
        stubs: {
          'font-awesome-icon': true,
          RoleIcon: true,
        },
      },
    })
    await flushPromises()
    expect(document.body.textContent).toContain('当前剧本：权威测试剧本')
    expect(document.body.textContent).toContain('首夜角色')
    expect(document.body.textContent).toContain('当前')
    hydratedWrapper.unmount()
  })

  test('runs the authoritative night checklist and sends private skill prompts', async () => {
    const appStore = useAppStore()
    const playersStore = usePlayersStore()
    const { controller, gameStore, sessionStore } = configureConnectedStoryteller()
    gameStore.level = 'night'
    gameStore.levelDays = 1
    gameStore.players['player-1'] = {
      userId: 'player-1',
      isDM: false,
      seat: 1,
      isAlive: true,
      characterId: 'washerwoman',
    }
    gameStore.players['player-2'] = {
      userId: 'player-2',
      isDM: false,
      seat: 2,
      isAlive: true,
      characterId: 'chef',
    }
    playersStore.players = [
      {
        id: 'player-1',
        name: '小钟',
        seat: 1,
        role: { id: 'washerwoman', team: 'townsfolk' },
        isDead: false,
      },
      {
        id: 'player-2',
        name: '暮鸦',
        seat: 2,
        role: { id: 'chef', team: 'townsfolk' },
        isDead: false,
      },
    ]
    useGameScriptStore().applyGameScript('script-1', {
      name: '权威夜间剧本',
      characters: [{
        id: 'washerwoman',
        name: '洗衣妇',
        team: 'townsfolk',
        ability: '得知两名玩家，其中一名是某镇民。',
        firstNight: 10,
        firstNightReminder: '唤醒洗衣妇并展示两名玩家与一个镇民身份。',
      }],
    })
    appStore.toggleModal('nightOrder')

    const updateNightAction = vi.spyOn(controller, 'updateNightAction')
      .mockImplementation(async (payload) => ({
        status: 200,
        data: {
          levelDays: 1,
          completedActionIds: ['character:washerwoman'],
          actionRecords: payload.targetUserIds ? [{
            actionId: 'character:washerwoman',
            targetUserIds: [...payload.targetUserIds],
            result: payload.result,
          }] : [],
          updatedAt: payload.targetUserIds ? 11 : 10,
        },
      }))
    const request = vi.spyOn(controller, 'request')
      .mockResolvedValue({ status: 200, data: { messageId: 'message-1' } })
    const wrapper = mount(NightOrderModal, {
      global: {
        stubs: {
          'font-awesome-icon': true,
          RoleIcon: true,
        },
      },
    })
    await flushPromises()

    const action = document.body.querySelector(
      '[data-testid="night-action-character:washerwoman"]',
    )
    expect(action).not.toBeNull()
    expect(action.getAttribute('aria-pressed')).toBe('false')
    action.click()
    await flushPromises()
    expect(updateNightAction).toHaveBeenCalledWith({
      levelDays: 1,
      actionId: 'character:washerwoman',
      completed: true,
    })
    expect(action.getAttribute('aria-pressed')).toBe('true')
    expect(document.body.textContent).toContain('已完成 1 / 1')

    document.body.querySelector(
      '[data-testid="night-record-edit-character:washerwoman"]',
    ).click()
    await wrapper.vm.$nextTick()
    document.body.querySelector(
      '[data-testid="night-target-character:washerwoman-player-1"]',
    ).click()
    document.body.querySelector(
      '[data-testid="night-target-character:washerwoman-player-2"]',
    ).click()
    const resultInput = document.body.querySelector(
      '[data-testid="night-result-character:washerwoman"]',
    )
    resultInput.value = '展示厨师身份'
    resultInput.dispatchEvent(new Event('input'))
    document.body.querySelector(
      '[data-testid="night-record-save-character:washerwoman"]',
    ).click()
    await flushPromises()
    expect(updateNightAction).toHaveBeenLastCalledWith({
      levelDays: 1,
      actionId: 'character:washerwoman',
      targetUserIds: ['player-1', 'player-2'],
      result: '展示厨师身份',
    })
    expect(document.body.textContent).toContain('1 · 小钟')
    expect(document.body.textContent).toContain('2 · 暮鸦')
    expect(document.body.textContent).toContain('展示厨师身份')
    const recordEdit = document.body.querySelector(
      '[data-testid="night-record-edit-character:washerwoman"]',
    )
    expect(document.activeElement).toBe(recordEdit)
    recordEdit.click()
    await wrapper.vm.$nextTick()
    const recordForm = document.body.querySelector(
      '#night-action-editor-character-washerwoman',
    )
    recordForm.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    }))
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector(
      '#night-action-editor-character-washerwoman',
    )).toBeNull()
    expect(document.activeElement).toBe(recordEdit)

    const message = document.body.querySelector(
      '[data-testid="night-message-character:washerwoman-player-1"]',
    )
    expect(message).not.toBeNull()
    message.click()
    await wrapper.vm.$nextTick()
    const composer = wrapper.findComponent(NightMessageComposer)
    expect(composer.exists()).toBe(true)
    composer.vm.$emit('send', [{ type: 'text', text: 'night prompt' }])
    await flushPromises()
    expect(request).toHaveBeenCalledWith(SocketClientEvent.SendDMMessage, {
      playerUserId: 'player-1',
      channel: 'skill',
      content: [{ type: 'text', text: 'night prompt' }],
      context: {
        kind: 'night-info',
        levelDays: 1,
        actionId: 'character:washerwoman',
        section: 'first',
      },
    })
    expect(window.$toast.success).toHaveBeenCalledWith('已向 小钟 发送夜间信息。')

    gameStore.levelDays = 2
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector(
      '[data-testid="night-message-character:washerwoman-player-1"]',
    )).toBeNull()

    wrapper.unmount()
  })

  test('resolves a poisoner target only after the authoritative response', async () => {
    const appStore = useAppStore()
    const playersStore = usePlayersStore()
    const { controller, gameStore } = configureConnectedStoryteller()
    gameStore.level = 'night'
    gameStore.levelDays = 1
    gameStore.players = {
      'player-1': {
        userId: 'player-1',
        isDM: false,
        seat: 1,
        isAlive: true,
        characterId: 'poisoner',
        connected: true,
      },
      'player-2': {
        userId: 'player-2',
        isDM: false,
        seat: 2,
        isAlive: true,
        characterId: 'chef',
        connected: true,
      },
    }
    playersStore.players = [
      {
        id: 'player-1',
        name: '小钟',
        seat: 1,
        role: { id: 'poisoner', team: 'minion' },
        isDead: false,
      },
      {
        id: 'player-2',
        name: '暮鸦',
        seat: 2,
        role: { id: 'chef', team: 'townsfolk' },
        isDead: false,
      },
    ]
    useGameScriptStore().applyGameScript('script-1', {
      name: '夜间结算剧本',
      characters: [{
        id: 'poisoner',
        name: '投毒者',
        team: 'minion',
        ability: '每个夜晚选择一名玩家中毒。',
        firstNight: 20,
      }],
    })
    gameStore.applyNightActionProgress({
      levelDays: 1,
      completedActionIds: [],
      actionRecords: [{
        actionId: 'character:poisoner',
        targetUserIds: ['player-2'],
      }],
      updatedAt: 10,
    })
    appStore.toggleModal('nightOrder')

    const updateNightAction = vi.spyOn(controller, 'updateNightAction')
      .mockResolvedValue({
        status: 200,
        data: {
          levelDays: 1,
          completedActionIds: [],
          actionRecords: [{
            actionId: 'character:poisoner',
            targetUserIds: ['player-2'],
            resolution: {
              effects: [{ targetUserId: 'player-2', type: 'poisoned' }],
              resolvedAt: 20,
              resolvedByUserId: 'dm-1',
            },
          }],
          updatedAt: 20,
        },
      })
    const wrapper = mount(NightOrderModal, {
      global: {
        stubs: {
          'font-awesome-icon': true,
          RoleIcon: true,
        },
      },
    })
    await flushPromises()

    document.body.querySelector(
      '[data-testid="night-resolution-open-character:poisoner"]',
    ).click()
    await wrapper.vm.$nextTick()
    expect(updateNightAction).not.toHaveBeenCalled()
    document.body.querySelector(
      '[data-testid="night-resolution-confirm-character:poisoner"]',
    ).click()
    await flushPromises()

    expect(updateNightAction).toHaveBeenCalledWith({
      levelDays: 1,
      actionId: 'character:poisoner',
      resolution: {
        effects: [{ targetUserId: 'player-2', type: 'poisoned' }],
      },
    })
    expect(document.body.textContent).toContain('2 · 暮鸦 · 中毒影响')
    expect(window.$toast.success).toHaveBeenCalledWith('投毒者的中毒影响已结算。')

    wrapper.unmount()
  })

  test.each(['empty', 'unassigned', 'outside-script'])(
    'starts an API room with %s setup', async (setup) => {
      const { controller, gameStore } = configureConnectedStoryteller()
      const changeLevel = vi.spyOn(controller, 'changeLevel')
        .mockResolvedValue({ status: 200 })
      vi.spyOn(controller, 'refreshGameState').mockResolvedValue({ status: 200 })
      useGameScriptStore().resetRoomScript()
      gameStore.players = setup === 'empty' ? {} : {
        'player-2': {
          userId: 'player-2', isDM: false, seat: 2,
          characterId: setup === 'unassigned' ? '' : 'outside-script',
        },
      }
      const wrapper = mount(GameTableFlowControls, { props: { visible: true } })

      expect(wrapper.get('.phase-control-panel__action').attributes('disabled')).toBeUndefined()
      await wrapper.get('.phase-control-panel__action').trigger('click')
      await flushPromises()
      expect(changeLevel).toHaveBeenCalledWith({ nextLevel: 'night' })
      expect(window.$toast.warning).not.toHaveBeenCalled()
      expect(window.$toast.error).not.toHaveBeenCalled()
      wrapper.unmount()
    },
  )

  test('keeps the phase action unavailable during a reconnect', () => {
    const { controller } = configureConnectedStoryteller()
    controller.connectionStatus = 'reconnecting'
    const wrapper = mount(GameTableFlowControls, { props: { visible: true } })
    expect(wrapper.get('.phase-control-panel__action').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  test('starts an unconfigured demo through the phase button', async () => {
    const demo = useDemoStore()
    demo.begin(false)
    const wrapper = mount(GameTableFlowControls, { props: { visible: true } })
    await wrapper.get('.phase-control-panel__action').trigger('click')
    expect(demo.level).toBe('night')
    expect(demo.levelDays).toBe(1)
    expect(window.$toast.warning).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  test('enables review only after confirmation and revives players', async () => {
    const playersStore = usePlayersStore()
    const sessionStore = useSessionStore()
    const realivePlayers = vi.spyOn(playersStore, 'realivePlayers')
    const wrapper = mount(GameTableFlowControls)

    const request = wrapper.vm.toggleIsReview()
    sessionStore.inputResolver?.(true)
    await request

    expect(sessionStore.isReview).toBe(true)
    expect(realivePlayers).toHaveBeenCalledOnce()

    await wrapper.vm.toggleIsReview()
    expect(sessionStore.isReview).toBe(false)
  })

  test('syncs a local hand raise and routes the API entry to hand signals without changing votes', () => {
    const sessionStore = useSessionStore()
    sessionStore.claimSeat(2)
    sessionStore.votes[2] = 0
    const voteSync = vi.spyOn(sessionStore, 'voteSync')
    const wrapper = mount(GameTableFlowControls)

    wrapper.vm.toggleRaiseHand()
    expect(voteSync).toHaveBeenCalledWith([2, 1])

    sessionStore.setApiRoomSession({
      roomId: 'ROOM12',
      gameServerId: 'game-1',
    })
    const toggleHand = vi.spyOn(usePlayerViewStore(), 'toggleHand').mockResolvedValue()
    wrapper.vm.toggleRaiseHand()
    expect(toggleHand).toHaveBeenCalledOnce()
    expect(voteSync).toHaveBeenCalledTimes(1)
  })
})


test('recall reaches the authoritative voice service and ordinary players cannot invoke it', async () => {
  const { controller, gameStore } = configureConnectedStoryteller()
  gameStore.level = 'day'
  const request = vi.spyOn(controller, 'request').mockResolvedValue({ status: 200 })
  const wrapper = mount(GameTableFlowControls)
  await wrapper.vm.returnEveryoneToTown()
  expect(request).toHaveBeenCalledWith(SocketClientEvent.DMVoiceRoomReturnToPublic, {})
  request.mockClear()
  gameStore.currentPlayer = { userId: 'a', seat: 1, isDM: false }
  await wrapper.vm.returnEveryoneToTown()
  expect(request).not.toHaveBeenCalled()
  wrapper.unmount()
})

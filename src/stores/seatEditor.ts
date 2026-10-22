import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useGameController } from '@/controllers/GameController'
import { requestInputModal } from '@/services/inputModalService'
import { useAppStore } from './app'
import { useGameStore } from './game'
import { usePlayersStore } from './players'
import { useSessionStore } from './session'

export const useSeatEditorStore = defineStore('seatEditor', () => {
  const open = ref(false)
  const pending = ref(false)
  const movingSeat = ref(-1)
  const dropSeat = ref(-1)
  const dragX = ref(0)
  const dragY = ref(0)
  const layoutChange = ref<{ order: Array<number | null>; revision: number }>({ order: [], revision: 0 })
  const seatKeys = ref<string[]>([])
  let nextKey = 0
  const players = usePlayersStore()
  const session = useSessionStore()
  const game = useGameStore()
  const controller = useGameController()
  const isApiRoom = computed(() => Boolean(session.sessionId && session.gameServerId))
  const permitted = computed(() => !session.isSpectator && (!isApiRoom.value || game.currentIsDm))
  const canEdit = computed(() => permitted.value && (!isApiRoom.value || controller.isConnected))
  const minimum = computed(() => 0)
  const status = computed(() => {
    if (!permitted.value) return '只有说书人可以调整座位。'
    if (isApiRoom.value && !controller.isConnected) return '房间正在重连，暂时无法调整座位。'
    return ''
  })
  watch(permitted, allowed => { if (!allowed) close() })
  watch(() => session.sessionId, () => {
    close()
    seatKeys.value = []
  })

  function cancelMove() {
    movingSeat.value = -1
    dropSeat.value = -1
    dragX.value = 0
    dragY.value = 0
  }
  function close() {
    open.value = false
    cancelMove()
  }
  function show() {
    if (!permitted.value) return
    useAppStore().toggleMenu(false)
    syncKeys()
    cancelMove()
    open.value = true
  }
  function syncKeys() {
    while (seatKeys.value.length < players.players.length) seatKeys.value.push(`edit-seat-${++nextKey}`)
    seatKeys.value.length = players.players.length
  }
  function recordLayout(order: Array<number | null>) {
    // DOM key 跟随原座位移动，避免重排时复用错角色标记或重播入场动画。
    const oldKeys = [...seatKeys.value]
    seatKeys.value = order.map(index => index === null ? `edit-seat-${++nextKey}` : oldKeys[index])
    layoutChange.value = { order, revision: layoutChange.value.revision + 1 }
    cancelMove()
  }
  async function run(action: () => Promise<void> | void): Promise<void> {
    // 座位调整串行执行；失败后拉取权威状态，避免界面停留在过期布局。
    if (pending.value || !permitted.value) return
    if (!canEdit.value) {
      window.$toast.warning(status.value)
      return
    }
    pending.value = true
    try {
      await action()
    } catch (error) {
      window.$toast.error(error instanceof Error ? error.message : '调整座位失败，请重试')
      if (isApiRoom.value) await controller.refreshGameState().catch(() => undefined)
    } finally {
      pending.value = false
    }
  }
  async function addPlayer(stImage: unknown = null, stName: string | null = null) {
    if (players.players.length >= 20) return
    await run(async () => {
      syncKeys()
      if (isApiRoom.value) {
        await controller.setSeatCount({ seatCount: players.players.length + 1 })
        await controller.refreshGameState()
      } else {
        players.add({ name: '', stImage, stName })
      }
      syncKeys()
    })
  }
  async function applyLayout(order: Array<number | null>) {
    await run(async () => {
      syncKeys()
      if (isApiRoom.value) {
        await controller.setSeatCount({
          seatCount: order.length,
          seatOrder: order,
          // 将当前占座快照一并提交，供服务端拒绝基于过期座位表的修改。
          expectedSeatUsers: players.players.map(player => player.id || ''),
        })
        await controller.refreshGameState()
      } else {
        const before = [...players.players]
        players.set(order.map(index => before[index!]))
      }
      recordLayout(order)
    })
  }
  async function confirm(message: string) {
    return await requestInputModal({
      inputType: 'confirm', inputModal: 'confirm', inputData: { name: [message] },
    }).catch(() => false) === true
  }
  async function removeSeat(index: number) {
    if (pending.value || !canEdit.value || players.players.length <= minimum.value) return
    const player = players.players[index]
    if (!player) return
    if (player.id && !await confirm(`确定要移除 ${player.name || `${index + 1} 号座位`} 的座位吗？玩家将回到旁观席。`)) return
    if (players.players[index]?.id !== player.id) {
      window.$toast.warning('座位上的玩家已变更，请重试。')
      return
    }
    await applyLayout(players.players.map((_, i) => i).filter(i => i !== index))
  }
  async function moveSeat(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= players.players.length || to >= players.players.length) {
      cancelMove()
      return
    }
    const order = players.players.map((_, i) => i)
    order.splice(to, 0, order.splice(from, 1)[0])
    await applyLayout(order)
  }
  async function randomizeSeatings(ask = true) {
    if (!canEdit.value || pending.value) return
    if (ask && !await confirm('确定要随机分配座位吗？')) return
    if (!isApiRoom.value) {
      await run(() => {
        syncKeys()
        const before = [...players.players]
        players.randomize()
        recordLayout(players.players.map(player => before.indexOf(player)))
      })
      return
    }
    const order = players.players.map((_, i) => i)
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    await applyLayout(order)
  }
  async function clearPlayers() {
    if (!canEdit.value || pending.value) return
    if (!players.players.length) return
    const message = isApiRoom.value
      ? '确定要清除所有座位吗？玩家将回到旁观席。'
      : '确定要移除所有座位吗？'
    if (!await confirm(message)) return
    if (!canEdit.value || pending.value) return
    if (session.nomination) session.nominationUpdate({})
    if (isApiRoom.value) {
      await applyLayout([])
    } else {
      syncKeys()
      if (players.players.length === 1) {
        players.remove(0)
        players.setBluff()
        players.setFabled({ fabled: [], emptyFabled: !session.sessionId })
      }
      else players.clear(!session.sessionId)
      recordLayout([])
    }
  }
  async function clearRoles() {
    if (!canEdit.value || pending.value) return
    if (!await confirm('确定要清空所有角色和提示标记吗？玩家和座位将保留。')) return
    await run(async () => {
      if (isApiRoom.value) {
        if (game.seatCount) await controller.request('dmSetSeatRoles', {
          assignments: Array.from({ length: game.seatCount }, (_, index) => ({ seat: index + 1, characterId: '' })),
          expectedSeatUsers: players.players.map(player => player.id || ''),
        });
        for (const player of players.players) {
          if (player.id) await controller.updatePlayer({
            userId: player.id, characterId: '', marks: [], hiddenBuffs: [],
          })
        }
        await controller.refreshGameState()
      } else {
        players.clearRoles()
      }
      layoutChange.value = { order: players.players.map(() => null), revision: layoutChange.value.revision + 1 }
    })
  }
  return { open, pending, movingSeat, dropSeat, dragX, dragY, layoutChange, seatKeys, canEdit, minimum, status,
    show, close, cancelMove, addPlayer, removeSeat, moveSeat, randomizeSeatings, clearPlayers, clearRoles }
})

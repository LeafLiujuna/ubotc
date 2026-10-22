import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useSessionStore } from './session'
import { useGameStore } from './game'
import { useUserStore } from './user'
import { useGameController } from '@/controllers/GameController'
import { SocketClientEvent } from '@/types/socket'
import type { Player, Role } from '@/types/domain'

/**
 * A role note is a local observation.  Keep the authoritative role that was
 * visible when the note was made so a later storyteller assignment can replace
 * a stale note in the player's grimoire.
 */
type SeatNote = { role?: Role; reminders?: unknown[]; sourceRoleId?: string }
type Notebook = { rolesCleared: boolean; seatsCleared: boolean; notes: Record<string, SeatNote> }
const emptyNotebook = (): Notebook => ({ rolesCleared: false, seatsCleared: false, notes: {} })

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 缓存可能来自旧版本或被手动修改，只恢复当前支持的笔记字段。 */
function readNotebook(key: string): Notebook {
  const notebook = emptyNotebook()
  if (!key) return notebook
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) || 'null')
    if (!isRecord(saved)) return notebook
    notebook.rolesCleared = saved.rolesCleared === true
    notebook.seatsCleared = saved.seatsCleared === true
    if (isRecord(saved.notes)) {
      for (const [seat, value] of Object.entries(saved.notes)) {
        if (!/^(user:.+|seat:\d+)$/.test(seat) || !isRecord(value)) continue
        const note: SeatNote = {}
        if (isRecord(value.role) && typeof value.role.id === 'string') note.role = value.role as Role
        if (Array.isArray(value.reminders)) note.reminders = value.reminders
        if (typeof value.sourceRoleId === 'string') note.sourceRoleId = value.sourceRoleId
        notebook.notes[seat] = note
      }
    }
  } catch { /* 缓存损坏或浏览器禁止存储时，仍可进入房间并在内存中记录。 */ }
  return notebook
}

export const HAND_ICONS = [
  '✋',
  '👋',
  '✊',
  '✌️',
  '👍',
  '👎',
  '☝️',
  '🤚',
  '🙂',
  '🙁',
]
export const usePlayerViewStore = defineStore('playerView', () => {
  const rolesCleared = ref(false)
  const seatsCleared = ref(false)
  const handIcon = ref('✋')
  const handPending = ref(false)
  const session = useSessionStore()
  const user = useUserStore()
  const notes = ref<Record<string, SeatNote>>({})
  // 账号、节点和房间共同隔离个人魔典；相同房间号在不同节点也不能共用笔记。
  const scope = computed(() => user.userId && session.sessionId && session.gameServerId
    ? `ts-player-grimoire:v1:${JSON.stringify([user.userId, session.gameServerId, session.sessionId])}` : '')
  let loading = false
  watch(
    scope,
    key => {
      // 同步恢复期间暂停持久化，防止旧房间的数据写入新房间的缓存键。
      loading = true
      const saved = readNotebook(key)
      rolesCleared.value = saved.rolesCleared
      seatsCleared.value = saved.seatsCleared
      notes.value = saved.notes
      handIcon.value = '✋'
      loading = false
    },
    { flush: 'sync', immediate: true }
  )
  watch([rolesCleared, seatsCleared, notes], () => {
    if (loading || !scope.value) return
    try { localStorage.setItem(scope.value, JSON.stringify({ rolesCleared: rolesCleared.value, seatsCleared: seatsCleared.value, notes: notes.value })) }
    catch { /* Keep edits usable when browser storage is unavailable. */ }
  }, { deep: true, flush: 'sync' })
  // 已入座玩家的笔记跟随用户移动；空座位才按索引标记。
  const seatKey = (player: Pick<Player, 'id'>, index: number) => player.id ? `user:${player.id}` : `seat:${index}`
  function setRole(player: Player, index: number, role: Role) {
    if (!scope.value) return
    const key = seatKey(player, index)
    notes.value[key] = {
      ...notes.value[key],
      role: JSON.parse(JSON.stringify(role)),
      sourceRoleId: typeof player.role?.id === 'string' ? player.role.id : '',
    }
  }
  function setReminders(player: Player, index: number, reminders: unknown[]) {
    if (!scope.value) return
    const key = seatKey(player, index)
    notes.value[key] = { ...notes.value[key], reminders: JSON.parse(JSON.stringify(reminders)) }
  }
  function clearRoles() {
    notes.value = {}
    rolesCleared.value = true
  }
  function project(players: Player[]): Player[] {
    // 只生成个人显示投影，不把推测角色和本地提示写回服务端玩家状态。
    if (seatsCleared.value) return []
    return players.map((player, index) => {
      const note = notes.value[seatKey(player, index)]
      if (!rolesCleared.value && !note) return player
      // Once the server has assigned a different role, the old local role
      // observation is stale.  Keep reminders and other notes, but let the
      // freshly delivered role show through.  Older saved notes predate
      // sourceRoleId, so infer their source from the role currently delivered
      // by the server; an empty role remains a pending assignment.
      const currentRoleId = typeof player.role?.id === 'string' ? player.role.id : ''
      const roleNoteMatchesSource = typeof note?.sourceRoleId === 'string'
        ? note.sourceRoleId === currentRoleId
        : !currentRoleId || note?.role?.id === currentRoleId
      return {
        ...player,
        role: roleNoteMatchesSource && note?.role && typeof note.role.id === 'string'
          ? { ...note.role }
          : rolesCleared.value ? { id: '' } : player.role,
        reminders: Array.isArray(note?.reminders) ? [...note.reminders] : rolesCleared.value ? [] : player.reminders,
        stReminders: rolesCleared.value ? [] : player.stReminders,
      }
    })
  }
  async function toggleHand(icon?: string): Promise<void> {
    const game = useGameStore()
    if (
      !game.currentPlayer ||
      (!game.currentIsDm && game.currentPlayer.seat < 1) ||
      handPending.value
    )
      return
    if (icon) handIcon.value = icon
    const userId = useUserStore().userId
    const next = icon || !game.handSignals[userId || ''] ? handIcon.value : null
    handPending.value = true
    try {
      await useGameController().request(SocketClientEvent.SetHandSignal, {
        icon: next,
      })
    } catch (error) {
      window.$toast.error(
        error instanceof Error ? error.message : '举手失败，请重试'
      )
    } finally {
      handPending.value = false
    }
  }
  return {
    rolesCleared,
    seatsCleared,
    handIcon,
    handPending,
    project,
    setRole,
    setReminders,
    clearRoles,
    notebookKey: scope,
    toggleHand,
  }
})

import { useDemoStore } from '@/stores/demo'
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'
import { useGameStore } from '@/stores/game'
import { useGameScriptStore } from '@/stores/gameScript'
import { usePlayersStore } from '@/stores/players'
import { useSessionStore } from '@/stores/session'
import {
  nightWakeRoleKey,
  useNightWakeMarkers,
} from '@/composables/useNightWakeMarkers'

/**
 * The first-night / other-night wake order, derived once and shared.
 *
 * Two surfaces render this list — the 阶段与夜间顺序 modal (with the storyteller's
 * workbench) and the table's right-hand 剧本表 sidebar (read-only). They must never
 * disagree about who wakes when, so the ordering lives here rather than in either
 * component.
 */
export function useNightOrderRoles() {
  const demo = useDemoStore()
  const appStore = useAppStore()
  const gameStore = useGameStore()
  const gameScriptStore = useGameScriptStore()
  const playersStore = usePlayersStore()
  const sessionStore = useSessionStore()
  const { roles, grimoire, firstNight, otherNight } = storeToRefs(appStore)
  const { players, fabled } = storeToRefs(playersStore)
  const { isManuallyMarked, toggleWakeMarker } = useNightWakeMarkers()

  const isApiRoom = computed(() =>
    Boolean(sessionStore.sessionId && sessionStore.gameServerId))

  /** Which list the room is actually working through, or null outside a night. */
  const currentNightSection = computed(() => {
    if (demo.active) return demo.level === 'night' ? (demo.levelDays <= 1 ? 'first' : 'other') : null
    if (!isApiRoom.value || gameStore.level !== 'night') return null
    return gameStore.levelDays <= 1 ? 'first' : 'other'
  })

  const nightOrderRoles = computed(() => isApiRoom.value
    ? [...gameScriptStore.characters]
    : [...roles.value.values()])

  const nightOrderFabled = computed(() => (isApiRoom.value ? [] : fabled.value))

  const canEditWakeMarkers = computed(() => (
    isApiRoom.value ? gameStore.currentIsDm : !sessionStore.isSpectator
  ))

  function decorateNightRole(section, role) {
    const configuredPlayers = (role.players || []).filter((player) => player?.id || (demo.active && player?.role?.id))
    const isConfigured = configuredPlayers.length > 0
    const isManual = isManuallyMarked(section, role)
    return {
      ...role,
      isConfigured,
      isWakeMarked: isConfigured || isManual,
      wakeMarkerSource: isConfigured ? 'configured' : isManual ? 'manual' : 'none',
      wakeMarkerId: nightWakeRoleKey(role),
    }
  }

  function handleWakeMarkerToggle(section, role) {
    if (!canEditWakeMarkers.value || role.isConfigured) return false
    return toggleWakeMarker(section, role)
  }

  const seatedNonTravelerCount = computed(() => isApiRoom.value
    ? Object.values(gameStore.players)
        .filter((player) => !player.isDM && player.seat > 0)
        .length
    : players.value
        .filter((player) => (player.id || (demo.active && player.role?.id)) && player.role?.team !== 'traveler')
        .length)

  const rolesFirstNight = computed(() => {
    const rolesFirstNight = []
    // add minion / demon infos to night order sheet
    if (seatedNonTravelerCount.value > 6) {
      rolesFirstNight.push(
        {
          id: 'evil',
          alias: 'minioninfo',
          name: '爪牙信息',
          firstNight: grimoire.value.isForwardEvilInfo ? 0 : 15,
          team: 'minion',
          players: players.value.filter((p) => p.role.team === 'minion'),
        },
        {
          id: 'evil',
          alias: 'demoninfo',
          name: '恶魔信息与伪装身份',
          firstNight: grimoire.value.isForwardEvilInfo ? 0 : 21,
          team: 'demon',
          players: players.value.filter((p) => p.role.team === 'demon'),
        }
      )
    }
    nightOrderRoles.value.forEach((role) => {
      const rolePlayers = players.value.filter((p) => p.role.id === role.id)
      if (role.firstNight && (role.team !== 'traveler' || rolePlayers.length)) {
        if (rolePlayers.length > 0 && !rolePlayers[0].id) rolePlayers[0].name = ''
        rolesFirstNight.push(Object.assign({ players: rolePlayers }, role))
      }
    })
    nightOrderFabled.value
      .filter(({ firstNight }) => firstNight)
      .forEach((fabled) => {
        rolesFirstNight.push(Object.assign({ players: [] }, fabled))
      })
    const rolesArr = nightOrderRoles.value
    const roleIds = [
      ...rolesArr.filter((role) => role.firstNight > 0).map((role) => role.id),
      ...nightOrderFabled.value
        .filter((role) => role.firstNight > 0)
        .map((role) => role.id),
      'dusk',
      'dawn',
      'minioninfo',
      'demoninfo',
    ]
    const customOrder =
      !isApiRoom.value &&
      firstNight.value.every((role) => roleIds.includes(role)) &&
      roleIds.every((role) => firstNight.value.includes(role))
    rolesFirstNight.sort((a, b) => {
      return customOrder
        ? firstNight.value.indexOf(a.alias || a.id) -
            firstNight.value.indexOf(b.alias || b.id)
        : a.firstNight - b.firstNight
    })
    return rolesFirstNight
  })

  const rolesOtherNight = computed(() => {
    const rolesOtherNight = []
    nightOrderRoles.value.forEach((role) => {
      const rolePlayers = players.value.filter((p) => p.role.id === role.id)
      if (role.otherNight && (role.team !== 'traveler' || rolePlayers.length)) {
        if (rolePlayers.length > 0 && !rolePlayers[0].id) rolePlayers[0].name = ''
        rolesOtherNight.push(Object.assign({ players: rolePlayers }, role))
      }
    })
    nightOrderFabled.value
      .filter(({ otherNight }) => otherNight)
      .forEach((fabled) => {
        rolesOtherNight.push(Object.assign({ players: [] }, fabled))
      })
    const rolesArr = nightOrderRoles.value
    const roleIds = [
      ...rolesArr.filter((role) => role.otherNight > 0).map((role) => role.id),
      ...nightOrderFabled.value
        .filter((role) => role.otherNight > 0)
        .map((role) => role.id),
      'dusk',
      'dawn',
    ]
    const customOrder =
      !isApiRoom.value &&
      otherNight.value.every((role) => roleIds.includes(role)) &&
      roleIds.every((role) => otherNight.value.includes(role))
    rolesOtherNight.sort((a, b) => {
      return customOrder
        ? otherNight.value.indexOf(a.id) - otherNight.value.indexOf(b.id)
        : a.otherNight - b.otherNight
    })
    return rolesOtherNight
  })

  /**
   * Both lists in render order: whichever section the room is on comes first, so
   * the sidebar never asks the storyteller to scroll past a list they are done
   * with. Each entry carries its own 1-based number — the sidebar and the modal
   * must call the same role "第 3 位".
   */
  const nightOrderSections = computed(() => {
    const sections = [
      { key: 'first', label: '首夜', roles: rolesFirstNight.value },
      { key: 'other', label: '其他夜', roles: rolesOtherNight.value },
    ].map((section) => ({
      ...section,
      isCurrent: currentNightSection.value === section.key,
      entries: section.roles.map((rawRole, index) => {
        const role = decorateNightRole(section.key, rawRole)
        return {
          key: `${section.key}-${role.alias || role.id || role.name}-${index}`,
          number: index + 1,
          role,
        }
      }),
    }))
    return sections.sort((left, right) =>
      Number(right.isCurrent) - Number(left.isCurrent))
  })

  return {
    isApiRoom,
    currentNightSection,
    seatedNonTravelerCount,
    rolesFirstNight,
    rolesOtherNight,
    nightOrderSections,
    canEditWakeMarkers,
    handleWakeMarkerToggle,
  }
}

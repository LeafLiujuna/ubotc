<script setup lang="ts">
import CreateRoomModal from '@/components/modals/CreateRoomModal.vue'
import InputModal from '@/components/modals/InputModal.vue'
import { useInputDialog } from '@/composables/useInputDialog'
import { GameApi } from '@/api/http/game'
import { AuthHelper } from '@/helpers'
import { apiClient } from '@/transport/http'
import {
  getRoomJoinFailure,
  isAuthenticationFailure,
  shouldPromptForRoomPassword,
} from '@/services/roomJoinFailure'
import type { CreateRoomData, RoomListItem } from '@/types/game'
import type { ApiResponse } from '@/types/http'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'

defineOptions({
  name: 'RoomList',
})

type LobbyRoomHost = {
  id: string
  displayName: string
  avatarUrl: string | null
  isCertifiedStoryteller: boolean
  isVip: boolean
}

type LobbyRoomScript = {
  id: string
  name: string
  iconUrl: string | null
  authorName: string | null
}

type LobbyRoom = {
  roomId: string
  name: string
  tags: Array<{ tag: string; detail?: string }>
  host: LobbyRoomHost | null
  gameScript: LobbyRoomScript | null
  level: string
  levelDays: number
  playerCount: number
  onlineCount: number
  maxPlayer: number
  maxOnline: number
  isPrivate: boolean
  isVip: boolean
  createdAt: number
  updatedAt: number
  gameStartedAt: number | null
  snapshotUpdatedAt: number | null
}

type LobbyRoomPage = {
  items: LobbyRoom[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

type FetchOptions = {
  background?: boolean
}

const PAGE_SIZE = 12
const REFRESH_INTERVAL_MS = 30_000

const route = useRoute()
const router = useRouter()
const inputDialog = useInputDialog()

function routeRoomQuery(): string {
  const value = route.query.room
  const firstValue = Array.isArray(value) ? value[0] : value
  return typeof firstValue === 'string' ? firstValue.trim().slice(0, 120) : ''
}

let pendingInitialRoomId = routeRoomQuery()

const state = reactive({
  rooms: [] as LobbyRoom[],
  currentPage: 1,
  pageSize: PAGE_SIZE,
  total: 0,
  totalPages: 0,
  search: pendingInitialRoomId,
  difficulty: '',
  level: '',
  initialLoading: true,
  refreshing: false,
  stale: false,
  error: '',
  refreshError: '',
  actionMessage: '',
  requiresLogin: false,
  showCreateModal: false,
  joiningRoomId: '',
  selectedRoomId: '',
  selectedRoom: null as LobbyRoom | null,
  detailLoading: false,
  detailError: '',
  mobileDetailOpen: false,
  lastUpdatedAt: 0,
  v2Supported: null as boolean | null,
})

const isCompact = ref(false)
const detailPanel = ref<HTMLElement | null>(null)
const detailCloseButton = ref<HTMLButtonElement | null>(null)

let refreshTimer: number | null = null
let filterTimer: number | null = null
let fetchSequence = 0
let detailFetchSequence = 0
let filtersReady = false
let detailTrigger: HTMLElement | null = null
let compactMediaQuery: MediaQueryList | null = null

const totalOnline = computed(() =>
  state.rooms.reduce((sum, room) => sum + Math.max(0, room.onlineCount), 0)
)

const hasFilters = computed(() =>
  Boolean(state.search.trim() || state.difficulty || state.level)
)

const liveStatus = computed(() => {
  if (state.actionMessage) return state.actionMessage
  if (state.refreshError) return state.refreshError
  if (state.refreshing) return '正在后台刷新房间信息'
  return ''
})

const selectedDifficulty = computed(() =>
  state.selectedRoom ? getDifficultyLabel(state.selectedRoom) : '未标注'
)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function getHttpStatus(error: unknown): number | undefined {
  if (!isRecord(error) || !isRecord(error.response)) return undefined
  const status = error.response.status
  return typeof status === 'number' ? status : undefined
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (isRecord(error)) {
    if (isRecord(error.response) && isRecord(error.response.data)) {
      const responseMessage = error.response.data.message
      if (typeof responseMessage === 'string' && responseMessage.trim()) {
        return responseMessage
      }
    }
    if (typeof error.message === 'string' && error.message.trim()) {
      return error.message
    }
  }
  return fallback
}

function normalizeLegacyRoom(value: unknown): LobbyRoom | null {
  if (!isRecord(value) || typeof value.roomId !== 'string') return null

  const legacy = value as Partial<RoomListItem>
  const hostUser = isRecord(value.hostUser) ? value.hostUser : null
  const gameScript = isRecord(value.gameScript) ? value.gameScript : null
  const tags = Array.isArray(value.tags)
    ? value.tags.flatMap((tag) => {
        if (!isRecord(tag) || typeof tag.tag !== 'string') return []
        return [
          {
            tag: tag.tag,
            ...(typeof tag.detail === 'string' ? { detail: tag.detail } : {}),
          },
        ]
      })
    : []

  return {
    roomId: value.roomId,
    name:
      typeof value.name === 'string' && value.name.trim()
        ? value.name
        : value.roomId,
    tags,
    host:
      hostUser && typeof hostUser.id === 'string'
        ? {
            id: hostUser.id,
            displayName:
              typeof hostUser.displayName === 'string'
                ? hostUser.displayName
                : hostUser.id,
            avatarUrl:
              typeof hostUser.avatarUrl === 'string'
                ? hostUser.avatarUrl
                : null,
            isCertifiedStoryteller: Boolean(hostUser.isCertifiedStoryteller),
            isVip: Boolean(hostUser.isVip),
          }
        : typeof legacy.host === 'string' && legacy.host
          ? {
              id: legacy.host,
              displayName: legacy.host,
              avatarUrl: null,
              isCertifiedStoryteller: false,
              isVip: false,
            }
          : null,
    gameScript:
      gameScript &&
      typeof gameScript.id === 'string' &&
      typeof gameScript.name === 'string'
        ? {
            id: gameScript.id,
            name: gameScript.name,
            iconUrl:
              typeof gameScript.iconUrl === 'string'
                ? gameScript.iconUrl
                : null,
            authorName:
              typeof gameScript.authorName === 'string'
                ? gameScript.authorName
                : null,
          }
        : null,
    level: typeof value.level === 'string' ? value.level : 'prepare',
    levelDays: readNumber(value.levelDays),
    playerCount: readNumber(value.playerCount),
    onlineCount: readNumber(value.onlineCount),
    maxPlayer: readNumber(value.maxPlayer),
    maxOnline: readNumber(value.maxPlayer),
    isPrivate: Boolean(value.isPrivate),
    isVip: false,
    createdAt: readNumber(value.createdAt),
    updatedAt: readNumber(value.createdAt),
    gameStartedAt: null,
    snapshotUpdatedAt: null,
  }
}

function normalizeLegacyPage(
  payload: unknown,
  page: number,
  pageSize: number
): LobbyRoomPage {
  const payloadRecord = isRecord(payload) ? payload : null
  const rawItems = Array.isArray(payload)
    ? payload
    : payloadRecord && Array.isArray(payloadRecord.items)
      ? payloadRecord.items
      : []
  const items = rawItems.flatMap((item) => {
    const normalized = normalizeLegacyRoom(item)
    return normalized ? [normalized] : []
  })
  const total = payloadRecord
    ? readNumber(payloadRecord.total, items.length)
    : items.length
  const totalPages = payloadRecord
    ? readNumber(payloadRecord.totalPages, Math.ceil(total / pageSize))
    : Math.ceil(total / pageSize)

  return {
    items,
    total,
    page: payloadRecord ? readNumber(payloadRecord.page, page) : page,
    pageSize,
    totalPages,
  }
}

async function fetchLobbyPage(): Promise<LobbyRoomPage> {
  try {
    const { data: response } = await apiClient.get<ApiResponse<LobbyRoomPage>>(
      '/v2/rooms',
      {
        params: {
          page: state.currentPage,
          pageSize: state.pageSize,
          query: state.search.trim() || undefined,
          difficulty: state.difficulty || undefined,
          level: state.level || undefined,
        },
      }
    )

    if (!response.data) {
      throw new Error(response.message || '大厅接口未返回房间数据')
    }
    state.v2Supported = true
    return response.data
  } catch (error) {
    const status = getHttpStatus(error)
    if (status !== 404 && status !== 405) throw error

    const legacyResponse = await GameApi.listRooms(
      state.currentPage,
      state.pageSize
    )
    if (
      legacyResponse.status < 200 ||
      legacyResponse.status >= 300 ||
      !legacyResponse.data
    ) {
      throw new Error(legacyResponse.message || '旧版大厅接口未返回房间数据')
    }
    state.v2Supported = false
    return normalizeLegacyPage(
      legacyResponse.data as unknown,
      state.currentPage,
      state.pageSize
    )
  }
}

async function fetchRooms(options: FetchOptions = {}): Promise<void> {
  const requestId = ++fetchSequence
  const hasExistingRooms = state.rooms.length > 0

  if (hasExistingRooms || options.background) {
    state.refreshing = true
  } else {
    state.initialLoading = true
  }
  if (!options.background) state.error = ''
  state.refreshError = ''
  state.requiresLogin = false

  try {
    const page = await fetchLobbyPage()
    if (requestId !== fetchSequence) return

    state.rooms = page.items
    state.total = page.total
    state.currentPage = page.page
    state.totalPages = page.totalPages
    state.lastUpdatedAt = Date.now()
    state.stale = false

    if (state.selectedRoomId) {
      const updatedSelection = state.rooms.find(
        (room) => room.roomId === state.selectedRoomId
      )
      if (updatedSelection) state.selectedRoom = updatedSelection
    }

    const initialRoomId = pendingInitialRoomId
    pendingInitialRoomId = ''
    if (initialRoomId) {
      const exactMatch = state.rooms.find(
        (room) => room.roomId.toLowerCase() === initialRoomId.toLowerCase()
      )
      if (exactMatch) {
        void selectRoom(exactMatch, null, true)
      } else if (state.v2Supported) {
        void loadRoomById(initialRoomId, true)
      } else {
        state.actionMessage = `未在当前大厅中找到房间 ${initialRoomId}`
      }
    } else if (!state.selectedRoom && !isCompact.value && state.rooms[0]) {
      void selectRoom(state.rooms[0], null, false)
    }
  } catch (error) {
    if (requestId !== fetchSequence) return
    const message = getErrorMessage(error, '房间列表加载失败，请稍后重试。')
    state.requiresLogin = getHttpStatus(error) === 401
    if (state.rooms.length > 0) {
      state.stale = true
      state.refreshError = `刷新失败，正在显示上次结果。${message}`
    } else {
      state.error = state.requiresLogin
        ? '登录状态已失效，请重新登录。'
        : message
    }
  } finally {
    if (requestId === fetchSequence) {
      state.initialLoading = false
      state.refreshing = false
    }
  }
}

async function loadRoomById(
  roomId: string,
  openOnMobile = true
): Promise<void> {
  const requestId = ++detailFetchSequence
  state.selectedRoomId = roomId
  state.detailLoading = true
  state.detailError = ''
  if (isCompact.value && openOnMobile) state.mobileDetailOpen = true

  try {
    let loadedRoom: LobbyRoom
    try {
      const { data: response } = await apiClient.get<ApiResponse<LobbyRoom>>(
        `/v2/rooms/${encodeURIComponent(roomId)}`
      )
      if (!response.data) throw new Error(response.message || '房间详情为空')
      loadedRoom = response.data
    } catch (error) {
      const status = getHttpStatus(error)
      if (status !== 404 && status !== 405) throw error
      const legacyResponse = await GameApi.getRoom(roomId)
      if (
        legacyResponse.status < 200 ||
        legacyResponse.status >= 300 ||
        !legacyResponse.data
      ) {
        throw new Error(legacyResponse.message || '房间详情为空')
      }
      const legacyRoom = normalizeLegacyRoom(legacyResponse.data)
      if (!legacyRoom) throw new Error('房间详情格式无效')
      loadedRoom = legacyRoom
      if (requestId === detailFetchSequence) state.v2Supported = false
    }
    if (requestId !== detailFetchSequence) return
    state.selectedRoom = loadedRoom
    if (isCompact.value && openOnMobile) await focusDetailCloseButton()
  } catch (error) {
    if (requestId !== detailFetchSequence) return
    state.selectedRoom = null
    state.detailError =
      getHttpStatus(error) === 404
        ? `房间 ${roomId} 不存在或已经关闭。`
        : getErrorMessage(error, '房间详情加载失败，请稍后重试。')
  } finally {
    if (requestId === detailFetchSequence) state.detailLoading = false
  }
}

async function selectRoom(
  room: LobbyRoom,
  trigger: HTMLElement | null = null,
  openOnMobile = true
): Promise<void> {
  detailTrigger = trigger
  state.selectedRoomId = room.roomId
  state.selectedRoom = room
  state.detailError = ''
  if (isCompact.value && openOnMobile) state.mobileDetailOpen = true

  if (state.v2Supported) {
    await loadRoomById(room.roomId, openOnMobile)
  } else if (isCompact.value && openOnMobile) {
    await focusDetailCloseButton()
  }
}

function onDetailClick(room: LobbyRoom, event: Event): void {
  const trigger =
    event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  void selectRoom(room, trigger, true)
}

async function focusDetailCloseButton(): Promise<void> {
  await nextTick()
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      const target =
        detailPanel.value?.querySelector<HTMLButtonElement>('.detail-close') ??
        detailCloseButton.value ??
        detailPanel.value
      target?.focus()
      resolve()
    })
  })
}

function detailFocusableElements(): HTMLElement[] {
  if (!detailPanel.value) return []

  return Array.from(
    detailPanel.value.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
    )
  ).filter(
    (element) =>
      element.getAttribute('aria-hidden') !== 'true' &&
      !element.hasAttribute('hidden')
  )
}

function handleDetailKeydown(event: KeyboardEvent): void {
  if (!isCompact.value || !state.mobileDetailOpen) return

  if (event.key === 'Escape') {
    event.preventDefault()
    closeDetail()
    return
  }

  if (event.key !== 'Tab') return

  const elements = detailFocusableElements()
  if (elements.length === 0) {
    event.preventDefault()
    detailPanel.value?.focus()
    return
  }

  const first = elements[0]
  const last = elements[elements.length - 1]
  const active = document.activeElement

  if (
    event.shiftKey &&
    (active === first || !detailPanel.value?.contains(active))
  ) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

function closeDetail(restoreFocus = true): void {
  detailFetchSequence += 1
  state.detailLoading = false
  state.mobileDetailOpen = false
  if (!isCompact.value) {
    state.selectedRoomId = ''
    state.selectedRoom = null
    state.detailError = ''
  }
  if (restoreFocus && detailTrigger) {
    nextTick(() => detailTrigger?.focus())
  }
}

function retryDetail(): void {
  if (state.selectedRoomId) void loadRoomById(state.selectedRoomId, true)
}

async function requestRoomPassword(isRetry: boolean): Promise<string | null> {
  try {
    const result = await inputDialog.show({
      mode: 'input',
      title: isRetry ? '密码不正确，请重新输入' : '请输入房间密码',
      placeholders: [''],
      inputTypes: ['password'],
      allowEmpty: false,
    })
    if (!Array.isArray(result) || typeof result[0] !== 'string') return null
    return result[0].trim() || null
  } catch {
    return null
  }
}

async function joinRoom(room: LobbyRoom, password?: string): Promise<void> {
  if (state.joiningRoomId) return
  state.joiningRoomId = room.roomId
  state.actionMessage = ''
  state.requiresLogin = false

  try {
    const response = await GameApi.joinRoom(room.roomId, { password })
    if (response.status >= 200 && response.status < 300 && response.data) {
      await router.push({
        path: `/game/${room.roomId}`,
        state: { ...response.data },
      })
      return
    }
    state.actionMessage = response.message || '加入房间失败，请重试。'
  } catch (error) {
    const failure = getRoomJoinFailure(error)
    const shouldAskForPassword = shouldPromptForRoomPassword(failure, {
      isPrivate: room.isPrivate,
      hasAuthToken: Boolean(AuthHelper.token),
      hasSuppliedPassword: Boolean(password),
    })

    if (shouldAskForPassword) {
      state.joiningRoomId = ''
      const nextPassword = await requestRoomPassword(
        failure.errorCode === 'ERR::WRONG_PASSWORD' || Boolean(password)
      )
      if (nextPassword) await joinRoom(room, nextPassword)
      return
    }

    state.requiresLogin = isAuthenticationFailure(failure)
    state.actionMessage = state.requiresLogin
      ? '登录状态已失效，请重新登录后加入房间。'
      : getErrorMessage(error, '加入房间失败，请稍后重试。')
  } finally {
    if (state.joiningRoomId === room.roomId) state.joiningRoomId = ''
  }
}

async function onRoomCreated(
  createdRoom: CreateRoomData & { password?: string }
): Promise<void> {
  const roomId = createdRoom.roomId
  if (filterTimer !== null) window.clearTimeout(filterTimer)
  state.search = roomId
  state.difficulty = ''
  state.level = ''
  state.currentPage = 1
  state.actionMessage = `房间 ${roomId} 已创建，正在连接。`
  const directRoom: LobbyRoom = {
    roomId,
    name: roomId,
    tags: [],
    host: null,
    gameScript: null,
    level: 'prepare',
    levelDays: 0,
    playerCount: 0,
    onlineCount: 0,
    maxPlayer: 0,
    maxOnline: createdRoom.maxOnline,
    isPrivate: createdRoom.isPrivate,
    isVip: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    gameStartedAt: null,
    snapshotUpdatedAt: null,
  }

  if (createdRoom.roomId && createdRoom.maxOnline >= 0) {
    await joinRoom(directRoom, createdRoom.password)
    void fetchRooms({ background: true })
    return
  }

  await fetchRooms()

  const room = state.rooms.find((item) => item.roomId === roomId)
  if (room) {
    await selectRoom(room, null, false)
    await joinRoom(room)
  } else {
    state.actionMessage = `房间 ${roomId} 已创建，可使用房间号重新搜索。`
  }
}

async function changePage(page: number): Promise<void> {
  if (
    page < 1 ||
    page > state.totalPages ||
    page === state.currentPage ||
    state.refreshing
  )
    return
  state.currentPage = page
  state.selectedRoomId = ''
  state.selectedRoom = null
  state.mobileDetailOpen = false
  await fetchRooms()
}

function clearFilters(): void {
  state.search = ''
  state.difficulty = ''
  state.level = ''
}

function goHome(): void {
  void router.push({ name: 'Index' })
}

function loginAgain(): void {
  AuthHelper.doLogin(route.fullPath)
}

function dismissActionMessage(): void {
  state.actionMessage = ''
  state.requiresLogin = false
}

function refreshNow(): void {
  void fetchRooms({ background: state.rooms.length > 0 })
}

function getDifficulty(room: LobbyRoom): string {
  return (
    room.tags.find((tag) => tag.tag.toLowerCase() === 'difficulty')?.detail ||
    ''
  )
}

function getDifficultyLabel(room: LobbyRoom): string {
  const value = getDifficulty(room).toLowerCase()
  const labels: Record<string, string> = {
    beginner: '新手',
    intermediate: '进阶',
    veteran: '老手',
  }
  return labels[value] || getDifficulty(room) || '未标注'
}

function formatLevel(level: string, days: number): string {
  switch (level.toLowerCase()) {
    case 'prepare':
      return '等待开局'
    case 'drawing':
      return '分配角色'
    case 'day':
      return days > 0 ? `第 ${days} 天 · 白昼` : '白昼'
    case 'night':
      return days > 0 ? `第 ${days} 夜` : '夜晚'
    case 'end':
    case 'finished':
      return '已结束'
    default:
      return level || '等待开局'
  }
}

function levelClass(level: string): string {
  const normalized = level.toLowerCase()
  return ['prepare', 'drawing', 'day', 'night'].includes(normalized)
    ? `level-${normalized}`
    : 'level-other'
}

function formatTimestamp(value: number | null): string {
  if (!value) return '尚未开始'
  const milliseconds = value > 1_000_000_000_000 ? value : value * 1000
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(milliseconds))
}

function formatCapacity(current: number, maximum: number): string {
  return maximum > 0 ? `${current} / ${maximum}` : `${current} / 待定`
}

function formatOnlineCapacity(room: LobbyRoom): string {
  return room.maxOnline > 0
    ? `${room.onlineCount} / ${room.maxOnline}`
    : `${room.onlineCount} / 不限`
}

function scheduleFilteredFetch(): void {
  if (!filtersReady) return
  if (filterTimer !== null) window.clearTimeout(filterTimer)
  state.currentPage = 1
  state.selectedRoomId = ''
  state.selectedRoom = null
  state.mobileDetailOpen = false
  filterTimer = window.setTimeout(() => {
    void fetchRooms()
  }, 320)
}

function syncCompactMode(event?: MediaQueryListEvent): void {
  isCompact.value = event?.matches ?? compactMediaQuery?.matches ?? false
  if (!isCompact.value) state.mobileDetailOpen = false
}

function handleVisibilityRefresh(): void {
  if (document.visibilityState === 'visible' && state.lastUpdatedAt > 0) {
    void fetchRooms({ background: true })
  }
}

watch(
  [() => state.search, () => state.difficulty, () => state.level],
  scheduleFilteredFetch
)

onMounted(async () => {
  compactMediaQuery = window.matchMedia('(max-width: 1279px)')
  syncCompactMode()
  compactMediaQuery.addEventListener('change', syncCompactMode)
  document.addEventListener('visibilitychange', handleVisibilityRefresh)

  await fetchRooms()
  filtersReady = true
  refreshTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible')
      void fetchRooms({ background: true })
  }, REFRESH_INTERVAL_MS)
})

onBeforeUnmount(() => {
  fetchSequence += 1
  detailFetchSequence += 1
  if (refreshTimer !== null) window.clearInterval(refreshTimer)
  if (filterTimer !== null) window.clearTimeout(filterTimer)
  compactMediaQuery?.removeEventListener('change', syncCompactMode)
  document.removeEventListener('visibilitychange', handleVisibilityRefresh)
})
</script>

<template>
  <div class="lobby-page">
    <CreateRoomModal
      v-model:visible="state.showCreateModal"
      @created="onRoomCreated"
    />

    <InputModal
      :visible="inputDialog.visible.value"
      :mode="inputDialog.mode.value"
      :titles="inputDialog.titles.value"
      :placeholders="inputDialog.placeholders.value"
      :input-types="inputDialog.inputTypes.value"
      :allow-empty="inputDialog.allowEmpty.value"
      :validate="inputDialog.validate.value"
      @confirm="inputDialog.resolve"
      @cancel="inputDialog.reject"
    />

    <section
      class="lobby-shell leather-surface leather-surface--tooled"
      aria-labelledby="lobby-title"
    >
      <header class="lobby-header">
        <div class="lobby-heading">
          <button type="button" class="text-button back-link" @click="goHome">
            返回主页
          </button>
          <p class="eyebrow">Ravenswood Hall</p>
          <h1 id="lobby-title">钟楼议事厅</h1>
        </div>

        <div class="lobby-summary" aria-label="大厅概况">
          <div>
            <strong>{{ state.total }}</strong>
            <span>可加入房间</span>
          </div>
          <div>
            <strong>{{ totalOnline }}</strong>
            <span>本页在线</span>
          </div>
          <button
            type="button"
            class="lobby-button primary create-button"
            :disabled="state.showCreateModal"
            @click="state.showCreateModal = true"
          >
            创建房间
          </button>
        </div>
      </header>

      <section class="lobby-toolbar" aria-label="搜索与筛选">
        <label class="search-field">
          <span class="visually-hidden">搜索房间、房主或剧本</span>
          <span class="search-mark" aria-hidden="true"></span>
          <input
            v-model="state.search"
            type="search"
            maxlength="120"
            autocomplete="off"
            placeholder="搜索房间号、房名、房主或剧本"
          />
        </label>

        <label class="filter-field">
          <span>难度</span>
          <select v-model="state.difficulty">
            <option value="">全部难度</option>
            <option value="Beginner">新手</option>
            <option value="Intermediate">进阶</option>
            <option value="Veteran">老手</option>
          </select>
        </label>

        <label class="filter-field">
          <span>阶段</span>
          <select v-model="state.level">
            <option value="">全部阶段</option>
            <option value="prepare">等待开局</option>
            <option value="drawing">分配角色</option>
            <option value="day">白昼</option>
            <option value="night">夜晚</option>
          </select>
        </label>

        <button
          v-if="hasFilters"
          type="button"
          class="lobby-button ghost"
          @click="clearFilters"
        >
          清除筛选
        </button>
        <button
          type="button"
          class="lobby-button secondary refresh-button"
          :disabled="state.initialLoading || state.refreshing"
          @click="refreshNow"
        >
          {{ state.refreshing ? '刷新中' : '刷新' }}
        </button>
      </section>

      <div
        class="status-announcer"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {{ liveStatus }}
      </div>

      <div
        v-if="state.actionMessage"
        class="action-banner"
        role="status"
        aria-live="polite"
      >
        <span>{{ state.actionMessage }}</span>
        <div class="action-banner__actions">
          <button
            v-if="state.requiresLogin"
            type="button"
            class="text-button"
            @click="loginAgain"
          >
            重新登录
          </button>
          <button
            type="button"
            class="text-button"
            aria-label="关闭提示"
            @click="dismissActionMessage"
          >
            关闭
          </button>
        </div>
      </div>

      <div v-if="state.stale" class="stale-banner" role="status">
        <span>{{ state.refreshError }}</span>
        <button type="button" class="text-button" @click="refreshNow">
          再次刷新
        </button>
      </div>

      <div class="lobby-grid book-gutter">
        <section
          class="room-results ledger-surface"
          aria-labelledby="room-results-title"
          :aria-busy="state.initialLoading || state.refreshing"
        >
          <div class="results-heading">
            <div>
              <h2 id="room-results-title" class="etched-heading">房间名册</h2>
              <p v-if="state.lastUpdatedAt">
                更新于 {{ formatTimestamp(state.lastUpdatedAt) }}
              </p>
            </div>
            <span v-if="state.v2Supported === false" class="compatibility-badge"
              >兼容模式</span
            >
          </div>

          <div
            v-if="state.initialLoading && state.rooms.length === 0"
            class="skeleton-list"
            aria-label="正在加载房间"
          >
            <div
              v-for="index in 6"
              :key="index"
              class="skeleton-row"
              aria-hidden="true"
            >
              <span></span><span></span><span></span><span></span>
            </div>
          </div>

          <div
            v-else-if="state.error && state.rooms.length === 0"
            class="state-panel error-panel"
            role="alert"
          >
            <span class="state-emblem" aria-hidden="true">!</span>
            <h3>名册暂时无法展开</h3>
            <p>{{ state.error }}</p>
            <div class="state-actions">
              <button
                v-if="state.requiresLogin"
                type="button"
                class="lobby-button primary"
                @click="loginAgain"
              >
                重新登录
              </button>
              <button
                type="button"
                class="lobby-button secondary"
                @click="refreshNow"
              >
                重试
              </button>
            </div>
          </div>

          <div
            v-else-if="state.rooms.length === 0"
            class="state-panel empty-panel"
          >
            <span class="wax-seal state-emblem--wax" aria-hidden="true"></span>
            <h3>{{ hasFilters ? '没有符合条件的房间' : '今夜尚无人开局' }}</h3>
            <p>
              {{
                hasFilters
                  ? '调整关键词或筛选条件后再试。'
                  : '创建第一间房，邀请玩家围坐钟楼之下。'
              }}
            </p>
            <div class="state-actions">
              <button
                v-if="hasFilters"
                type="button"
                class="lobby-button secondary"
                @click="clearFilters"
              >
                清除筛选
              </button>
              <button
                type="button"
                class="lobby-button primary"
                @click="state.showCreateModal = true"
              >
                创建房间
              </button>
            </div>
          </div>

          <div
            v-else
            class="room-table"
            role="table"
            aria-label="可加入的游戏房间"
          >
            <div class="room-row table-header etched-heading" role="row">
              <span role="columnheader">房间</span>
              <span role="columnheader">剧本</span>
              <span role="columnheader">房主</span>
              <span role="columnheader">人数</span>
              <span role="columnheader">阶段</span>
              <span role="columnheader">操作</span>
            </div>

            <article
              v-for="room in state.rooms"
              :key="room.roomId"
              class="room-row room-card"
              :class="{ selected: state.selectedRoomId === room.roomId }"
              role="row"
              :aria-selected="state.selectedRoomId === room.roomId"
            >
              <div
                class="room-cell room-identity"
                role="cell"
                data-label="房间"
              >
                <div class="room-title-line">
                  <strong>{{ room.name }}</strong>
                  <span v-if="room.isPrivate" class="room-badge private"
                    >密码房</span
                  >
                  <span v-if="room.isVip" class="room-badge vip">贵宾</span>
                </div>
                <span class="room-code">{{ room.roomId }}</span>
                <span class="difficulty-mark">{{
                  getDifficultyLabel(room)
                }}</span>
              </div>

              <div class="room-cell entity-cell" role="cell" data-label="剧本">
                <img
                  v-if="room.gameScript?.iconUrl"
                  :src="room.gameScript.iconUrl"
                  alt=""
                  width="36"
                  height="36"
                  loading="lazy"
                />
                <span>
                  <strong>{{ room.gameScript?.name || '尚未选择剧本' }}</strong>
                  <small>{{
                    room.gameScript?.authorName || '等待房主设置'
                  }}</small>
                </span>
              </div>

              <div class="room-cell entity-cell" role="cell" data-label="房主">
                <img
                  v-if="room.host?.avatarUrl"
                  :src="room.host.avatarUrl"
                  alt=""
                  width="36"
                  height="36"
                  loading="lazy"
                />
                <span class="avatar-fallback" v-else aria-hidden="true">
                  {{ room.host?.displayName?.slice(0, 1) || '?' }}
                </span>
                <span>
                  <strong>{{ room.host?.displayName || '未知房主' }}</strong>
                  <small v-if="room.host?.isCertifiedStoryteller"
                    >认证说书人</small
                  >
                </span>
              </div>

              <div
                class="room-cell population-cell"
                role="cell"
                data-label="人数"
              >
                <strong>{{
                  formatCapacity(room.playerCount, room.maxPlayer)
                }}</strong>
                <small>{{ room.onlineCount }} 人在线</small>
              </div>

              <div class="room-cell" role="cell" data-label="阶段">
                <span class="level-badge" :class="levelClass(room.level)">
                  {{ formatLevel(room.level, room.levelDays) }}
                </span>
              </div>

              <div class="room-cell row-actions" role="cell" data-label="操作">
                <button
                  type="button"
                  class="lobby-button ghost"
                  :aria-label="`查看 ${room.name} 的详情`"
                  @click="onDetailClick(room, $event)"
                >
                  详情
                </button>
                <button
                  type="button"
                  class="lobby-button primary"
                  :disabled="Boolean(state.joiningRoomId)"
                  @click="joinRoom(room)"
                >
                  {{ state.joiningRoomId === room.roomId ? '连接中' : '加入' }}
                </button>
              </div>
            </article>
          </div>

          <nav
            v-if="state.totalPages > 1"
            class="pagination"
            aria-label="房间列表分页"
          >
            <button
              type="button"
              class="lobby-button secondary"
              :disabled="state.currentPage <= 1 || state.refreshing"
              @click="changePage(state.currentPage - 1)"
            >
              上一页
            </button>
            <span aria-live="polite"
              >第 {{ state.currentPage }} / {{ state.totalPages }} 页</span
            >
            <button
              type="button"
              class="lobby-button secondary"
              :disabled="
                state.currentPage >= state.totalPages || state.refreshing
              "
              @click="changePage(state.currentPage + 1)"
            >
              下一页
            </button>
          </nav>
        </section>

        <button
          v-if="state.mobileDetailOpen"
          type="button"
          class="detail-backdrop"
          aria-label="关闭房间详情"
          @click="closeDetail()"
        ></button>

        <aside
          ref="detailPanel"
          class="room-detail-panel"
          :class="{ 'is-mobile-open': state.mobileDetailOpen }"
          :role="isCompact ? 'dialog' : undefined"
          :aria-modal="isCompact && state.mobileDetailOpen ? 'true' : undefined"
          :aria-hidden="
            isCompact && !state.mobileDetailOpen ? 'true' : undefined
          "
          aria-labelledby="room-detail-dialog-title"
          tabindex="-1"
          @keydown="handleDetailKeydown"
        >
          <h2 id="room-detail-dialog-title" class="visually-hidden">
            房间详情
          </h2>
          <!-- Ribbon marking the page you have turned to. Re-keyed on the
               selection so it drops in again each time the leaf changes. -->
          <span
            v-if="state.selectedRoomId"
            :key="state.selectedRoomId"
            class="detail-bookmark"
            aria-hidden="true"
          ></span>
          <template v-if="state.detailLoading">
            <div class="detail-topline">
              <p class="eyebrow">Room Ledger</p>
              <button
                ref="detailCloseButton"
                type="button"
                class="detail-close"
                aria-label="关闭房间详情"
                @click="closeDetail()"
              >
                ×
              </button>
            </div>
            <div
              class="detail-skeleton"
              role="status"
              aria-live="polite"
              aria-busy="true"
              aria-label="正在加载房间详情"
            >
              <span></span><span></span><span></span><span></span>
            </div>
          </template>

          <div v-else-if="state.detailError" class="detail-state" role="alert">
            <div class="detail-topline">
              <p class="eyebrow">Room Ledger</p>
              <button
                ref="detailCloseButton"
                type="button"
                class="detail-close"
                aria-label="关闭房间详情"
                @click="closeDetail()"
              >
                ×
              </button>
            </div>
            <h2 id="room-detail-title">详情未能送达</h2>
            <p>{{ state.detailError }}</p>
            <button type="button" class="parchment-button" @click="retryDetail">
              重新加载
            </button>
          </div>

          <template v-else-if="state.selectedRoom">
            <div class="detail-topline">
              <p class="eyebrow">Room Ledger</p>
              <button
                ref="detailCloseButton"
                type="button"
                class="detail-close"
                aria-label="关闭房间详情"
                @click="closeDetail()"
              >
                ×
              </button>
            </div>

            <div
              :key="state.selectedRoom.roomId"
              class="detail-title-block"
            >
              <img
                v-if="state.selectedRoom.gameScript?.iconUrl"
                :src="state.selectedRoom.gameScript.iconUrl"
                alt=""
                width="58"
                height="58"
              />
              <div>
                <h2 id="room-detail-title">{{ state.selectedRoom.name }}</h2>
                <p>房间号 {{ state.selectedRoom.roomId }}</p>
              </div>
            </div>

            <div class="detail-badges">
              <span class="ink-badge">{{ selectedDifficulty }}</span>
              <span class="ink-badge">{{
                formatLevel(
                  state.selectedRoom.level,
                  state.selectedRoom.levelDays
                )
              }}</span>
              <span v-if="state.selectedRoom.isPrivate" class="ink-badge wax"
                >需要密码</span
              >
            </div>

            <dl class="room-facts">
              <div>
                <dt>说书人</dt>
                <dd>{{ state.selectedRoom.host?.displayName || '未知' }}</dd>
              </div>
              <div>
                <dt>剧本</dt>
                <dd>{{ state.selectedRoom.gameScript?.name || '尚未选择' }}</dd>
              </div>
              <div>
                <dt>剧本作者</dt>
                <dd>
                  {{ state.selectedRoom.gameScript?.authorName || '未标注' }}
                </dd>
              </div>
              <div>
                <dt>入座玩家</dt>
                <dd>
                  {{
                    formatCapacity(
                      state.selectedRoom.playerCount,
                      state.selectedRoom.maxPlayer
                    )
                  }}
                </dd>
              </div>
              <div>
                <dt>在线人数</dt>
                <dd>{{ formatOnlineCapacity(state.selectedRoom) }}</dd>
              </div>
              <div>
                <dt>创建时间</dt>
                <dd>{{ formatTimestamp(state.selectedRoom.createdAt) }}</dd>
              </div>
              <div>
                <dt>开局时间</dt>
                <dd>{{ formatTimestamp(state.selectedRoom.gameStartedAt) }}</dd>
              </div>
            </dl>

            <div v-if="state.selectedRoom.tags.length" class="tag-section">
              <h3>房间标签</h3>
              <div class="tag-list">
                <span
                  v-for="tag in state.selectedRoom.tags"
                  :key="`${tag.tag}-${tag.detail || ''}`"
                >
                  {{ tag.detail || tag.tag }}
                </span>
              </div>
            </div>

            <button
              type="button"
              class="parchment-button primary"
              :disabled="Boolean(state.joiningRoomId)"
              @click="joinRoom(state.selectedRoom)"
            >
              {{
                state.joiningRoomId === state.selectedRoom.roomId
                  ? '正在连接房间'
                  : '加入这间房'
              }}
            </button>
          </template>

          <div v-else class="detail-empty">
            <p class="eyebrow">Room Ledger</p>
            <span class="wax-seal detail-seal" aria-hidden="true"></span>
            <h2 id="room-detail-title">选择一间房</h2>
            <p>查看剧本、说书人、人数与开局状态。</p>
          </div>
        </aside>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
@use '../vars.scss' as *;

.lobby-page {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  padding: clamp(16px, 3vw, 36px);
  overflow-y: auto;
  color: var(--ts-text-primary, #f4ebdd);
}

/* The lobby is a ledger bound in leather: this shell is the cover, and the two
   columns of .lobby-grid are the spread-open pages inside it. Cover material and
   blind-tooled border both come from .leather-surface / --tooled, so only the
   geometry is local. */
.lobby-shell {
  width: min(1440px, 100%);
  min-height: min(860px, calc(100dvh - 72px));
  margin: 0 auto;
  overflow: hidden;
}

.lobby-header,
.lobby-toolbar,
.lobby-grid,
.stale-banner,
.action-banner,
.status-announcer {
  position: relative;
  z-index: 1;
}

.lobby-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 32px;
  padding: clamp(24px, 3.4vw, 42px);
  padding-bottom: 24px;
  background:
    radial-gradient(circle at 78% 0%, rgba(142, 47, 54, 0.16), transparent 33%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent);
  border-bottom: 1px solid var(--ts-border-subtle, rgba(214, 184, 106, 0.22));
}

.lobby-heading h1 {
  margin-top: 5px;
  color: var(--ts-accent-gold, #d6b86a);
  font-size: clamp(2rem, 4vw, 3.4rem);
  letter-spacing: 0.03em;
  text-shadow: 0 3px 18px rgba(0, 0, 0, 0.58);
}

.eyebrow {
  margin: 0;
  color: var(--ts-accent-gold, #d6b86a);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.back-link {
  margin-bottom: 14px;
}

.lobby-summary {
  display: flex;
  align-items: stretch;
  gap: 12px;
}

.lobby-summary > div {
  display: flex;
  min-width: 104px;
  min-height: 64px;
  flex-direction: column;
  justify-content: center;
  padding: 9px 16px;
  background: rgba(24, 14, 11, 0.5);
  border: 1px solid rgba(214, 184, 106, 0.18);
  border-radius: var(--ts-radius-md, 10px);
}

.lobby-summary strong {
  color: var(--ts-accent-gold, #d6b86a);
  font-family: var(--ts-font-heading, serif);
  font-size: 1.42rem;
  line-height: 1;
}

.lobby-summary span {
  margin-top: 6px;
  color: var(--ts-text-subtle, #9d907f);
  font-size: 0.76rem;
}

.lobby-toolbar {
  display: grid;
  grid-template-columns:
    minmax(260px, 1fr) minmax(136px, auto) minmax(136px, auto)
    auto auto;
  gap: 12px;
  align-items: end;
  padding: 16px clamp(20px, 3vw, 36px);
  background: rgba(22, 13, 10, 0.46);
  border-bottom: 1px solid rgba(214, 184, 106, 0.14);
}

.search-field {
  position: relative;
}

.search-mark {
  position: absolute;
  top: 50%;
  left: 16px;
  width: 14px;
  height: 14px;
  border: 2px solid var(--ts-text-subtle, #9d907f);
  border-radius: 50%;
  transform: translateY(-58%);
  pointer-events: none;
}

.search-mark::after {
  position: absolute;
  right: -6px;
  bottom: -4px;
  width: 7px;
  height: 2px;
  background: var(--ts-text-subtle, #9d907f);
  transform: rotate(45deg);
  content: '';
}

.search-field input,
.filter-field select {
  width: 100%;
  min-height: 46px;
  color: var(--ts-text-primary, #f4ebdd);
  background: rgba(20, 12, 9, 0.62);
  border: 1px solid rgba(214, 184, 106, 0.28);
  border-radius: var(--ts-radius-md, 10px);
}

.search-field input {
  padding: 10px 16px 10px 44px;
}

.search-field input::placeholder {
  color: var(--ts-text-subtle, #9d907f);
}

.filter-field {
  display: grid;
  gap: 5px;
}

.filter-field > span {
  color: var(--ts-text-subtle, #9d907f);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.filter-field select {
  padding: 8px 36px 8px 12px;
}

.lobby-button,
.parchment-button,
.text-button,
.detail-close {
  min-width: 44px;
  min-height: 44px;
  cursor: pointer;
}

/* The default lobby button sits on the leather header, so it is cut from the
   same hide: warm brown with a brass rim. The old violet fill was inherited
   from the dusk palette and read as foreign once the shell turned to leather. */
.lobby-button {
  padding: 9px 16px;
  color: var(--ts-text-primary, #f4ebdd);
  background:
    linear-gradient(180deg, rgba(255, 240, 214, 0.09), transparent 38%),
    linear-gradient(180deg, #3b2a22, #1e1512);
  border: 1px solid rgba(214, 184, 106, 0.34);
  border-radius: var(--ts-radius-md, 10px);
  box-shadow:
    0 5px 14px rgba(0, 0, 0, 0.24),
    inset 0 1px rgba(255, 255, 255, 0.05);
  font-weight: 700;
  transition:
    border-color var(--ts-motion-fast, 160ms) ease,
    box-shadow var(--ts-motion-fast, 160ms) ease,
    transform var(--ts-motion-fast, 160ms) var(--ts-ease-out, ease-out);
}

.lobby-button:hover:not(:disabled) {
  border-color: var(--ts-accent-gold, #d6b86a);
  box-shadow:
    0 8px 20px rgba(0, 0, 0, 0.32),
    0 0 16px rgba(247, 208, 120, 0.16),
    0 0 0 1px rgba(214, 184, 106, 0.14);
  transform: translateY(-1px);
}

.lobby-button:active:not(:disabled) {
  transform: translateY(1px);
}

.lobby-button.primary {
  color: #24170f;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.14), transparent 34%),
    linear-gradient(180deg, #e3c978, #b99442);
  border-color: var(--ts-focus-ring, #f0d990);
  text-shadow: 0 1px 0 rgba(255, 246, 214, 0.3);
}

.lobby-button.ghost {
  background: rgba(24, 16, 13, 0.3);
}

.lobby-button:disabled,
.parchment-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.text-button {
  padding: 7px 2px;
  color: var(--ts-accent-gold, #d6b86a);
  background: transparent;
  font-weight: 700;
  text-decoration: underline;
  text-underline-offset: 4px;
}

.status-announcer {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}

.stale-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 9px 28px;
  color: var(--ts-text-on-parchment, #2a1b18);
  background: #e7c77f;
  font-size: 0.88rem;
}

.action-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px clamp(20px, 3vw, 36px);
  color: #f8e7dd;
  background: rgba(112, 35, 42, 0.88);
  border-bottom: 1px solid rgba(225, 144, 151, 0.3);
  font-size: 0.88rem;
}

.action-banner__actions {
  display: flex;
  flex: 0 0 auto;
  gap: 12px;
}

.action-banner .text-button {
  color: #ffe2ae;
}

.stale-banner .text-button {
  color: #5b241f;
}

/* The spread. Inset from the cover on three sides so a band of leather still
   frames the pages, and the shared .book-gutter draws the fold between them. */
.lobby-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 370px);
  min-height: 580px;
  margin: 0 12px 12px;
  overflow: hidden;
  border-radius: 0 0 10px 10px;
}

/* Both leaves are positioned, so the fold needs lifting above them; and the
   right column resolves to its 370px maximum at every width where this grid is
   still two columns, which is what puts the crease on the column boundary. */
.lobby-grid.book-gutter::before {
  left: calc(100% - 370px);
  z-index: 2;
}

.room-results {
  /* Half a row: the ruling reads as ledger paper the entries are written on. */
  --ts-ledger-pitch: 43px;

  min-width: 0;
  padding: 20px clamp(18px, 2.4vw, 30px) 24px;
  box-shadow:
    inset -20px 0 26px -20px rgba(70, 40, 18, 0.3),
    inset 0 14px 22px -14px rgba(255, 246, 222, 0.55);
}

.results-heading {
  display: flex;
  min-height: 54px;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.results-heading h2 {
  display: inline-block;
  color: var(--ts-ink, #3a2a20);
  font-family: var(--ts-font-heading, serif);
  font-size: 1.25rem;
}

.results-heading p {
  margin: 5px 0 0;
  color: #665044;
  font-size: 0.76rem;
}

.compatibility-badge,
.room-badge,
.difficulty-mark,
.level-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 800;
  white-space: nowrap;
}

/* Gold on parchment lands around 1.5:1, so every chop on the page is stamped in
   sealing-wax crimson instead. */
.compatibility-badge {
  color: #fff2e6;
  background: var(--ts-wax-crimson, #7c2229);
  border: 1px solid #5f181e;
  box-shadow: inset 0 1px rgba(255, 200, 190, 0.28);
}

/* No frame around the register: it is written straight onto the ruled page, so
   only the opening and closing rules are drawn. */
.room-table {
  border-top: 1px solid rgba(90, 62, 38, 0.34);
  border-bottom: 1px solid rgba(90, 62, 38, 0.34);
}

.room-row {
  display: grid;
  grid-template-columns:
    minmax(175px, 1.45fr) minmax(145px, 1.2fr) minmax(130px, 1.08fr)
    90px minmax(110px, 0.9fr) 154px;
  gap: 12px;
  align-items: center;
  padding: 12px 14px;
}

/* Column headings written on a strip of older, darker paper; .etched-heading
   supplies the pressed ink rule under them in place of a border. */
.table-header {
  min-height: 44px;
  color: var(--ts-ink, #3a2a20);
  background-color: var(--ts-surface-parchment-aged, #d7c29c);
  background-image: linear-gradient(
    180deg,
    rgba(255, 250, 232, 0.5),
    rgba(190, 166, 126, 0.3)
  );
  font-family: var(--ts-font-heading, serif);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.05em;
}

.room-card {
  position: relative;
  min-height: 86px;
  overflow: hidden;
  border-bottom: 1px solid rgba(90, 62, 38, 0.26);
  transition:
    background-color var(--ts-motion-fast, 160ms) ease,
    box-shadow var(--ts-motion-fast, 160ms) ease,
    transform var(--ts-motion-fast, 160ms) var(--ts-ease-out, ease-out);
}

.room-card:last-child {
  border-bottom: 0;
}

.room-card:hover,
.room-card.selected {
  background-color: rgba(255, 247, 224, 0.5);
}

/* Candlelight passing over the entry under the cursor. Starts and ends
   transparent, so reduced-motion simply never shows it. */
@media (hover: hover) {
  .room-card::after {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    /* Full-width so the keyframe's translate carries the band clear of the row;
       the band itself is the narrow bright stripe inside the gradient. */
    width: 100%;
    background-image: linear-gradient(
      100deg,
      transparent 32%,
      rgba(255, 240, 198, 0.62) 50%,
      transparent 68%
    );
    opacity: 0;
    pointer-events: none;
    content: '';
  }

  .room-card:hover::after {
    animation: ts-candle-sweep 260ms var(--ts-ease-out, ease-out);
  }

  .room-card:hover {
    box-shadow: 0 6px 16px rgba(70, 40, 18, 0.18);
    transform: translateY(-1px);
  }
}

.room-card.selected {
  box-shadow: inset 3px 0 var(--ts-wax-crimson, #7c2229);
}

.room-cell {
  min-width: 0;
}

.room-title-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.room-title-line strong,
.entity-cell strong,
.population-cell strong {
  overflow: hidden;
  color: var(--ts-text-on-parchment, #2a1b18);
  font-size: 0.9rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Marginalia weight, but still 0.7rem type on paper — hence .86 alpha rather
   than the lighter --ts-ink-faded, which only reaches 3.35:1 here. */
.room-code {
  display: block;
  margin-top: 5px;
  color: rgba(58, 42, 32, 0.86);
  /* Deliberately monospace, not a --ts-font-* stack: room codes are transcribed
     by hand between devices, and fixed-width glyphs keep 0/O and 1/l apart. */
  font-family: ui-monospace, 'Cascadia Code', monospace;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
}

.room-badge.private {
  color: #fff2e6;
  background: var(--ts-wax-crimson, #7c2229);
  border: 1px solid #5f181e;
}

.room-badge.vip {
  color: var(--ts-text-on-parchment, #2a1b18);
  background: var(--ts-accent-gold, #d6b86a);
  border: 1px solid var(--ts-accent-gold-deep, #a9863f);
}

.difficulty-mark {
  margin-top: 7px;
  color: rgba(58, 42, 32, 0.86);
  background: rgba(255, 252, 242, 0.52);
  border: 1px solid rgba(90, 62, 38, 0.3);
}

.entity-cell {
  display: flex;
  align-items: center;
  gap: 9px;
}

.entity-cell img,
.avatar-fallback {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  border: 1px solid rgba(90, 62, 38, 0.34);
  border-radius: 50%;
  object-fit: cover;
}

.entity-cell > span:last-child {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.entity-cell small,
.population-cell small {
  overflow: hidden;
  color: rgba(58, 42, 32, 0.86);
  font-size: 0.7rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.avatar-fallback {
  display: grid;
  place-items: center;
  color: var(--ts-wax-crimson, #7c2229);
  background: rgba(255, 252, 242, 0.55);
  font-family: var(--ts-font-heading, serif);
  font-weight: 800;
}

.population-cell {
  display: grid;
  gap: 4px;
}

/* The unfilled phase chop; .level-day / -night / -drawing overprint it with
   their own already-legible fills. The inset ring is what makes an empty pill
   read as a stamp rather than a gap — a second impression of the ring the nib
   would have left, just inside the border. */
.level-badge {
  color: rgba(58, 42, 32, 0.86);
  background: rgba(255, 252, 242, 0.52);
  border: 1px solid rgba(90, 62, 38, 0.3);
  box-shadow: inset 0 0 0 1px rgba(255, 253, 245, 0.7),
    inset 0 0 0 2px rgba(90, 62, 38, 0.16);
}

/* The overprinted phases already carry their own fill; a pale ring on top of a
   saturated chop just muddies it. */
.level-day,
.level-night,
.level-drawing {
  box-shadow: none;
}

.level-day {
  color: var(--ts-text-on-parchment, #2a1b18);
  background: #d7bb73;
  border-color: #efd99b;
}

.level-night {
  color: #d8dcff;
  background: #34325e;
  border-color: #65639a;
}

.level-drawing {
  color: #e5d5ed;
  background: #573852;
  border-color: #8e6289;
}

.row-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.row-actions .lobby-button {
  min-width: 0;
  padding-inline: 10px;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding-top: 18px;
  color: #665044;
  font-size: 0.82rem;
}

.room-detail-panel {
  position: relative;
  min-width: 0;
  padding: 26px 24px;
  overflow: auto;
  color: var(--ts-text-on-parchment, #2a1b18);
  background:
    radial-gradient(
      ellipse at 50% 8%,
      rgba(255, 238, 205, 0.28),
      transparent 32%
    ),
    radial-gradient(
      ellipse at 15% 88%,
      rgba(145, 87, 52, 0.08),
      transparent 28%
    ),
    linear-gradient(180deg, #f8e8ce, #ebe0c4),
    var(--ts-noise-parchment);
  border-left: 1px solid #a7834e;
  box-shadow:
    inset 12px 0 28px rgba(70, 37, 20, 0.14),
    inset 0 8px 18px rgba(255, 242, 215, 0.3);
}

/* Gold focus rings vanish on paper, so both leaves switch to the crimson one. */
.room-results
  :where(button, a, input, select, textarea, [tabindex]):focus-visible,
.room-detail-panel
  :where(button, a, input, select, textarea, [tabindex]):focus-visible {
  outline-color: var(--ts-focus-ring-on-parchment, #65242c);
}

/* Ribbon bookmark hanging over the top edge of the marked leaf. */
.detail-bookmark {
  position: absolute;
  top: 0;
  right: 34px;
  z-index: 3;
  width: 26px;
  height: 76px;
  background-image: linear-gradient(
    180deg,
    var(--ts-wax-crimson-lit, #a83a3f),
    #5f181e
  );
  /* drop-shadow rather than box-shadow: clip-path would cut a box shadow off
     with the ribbon's notch, but a filter is applied after clipping. */
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%);
  filter: drop-shadow(0 4px 8px rgba(60, 20, 14, 0.38));
  pointer-events: none;
  animation: ts-veil-fall var(--ts-motion-slow, 320ms)
    var(--ts-ease-out, ease-out);
}

.room-detail-panel::before,
.room-detail-panel::after {
  position: absolute;
  right: 22px;
  left: 22px;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(93, 55, 32, 0.52),
    transparent
  );
  content: '';
}

.room-detail-panel::before {
  top: 16px;
}
.room-detail-panel::after {
  bottom: 16px;
}

.detail-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.room-detail-panel .eyebrow {
  color: #7b4a2f;
}

.detail-close {
  display: grid;
  place-items: center;
  color: #5f3527;
  background: transparent;
  border: 1px solid rgba(83, 44, 30, 0.26);
  border-radius: 50%;
  font-size: 1.55rem;
  line-height: 1;
}

/* Re-mounted with the room id, so the freshly turned-to entry blooms in like ink
   taking to paper. */
.detail-title-block {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 20px;
  animation: ts-ink-bleed var(--ts-motion-slow, 320ms)
    var(--ts-ease-out, ease-out);
}

.detail-title-block img {
  width: 58px;
  height: 58px;
  flex: 0 0 auto;
  padding: 4px;
  background: rgba(255, 255, 255, 0.3);
  border: 1px solid rgba(94, 53, 30, 0.36);
  border-radius: 50%;
  object-fit: contain;
}

.detail-title-block h2,
.detail-state h2,
.detail-empty h2 {
  color: #3b241e;
  font-size: 1.55rem;
}

.detail-title-block p,
.detail-state p,
.detail-empty p {
  margin: 5px 0 0;
  color: #765d4d;
}

.detail-badges,
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.detail-badges {
  margin: 18px 0;
}

.ink-badge,
.tag-list span {
  padding: 4px 9px;
  color: #513329;
  background: rgba(255, 255, 255, 0.24);
  border: 1px solid rgba(91, 51, 34, 0.28);
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 700;
}

.ink-badge.wax {
  color: #fff2e6;
  background: var(--ts-wax-crimson, #7c2229);
  border-color: #5f181e;
}

.room-facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  margin: 20px 0;
  border-top: 1px solid rgba(91, 51, 34, 0.22);
  border-left: 1px solid rgba(91, 51, 34, 0.22);
}

.room-facts > div {
  min-width: 0;
  padding: 11px;
  border-right: 1px solid rgba(91, 51, 34, 0.22);
  border-bottom: 1px solid rgba(91, 51, 34, 0.22);
}

.room-facts dt {
  color: #715544;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.05em;
}

.room-facts dd {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
  color: #35211b;
  font-size: 0.86rem;
  font-weight: 700;
}

.tag-section {
  margin: 20px 0;
}

.tag-section h3 {
  margin-bottom: 9px;
  color: #4d3026;
  font-size: 0.9rem;
}

/* One button material for both leaves. The gilt .lobby-button belongs to the
   leather cover, so any button standing on paper — in the register's rows, its
   state panels or the detail leaf — is pressed paper instead, with sealing wax
   reserved for the single committing action: joining a room. */
.room-results .lobby-button,
.parchment-button {
  padding: 10px 16px;
  color: var(--ts-ink, #3a2a20);
  background-color: rgba(255, 250, 234, 0.62);
  background-image: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.5),
    transparent 46%
  );
  border: 1px solid rgba(90, 62, 38, 0.42);
  border-radius: var(--ts-radius-sm, 6px);
  box-shadow:
    0 2px 6px rgba(70, 40, 18, 0.14),
    inset 0 1px rgba(255, 255, 255, 0.6);
  font-weight: 800;
  text-shadow: none;
  transition:
    border-color var(--ts-motion-fast, 160ms) ease,
    box-shadow var(--ts-motion-fast, 160ms) ease,
    transform var(--ts-motion-fast, 160ms) var(--ts-ease-out, ease-out);
}

.parchment-button {
  width: 100%;
}

.room-results .lobby-button.ghost {
  background-color: rgba(255, 250, 234, 0.32);
  background-image: none;
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.45);
}

.room-results .lobby-button.primary,
.parchment-button.primary {
  color: #fff2e6;
  background-color: var(--ts-wax-crimson, #7c2229);
  background-image:
    radial-gradient(
      70% 60% at 34% 24%,
      rgba(255, 178, 168, 0.32),
      transparent 64%
    ),
    linear-gradient(
      180deg,
      var(--ts-wax-crimson-lit, #a83a3f),
      var(--ts-wax-crimson, #7c2229)
    );
  border-color: #5f181e;
  box-shadow:
    0 6px 14px rgba(86, 26, 31, 0.28),
    inset 0 1px rgba(255, 200, 190, 0.3);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.34);
}

@media (hover: hover) {
  .room-results .lobby-button:hover:not(:disabled),
  .parchment-button:hover:not(:disabled) {
    border-color: rgba(90, 62, 38, 0.66);
    box-shadow: 0 5px 12px rgba(70, 40, 18, 0.2);
    transform: translateY(-1px);
  }

  .room-results .lobby-button.primary:hover:not(:disabled),
  .parchment-button.primary:hover:not(:disabled) {
    border-color: #4d1218;
    box-shadow:
      0 8px 18px rgba(86, 26, 31, 0.32),
      0 0 16px rgba(166, 60, 69, 0.22);
  }
}

.detail-empty,
.detail-state {
  display: flex;
  min-height: 450px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.detail-state .detail-topline {
  position: absolute;
  top: 22px;
  right: 22px;
  left: 22px;
}

.detail-state .parchment-button {
  width: auto;
  margin-top: 18px;
}

/* Both empty states are stamped with the shared .wax-seal pour; only the size
   and placement are local. */
.detail-seal,
.state-emblem--wax {
  --ts-wax-size: 54px;

  margin: 24px auto 18px;
}

.state-panel {
  display: flex;
  min-height: 390px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 28px;
  text-align: center;
}

.state-panel h3 {
  margin-top: 10px;
  font-size: 1.25rem;
}

.state-panel p {
  max-width: 470px;
  margin: 8px 0 0;
  color: #665044;
}

.state-emblem {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  color: #fff2e6;
  background: var(--ts-wax-crimson, #7c2229);
  border: 2px solid #5f181e;
  border-radius: 50%;
  font-family: var(--ts-font-heading, serif);
  font-size: 1.3rem;
  font-weight: 900;
}

.state-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 20px;
}

.skeleton-list {
  border-top: 1px solid rgba(90, 62, 38, 0.34);
  border-bottom: 1px solid rgba(90, 62, 38, 0.34);
}

.skeleton-row {
  display: grid;
  grid-template-columns: 1.5fr 1.2fr 1fr 0.8fr;
  gap: 22px;
  min-height: 82px;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid rgba(90, 62, 38, 0.18);
}

.skeleton-row:last-child {
  border-bottom: 0;
}

/* Pending entries develop like a stain soaking through the page rather than a
   highlight sliding across it — nothing appears to move sideways while the real
   rows are still on their way. The declared opacity is also the keyframe's end
   state, so reduced motion leaves the blocks exactly as drawn. */
.skeleton-row span,
.detail-skeleton span {
  display: block;
  height: 14px;
  background: var(--ts-ink, #3a2a20);
  border-radius: 999px;
  opacity: 0.28;
  animation: ts-ink-develop 1.6s var(--ts-ease-in-out, ease-in-out) infinite;
}

.skeleton-row span:nth-child(2),
.detail-skeleton span:nth-child(2) {
  animation-delay: 160ms;
}

.skeleton-row span:nth-child(3),
.detail-skeleton span:nth-child(3) {
  animation-delay: 320ms;
}

.skeleton-row span:nth-child(4),
.detail-skeleton span:nth-child(4) {
  animation-delay: 480ms;
}

.detail-skeleton {
  display: grid;
  gap: 18px;
  margin-top: 48px;
}

.detail-skeleton span:nth-child(1) {
  width: 72%;
  height: 28px;
}
.detail-skeleton span:nth-child(2) {
  width: 42%;
}
.detail-skeleton span:nth-child(3) {
  width: 100%;
  height: 180px;
  border-radius: 8px;
}
.detail-skeleton span:nth-child(4) {
  width: 100%;
  height: 44px;
  border-radius: 6px;
}

.detail-backdrop {
  display: none;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 1180px) {
  .lobby-toolbar {
    grid-template-columns: minmax(240px, 1fr) repeat(2, 140px) auto;
  }

  .lobby-toolbar .refresh-button {
    grid-column: 4;
  }

  .room-row {
    grid-template-columns:
      minmax(165px, 1.35fr) minmax(130px, 1fr) minmax(120px, 0.9fr)
      80px minmax(105px, 0.85fr) 144px;
    gap: 9px;
  }
}

@media (max-width: 1279px) {
  .lobby-page {
    padding: 0;
  }

  .lobby-shell {
    min-height: 100dvh;
    border-right: 0;
    border-left: 0;
    border-radius: 0;
  }

  .lobby-header {
    align-items: stretch;
    flex-direction: column;
    gap: 20px;
    padding: 24px 20px 20px;
  }

  .lobby-summary {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .lobby-summary .create-button {
    grid-column: 1 / -1;
  }

  .lobby-toolbar {
    grid-template-columns: 1fr 1fr;
    padding: 14px 18px;
  }

  .search-field {
    grid-column: 1 / -1;
  }

  .lobby-toolbar .refresh-button {
    grid-column: auto;
  }

  /* One page at a time on a narrow screen: no fold, no leather margin, and the
     detail leaf becomes a sheet lifted over the top rather than a bookmarked
     column, so its ribbon goes away with it. */
  .lobby-grid {
    display: block;
    min-height: 0;
    margin: 0;
    overflow: visible;
    border-radius: 0;
  }

  .lobby-grid.book-gutter::before {
    display: none;
  }

  .detail-bookmark {
    display: none;
  }

  .room-results {
    padding: 18px;
  }

  .room-table,
  .skeleton-list {
    overflow: visible;
    border: 0;
  }

  .table-header {
    display: none;
  }

  .room-card {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    min-height: 0;
    margin-bottom: 14px;
    padding: 18px;
    background-color: rgba(255, 250, 234, 0.5);
    background-image: linear-gradient(
      145deg,
      rgba(255, 255, 255, 0.42),
      transparent 58%
    );
    border: 1px solid rgba(90, 62, 38, 0.32);
    border-radius: var(--ts-radius-md, 10px);
    box-shadow: 0 8px 18px rgba(70, 40, 18, 0.16);
  }

  .room-card.selected {
    border-color: rgba(124, 34, 41, 0.55);
    box-shadow:
      0 8px 18px rgba(70, 40, 18, 0.16),
      inset 0 3px var(--ts-wax-crimson, #7c2229);
  }

  .room-cell::before {
    display: block;
    margin-bottom: 5px;
    color: #665044;
    font-size: 0.66rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    content: attr(data-label);
  }

  .room-identity,
  .row-actions {
    grid-column: 1 / -1;
  }

  .room-identity::before,
  .row-actions::before {
    display: none;
  }

  .row-actions {
    margin-top: 3px;
  }

  .detail-backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: block;
    width: 100%;
    height: 100%;
    background: rgba(8, 5, 11, 0.7);
    border: 0;
    backdrop-filter: blur(3px);
  }

  .room-detail-panel {
    position: fixed;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 90;
    max-height: 88dvh;
    padding: 26px 22px calc(28px + env(safe-area-inset-bottom));
    border-top: 1px solid #a7834e;
    border-left: 0;
    border-radius: 18px 18px 0 0;
    box-shadow: 0 -18px 56px rgba(0, 0, 0, 0.5);
    transform: translateY(105%);
    visibility: hidden;
    transition:
      transform var(--ts-motion-base, 220ms) var(--ts-ease-out, ease-out),
      visibility var(--ts-motion-base, 220ms);
  }

  .room-detail-panel.is-mobile-open {
    transform: translateY(0);
    visibility: visible;
  }

  .detail-empty {
    min-height: 300px;
  }
}

@media (max-width: 560px) {
  .action-banner {
    align-items: flex-start;
    flex-direction: column;
  }

  .action-banner__actions {
    width: 100%;
    justify-content: flex-end;
  }

  .lobby-heading h1 {
    font-size: 2.15rem;
  }

  .lobby-toolbar {
    grid-template-columns: 1fr;
  }

  .search-field,
  .lobby-toolbar .refresh-button {
    grid-column: auto;
  }

  .room-card {
    grid-template-columns: 1fr;
  }

  .room-identity,
  .row-actions {
    grid-column: auto;
  }

  .entity-cell,
  .population-cell,
  .room-card > .room-cell:nth-child(5) {
    padding-top: 11px;
    border-top: 1px solid rgba(90, 62, 38, 0.2);
  }

  .pagination {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }

  .pagination span {
    grid-column: 1 / -1;
    grid-row: 1;
    text-align: center;
  }

  .room-facts {
    grid-template-columns: 1fr;
  }

  .state-actions,
  .state-actions .lobby-button {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-row span,
  .detail-skeleton span,
  .room-card::after,
  .detail-bookmark,
  .detail-title-block {
    animation: none;
  }

  .lobby-button,
  .parchment-button,
  .room-card,
  .room-detail-panel {
    transition: none;
  }
}
</style>

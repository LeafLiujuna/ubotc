import { EventEmitter } from 'eventemitter3'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, expect, test, vi } from 'vitest'
import { useGameController } from '@/controllers/GameController'
import { useVoiceController } from '@/controllers/VoiceController'
import { useGameStore } from '@/stores/game'
import { useAppStore } from '@/stores/app'
import { useUserStore } from '@/stores/user'
import { useRoomNotificationsStore } from '@/stores/roomNotifications'
import { playChime } from '@/utils/chime'
import { SocketClientEvent as C, SocketServerEvent as S } from '@/types/socket'
vi.mock('@/utils/chime', () => ({ playChime: vi.fn() }))
vi.mock('@/services/voice', async () => {
  const { EventEmitter } = await import('eventemitter3')
  return {
    VoiceService: class extends EventEmitter {
      connect = vi.fn(async () => {
        this.emit('connection:changed', 'active', 'connected')
      })
      disconnect = vi.fn(async () => {})
      connectToPrivateRoom = vi.fn(async () => {})
      setMicMuted = vi.fn(async () => {})
      setSpeakMode = vi.fn(async () => {})
      setRole = vi.fn(async () => {})
      setActiveSpeakingRoom = vi.fn(async () => {})
      setSpeakerMuted = vi.fn()
      configureAudio = vi.fn(async () => {})
      setRemoteParticipantMuted = vi.fn()
      setRemoteParticipantVolume = vi.fn()
    },
  }
})
let socket
beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  setActivePinia(createPinia())
  Object.defineProperty(window, 'RTCPeerConnection', { configurable: true, value: class {} })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true,
    value: { getUserMedia: vi.fn(), enumerateDevices: vi.fn(async () => []) } })
  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: vi.fn(async () => ({ state: 'granted' })) },
  })
  socket = new EventEmitter()
  socket.request = vi.fn(async () => ({
    status: 200,
    data: {
      publicRoomId: 'ROOM_townsquare',
      publicRoomToken: 'public',
      dmBroadcastRoomId: 'ROOM_astral',
      dmBroadcastRoomToken: 'broadcast',
    },
  }))
  useGameController().gameSocket = socket
  useGameStore().currentPlayer = { userId: 'a', seat: 1 }
  useVoiceController().liveKitEndpoint = 'wss://voice.test'
})

test('pending invitations leave media in place and result notices and cues respect sound settings', async () => {
  const voice = useVoiceController()
  await voice.ensureConnected()
  const originalRequest = socket.request
  socket.request = vi.fn(async (event, data) => event === C.VoiceRoomCreate
    ? { status: 200, data: { chatRoomId: 'private', invitedUserIds: ['b'] } }
    : originalRequest(event, data))
  const settings = useAppStore().grimoire
  settings.isMuted = true; settings.soundVolume = 37
  await voice.createVoiceRoom(['b', 'offline'])
  expect(voice.waitingForInvite).toBe(true)
  expect(voice.outgoingInvites).toEqual([{ chatRoomId: 'private', userId: 'b', status: 'pending' }])
  expect(voice.currentActiveRoomId).toBe('ROOM_townsquare')
  expect(playChime).toHaveBeenLastCalledWith('invite', { muted: true, volume: 37 })
  await expect(voice.createVoiceRoom(['c'])).rejects.toThrow('等待回应')
  socket.emit(S.VoiceRoomInviteResult, { chatRoomId: 'private', userId: 'b', status: 'rejected' })
  expect(voice.waitingForInvite).toBe(false)
  expect(useRoomNotificationsStore().preview.message).toContain('拒绝')
  expect(playChime).toHaveBeenLastCalledWith('decline', { muted: true, volume: 37 })
  const count = playChime.mock.calls.length
  socket.emit(S.VoiceRoomInviteResult, { chatRoomId: 'private', userId: 'b', status: 'rejected' })
  expect(playChime).toHaveBeenCalledTimes(count)
  settings.isMuted = false
  socket.emit(S.VoiceRoomJoin, { chatRoomId: 'private', token: 'secret' })
  await flushPromises()
  expect(playChime).toHaveBeenLastCalledWith('voiceJoin', { muted: false, volume: 37 })
  await voice.backToPublicRoom()
  expect(playChime).toHaveBeenLastCalledWith('voiceLeave', { muted: false, volume: 37 })
})

test('table selection sends a single request only to an online seated member or storyteller', async () => {
  const voice = useVoiceController(), game = useGameStore()
  useUserStore().setCurrentUser({ id: 'a', displayName: '甲' })
  game.players = { a: { userId: 'a', seat: 1 }, b: { userId: 'b', seat: 2 } }
  game.dms = { dm: { userId: 'dm', seat: 0, isDM: true } }
  game.roomUsers = { a: { userId: 'a' }, b: { userId: 'b', disconnectedAt: 123 }, dm: { userId: 'dm' } }
  voice.startInviteSelection()
  for (const id of ['', 'guest', 'a', 'b']) await voice.selectInvitee(id)
  expect(socket.request).not.toHaveBeenCalled()
  const original = socket.request
  socket.request = vi.fn(async (event, data) => event === C.VoiceRoomCreate
    ? { status: 200, data: { chatRoomId: 'private', invitedUserIds: ['dm'] } } : original(event, data))
  await Promise.all([voice.selectInvitee('dm'), voice.selectInvitee('dm')])
  expect(socket.request.mock.calls.filter(([event]) => event === C.VoiceRoomCreate)).toEqual([[C.VoiceRoomCreate, { toUserIds: ['dm'], scene: '聊天' }]])
  expect(voice.selectingInvitee).toBe(false)
  expect(voice.waitingForInvite).toBe(true)
  await voice.cancelInvite('private')
  expect(socket.request).toHaveBeenLastCalledWith(C.VoiceRoomLeave, { chatRoomId: 'private' })
  expect(voice.currentActiveRoomId).toBe('ROOM_townsquare')
  expect(voice.waitingForInvite).toBe(false)
})

test('inline consent initializes voice before accepting and expired requests disappear', async () => {
  const voice = useVoiceController()
  voice.receiveInvite({ type: 'voiceRoomInvite', fromUserId: 'b', applyId: 'one' })
  voice.receiveInvite({ type: 'voiceRoomInvite', fromUserId: 'b', applyId: 'one' })
  expect(voice.incomingInvites).toHaveLength(1)
  await voice.respondToInvite('one', true)
  expect(socket.request).toHaveBeenLastCalledWith(C.RespondApply, { applyId: 'one', accept: true })
  expect(voice.incomingInvites).toHaveLength(0)
  voice.receiveInvite({ type: 'voiceRoomInvite', fromUserId: 'b', applyId: 'expired' })
  voice.finishInvite('expired')
  expect(voice.incomingInvites).toHaveLength(0)
})

test('direct location and invite actions initialize media once and room pushes enter the channel', async () => {
  const voice = useVoiceController()
  await Promise.all([voice.ensureConnected(), voice.ensureConnected()])
  expect(
    socket.request.mock.calls.filter(
      ([event]) => event === C.VoicePublicRoomJoin
    )
  ).toHaveLength(1)
  await voice.joinPlace('tower')
  expect(socket.request).toHaveBeenLastCalledWith(C.VoicePlaceJoin, {
    placeId: 'tower',
  })
  socket.emit(S.VoiceRoomJoin, {
    chatRoomId: 'ROOM_place_tower',
    token: 'private',
  })
  await flushPromises()
  expect(voice.currentActiveRoomId).toBe('ROOM_place_tower')
  await voice.backToPublicRoom()
  expect(voice.currentActiveRoomId).toBe('ROOM_townsquare')
  expect(socket.request).toHaveBeenCalledWith(C.VoicePublicRoomJoin)
  expect(socket.request).toHaveBeenLastCalledWith(C.VoiceUpdateMuteState, {
    chatRoomId: 'ROOM_townsquare', muted: true, speakerMuted: false,
  })
  await voice.createVoiceRoom(['b'], '邀请私聊')
  expect(socket.request).toHaveBeenLastCalledWith(C.VoiceRoomCreate, {
    toUserIds: ['b'],
    scene: '邀请私聊',
  })
})

test('uses the server-advertised endpoint without a frontend build setting and reports unavailable service', async () => {
  const voice = useVoiceController()
  voice.liveKitEndpoint = ''
  socket.request.mockResolvedValueOnce({ status: 503, message: '语音服务尚未配置' })
  await expect(voice.connect()).rejects.toThrow('语音服务尚未配置')
  const join = await socket.request()
  socket.request.mockResolvedValueOnce({ ...join, data: { ...join.data, liveKitEndpoint: 'wss://server-voice.test' } })
  await voice.connect()
  expect(voice.service.connect).toHaveBeenCalledWith(expect.objectContaining({ liveKitEndpoint: 'wss://server-voice.test' }))
  expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()
  socket.request.mockResolvedValueOnce({ ...join, data: { ...join.data, liveKitEndpoint: 'wss://new-server-voice.test' } })
  await voice.connect()
  expect(voice.service.connect).toHaveBeenLastCalledWith(expect.objectContaining({ liveKitEndpoint: 'wss://new-server-voice.test' }))
})

test('actually prompts for microphone permission when the Permissions API is unavailable and releases the probe', async () => {
  const voice = useVoiceController()
  navigator.permissions.query.mockRejectedValue(new Error('unsupported'))
  const stop = vi.fn()
  navigator.mediaDevices.getUserMedia.mockResolvedValue({ getTracks: () => [{ stop }] })
  await voice.checkMicrophonePermission()
  expect(voice.microphonePermissionGranted).toBe(true)
  expect(stop).toHaveBeenCalledOnce()
})

test('disconnect resets active media, reconnect returns to square, and switching game sockets detaches old pushes', async () => {
  const voice = useVoiceController()
  await voice.ensureConnected()
  socket.emit(S.VoiceRoomJoin, { chatRoomId: 'private', token: 'token' })
  await flushPromises()
  socket.emit('socket:disconnected')
  await flushPromises()
  expect(voice.currentActiveRoomId).toBe('')
  socket.emit('socket:connected')
  await flushPromises()
  expect(voice.currentActiveRoomId).toBe('ROOM_townsquare')
  const oldSocket = socket
  socket = new EventEmitter()
  socket.request = oldSocket.request
  useGameController().gameSocket = socket
  await voice.connect()
  expect(oldSocket.listenerCount(S.VoiceRoomJoin)).toBe(0)
  expect(oldSocket.listenerCount('socket:connected')).toBe(0)
  voice.resetRoomView()
  expect(socket.listenerCount(S.VoiceRoomJoin)).toBe(0)
  expect(voice.roomDirectory).toEqual({})
  await voice.disconnect()
})

test('directory preserves access metadata and removes closed invite rooms', () => {
  const voice = useVoiceController()
  voice.applyRoomOverview({
    isUpdate: false,
    rooms: [
      {
        chatRoomId: 'invite',
        scene: '聊天',
        access: 'invite',
        allowedUserIds: ['a', 'b'],
        users: [],
      },
    ],
  })
  expect(voice.roomDirectory.invite.allowedUserIds).toEqual(['a', 'b'])
  voice.applyRoomOverview({ isUpdate: true, rooms: [], removed: ['invite'] })
  expect(voice.roomDirectory).toEqual({})
})

test('speech includes the local user and merges both channels until speech ends in all of them', async () => {
  const voice = useVoiceController()
  await voice.ensureConnected()
  const media = voice.service
  media.emit('participants:changed', 'active', [
    { userId: 'a', isLocal: true, isSpeaking: true, isMicMuted: false },
    { userId: 'dm', isLocal: false, isSpeaking: true, isMicMuted: false },
  ])
  expect(voice.remoteVoiceStates.a.isSpeaking).toBe(true)
  media.emit('speaking:changed', 'dm', true, 'broadcast')
  media.emit('speaking:changed', 'dm', false, 'active')
  expect(voice.remoteVoiceStates.dm.isSpeaking).toBe(true)
  media.emit('participants:changed', 'active', [])
  expect(voice.remoteVoiceStates.a.isSpeaking).toBe(false)
  expect(voice.remoteVoiceStates.dm.isSpeaking).toBe(true)
  media.emit('speaking:changed', 'dm', false, 'broadcast')
  expect(voice.remoteVoiceStates.dm.isSpeaking).toBe(false)
})

test('departures, lost connections, disconnect and room reset remove stale speech highlights', async () => {
  const voice = useVoiceController()
  await voice.ensureConnected()
  const media = voice.service
  media.emit('speaking:changed', 'b', true, 'active')
  media.emit('participants:changed', 'active', [])
  expect(voice.remoteVoiceStates.b.isSpeaking).toBe(false)
  media.emit('speaking:changed', 'b', true, 'broadcast')
  media.emit('connection:changed', 'broadcast', 'reconnecting')
  expect(voice.remoteVoiceStates.b.isSpeaking).toBe(false)
  media.emit('speaking:changed', 'b', true, 'active')
  await voice.disconnect()
  expect(voice.remoteVoiceStates.b.isSpeaking).toBe(false)
  media.emit('speaking:changed', 'b', true, 'broadcast')
  voice.resetRoomView()
  await voice.ensureConnected()
  media.emit('participants:changed', 'active', [{ userId: 'b', isLocal: false, isSpeaking: false, isMicMuted: true }])
  expect(voice.remoteVoiceStates.b.isSpeaking).toBe(false)
})

<template>
  <span v-if="false" />
</template>

<script setup lang="ts">
import { requestInputModal } from '@/services/inputModalService'
import { resetRoomSessionState } from '@/services/roomSessionResetService'
import { useAppStore } from '@/stores/app'
import { usePlayersStore } from '@/stores/players'
import { useSessionStore } from '@/stores/session'

const appStore = useAppStore()
const playersStore = usePlayersStore()
const session = useSessionStore()

async function changeName(): Promise<void> {
  const input = await requestInputModal({
    inputType: 'changeName',
    inputModal: 'input',
    inputData: {
      name: ['输入玩家昵称'],
      length: 1,
      placeholder: [''],
    },
  }).catch(() => null)
  if (!Array.isArray(input)) return

  session.setPlayerName(String(input[0] || ''))
}

function copySessionUrl(): void {
  const url = window.location.href.split('#')[0]
  const link = `${url}#${session.sessionId}`

  if (navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(link)
    return
  }

  const textArea = document.createElement('textarea')
  textArea.value = link
  document.body.appendChild(textArea)
  textArea.select()
  document.execCommand('copy')
  document.body.removeChild(textArea)
}

async function hostSession(): Promise<void> {
  if (!session.playerName) await changeName()
  if (!session.playerName || session.sessionId) return

  if (session.rooms === null) {
    await requestInputModal({
      inputType: 'alert',
      inputModal: 'text',
      inputData: { name: ['网络连接不稳定，请稍等！'] },
    }).catch(() => null)
    return
  }

  const rooms = Array.isArray(session.rooms) ? session.rooms : []
  let sessionPlaceholder = Math.round(Math.random() * 10000)
  while (rooms.includes(sessionPlaceholder)) {
    sessionPlaceholder = Math.round(Math.random() * 10000)
  }

  const input = await requestInputModal({
    inputType: 'hostSession',
    inputModal: 'input',
    inputData: {
      name: ['请输入房间号', '请输入玩家人数'],
      length: 2,
      placeholder: [String(sessionPlaceholder), '12'],
    },
  }).catch(() => null)
  if (!Array.isArray(input)) return

  const sessionId = String(input[0] || '')
  const numPlayers = Math.min(Number(input[1]) || 0, 20)
  if (!sessionId) return

  session.clearVoteHistory()
  session.setSpectator(false)
  session.setSessionId(sessionId)
  playersStore.clear()
  for (let index = 0; index < numPlayers; index += 1) {
    playersStore.add({ name: '', stImage: null, stName: null })
  }
  copySessionUrl()
}

async function joinSession(): Promise<void> {
  if (session.sessionId) {
    await leaveSession()
    return
  }
  if (!session.playerName) await changeName()
  if (!session.playerName) return

  if (session.rooms === null) {
    await requestInputModal({
      inputType: 'alert',
      inputModal: 'text',
      inputData: { name: ['网络连接不稳定，请稍等！'] },
    }).catch(() => null)
    return
  }

  const input = await requestInputModal({
    inputType: 'joinSession',
    inputModal: 'input',
    inputData: {
      name: ['输入房间号/链接'],
      length: 1,
      placeholder: [''],
    },
  }).catch(() => null)
  if (!Array.isArray(input)) return

  const sessionId = Number(
    String(input[0] || '')
      .split('#')
      .pop()
  ).toString()
  if (!sessionId) return

  session.clearVoteHistory()
  session.setSpectator(true)
  appStore.toggleGrimoire(false)
  session.setSessionId(sessionId)
}

async function leaveSession(): Promise<void> {
  const confirm = await requestInputModal({
    inputType: 'confirm',
    inputModal: 'confirm',
    inputData: { name: ['确定要离开/解散该房间吗？'] },
  }).catch(() => null)
  if (confirm === true) resetRoomSessionState({ deactivateRoom: true })
}

async function backToLobby(): Promise<void> {
  const confirm = await requestInputModal({
    inputType: 'confirm',
    inputModal: 'confirm',
    inputData: { name: ['确定要返回大厅吗？'] },
  }).catch(() => null)
  if (confirm !== true) return

  resetRoomSessionState()
  window.location.href = '/'
}

defineExpose({
  hostSession,
  joinSession,
  copySessionUrl,
  leaveSession,
  backToLobby,
})
</script>

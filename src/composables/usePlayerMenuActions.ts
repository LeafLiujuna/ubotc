import { useAppStore } from '@/stores/app'
import { usePlayerViewStore } from '@/stores/playerView'
import { useVoiceController } from '@/controllers/VoiceController'

/** Shared by the player menu and keyboard shortcuts. */
export function usePlayerMenuActions() {
  const app = useAppStore()
  function close() {
    app.toggleMenu(false)
  }
  function modal(name: string) {
    close()
    app.toggleModal(name)
  }
  function openRoles() {
    close()
    window.dispatchEvent(
      new CustomEvent('ts-open-reference', { detail: 'right-roles-panel' })
    )
  }
  function requestChat() {
    close()
    window.dispatchEvent(new CustomEvent('ts-request-voice-chat'))
  }
  async function town() {
    try {
      const voice = useVoiceController()
      if (
        voice.currentActiveRoomId &&
        voice.currentActiveRoomId !== voice.publicRoomId
      )
        await voice.backToPublicRoom()
      app.toggleGrimoire(true)
      close()
    } catch (error) {
      window.$toast.error(
        error instanceof Error ? error.message : '返回广场失败'
      )
    }
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
      close()
    } catch {
      window.$toast.warning('当前浏览器无法切换全屏')
    }
  }
  function run(action: string) {
    if (action === 'chat') requestChat()
    else if (action === 'hand') void usePlayerViewStore().toggleHand()
    else if (action === 'town') void town()
    else if (action === 'roles') openRoles()
    else if (action === 'users') modal('roomInfo')
    else if (action === 'settings') modal('settings')
    else if (action === 'fullscreen') void fullscreen()
  }
  return { close, modal, openRoles, requestChat, town, fullscreen, run }
}

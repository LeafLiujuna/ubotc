<template>
  <section
    v-if="activeDialog === 'roles'"
    ref="dialogElement"
    class="distribution-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="distribution-roles-title"
    data-testid="distribution-dialog-roles"
    @keydown.esc="closeDialog"
  >
    <h2 id="distribution-roles-title">发送角色</h2>
    <label class="distribution-option">
      <input v-model="isSendingBluff" type="checkbox" />
      <span>同时给恶魔（疯子）发送伪装身份</span>
    </label>
    <div class="distribution-actions">
      <button
        type="button"
        class="distribution-primary"
        data-autofocus
        data-testid="distribution-confirm-roles"
        @click="distributeRoles(true)"
      >
        确定发送
      </button>
      <button type="button" @click="distributeRoles(false)">取消</button>
    </div>
  </section>

  <section
    v-if="activeDialog === 'bluffs'"
    ref="dialogElement"
    class="distribution-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="distribution-bluffs-title"
    :aria-busy="busy"
    data-testid="distribution-dialog-bluffs"
    @keydown.esc="closeDialog"
  >
    <h2 id="distribution-bluffs-title">发送伪装身份给</h2>
    <div class="distribution-actions distribution-actions--targets">
      <button
        type="button"
        data-autofocus
        :disabled="busy"
        @click="distributeBluffs('demon')"
      >
        恶魔
      </button>
      <button
        type="button"
        :disabled="busy"
        @click="distributeBluffs('lunatic')"
      >
        疯子
      </button>
      <button
        type="button"
        :disabled="busy"
        @click="distributeBluffs('snitch')"
      >
        爪牙（告密者）
      </button>
      <button
        type="button"
        :disabled="busy"
        data-testid="distribution-bluffs-seat"
        @click="distributeBluffs(null, true)"
      >
        输入座位号
      </button>
      <button type="button" :disabled="busy" @click="closeDialog">取消</button>
    </div>
  </section>

  <section
    v-if="activeDialog === 'grimoire'"
    ref="dialogElement"
    class="distribution-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="distribution-grimoire-title"
    :aria-busy="busy"
    data-testid="distribution-dialog-grimoire"
    @keydown.esc="closeDialog"
  >
    <h2 id="distribution-grimoire-title">发送魔典给</h2>
    <div class="distribution-actions distribution-actions--targets">
      <button
        type="button"
        data-autofocus
        :disabled="busy"
        @click="distributeGrimoire('widow')"
      >
        寡妇
      </button>
      <button type="button" :disabled="busy" @click="distributeGrimoire('spy')">
        间谍
      </button>
      <button
        type="button"
        :disabled="busy"
        data-testid="distribution-grimoire-seat"
        @click="distributeGrimoire(null, true)"
      >
        输入座位号
      </button>
      <button type="button" :disabled="busy" @click="closeDialog">取消</button>
    </div>
  </section>

  <p
    v-if="statusMessage"
    class="distribution-status"
    role="status"
    aria-live="polite"
    data-testid="distribution-status"
  >
    {{ statusMessage }}
  </p>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'
import { requestInputModal } from '@/services/inputModalService'
import { useAppStore } from '@/stores/app'
import { usePlayersStore } from '@/stores/players'
import { useSessionStore } from '@/stores/session'

type DistributionDialog = 'roles' | 'bluffs' | 'grimoire'
type DistributionKey = 'roles' | 'types' | 'bluffs' | 'grimoire'
type BluffTarget = 'demon' | 'lunatic' | 'snitch' | null
type GrimoireTarget = 'widow' | 'spy' | null
type DistributionPayload = {
  val: boolean
  role?: string | null
  seatNum?: number
}

const appStore = useAppStore()
const playersStore = usePlayersStore()
const session = useSessionStore()
const activeDialog = ref<DistributionDialog | null>(null)
const busy = ref(false)
const isSendingBluff = ref(true)
const statusMessage = ref('')
const dialogElement = ref<HTMLElement | null>(null)
const resetTimers = new Map<DistributionKey, number>()
let statusTimer: number | null = null
let triggerElement: HTMLElement | null = null

const resetDistribution: Record<DistributionKey, () => void> = {
  roles: () => session.distributeRoles(false),
  types: () => session.distributeTypes(false),
  bluffs: () => session.distributeBluffs({ val: false }),
  grimoire: () => session.distributeGrimoire({ val: false }),
}

function rememberTrigger(): void {
  const activeElement = document.activeElement
  triggerElement = activeElement instanceof HTMLElement ? activeElement : null
}

function restoreFocus(): void {
  void nextTick(() => {
    const canRestoreTrigger =
      appStore.grimoire.isMenuOpen &&
      triggerElement?.isConnected &&
      !triggerElement.hasAttribute('disabled')
    const target = canRestoreTrigger
      ? triggerElement
      : document.getElementById('app')
    target?.focus()
  })
}

function focusDialog(): void {
  void nextTick(() => {
    dialogElement.value?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  })
}

function toggleDialog(dialog: DistributionDialog): void {
  if (activeDialog.value === dialog) {
    closeDialog()
    return
  }

  rememberTrigger()
  activeDialog.value = dialog
  focusDialog()
}

function closeDialog(): void {
  activeDialog.value = null
  busy.value = false
  restoreFocus()
}

function announce(message: string): void {
  statusMessage.value = message
  if (statusTimer !== null) window.clearTimeout(statusTimer)
  statusTimer = window.setTimeout(() => {
    statusMessage.value = ''
    statusTimer = null
  }, 2000)
}

function pulseDistribution(
  key: DistributionKey,
  activate: () => void,
  message: string
): void {
  const previousTimer = resetTimers.get(key)
  if (previousTimer !== undefined) window.clearTimeout(previousTimer)

  activate()
  announce(message)
  const timer = window.setTimeout(() => {
    resetDistribution[key]()
    resetTimers.delete(key)
  }, 2000)
  resetTimers.set(key, timer)
}

async function requestConfirmation(message: string): Promise<boolean | null> {
  busy.value = true
  const result = await requestInputModal({
    inputType: 'confirm',
    inputModal: 'confirm',
    inputData: { name: [message] },
  }).catch(() => null)
  busy.value = false
  return typeof result === 'boolean' ? result : null
}

async function requestSeatNumber(): Promise<number | null> {
  busy.value = true
  const result = await requestInputModal({
    inputType: 'seatNum',
    inputModal: 'input',
    inputData: {
      name: ['请输入座位号'],
      length: 1,
      placeholder: [''],
    },
  }).catch(() => null)
  busy.value = false
  if (!Array.isArray(result)) return null
  return Number(result[0])
}

function openRoles(): void {
  toggleDialog('roles')
}

async function openTypes(): Promise<void> {
  rememberTrigger()
  activeDialog.value = null
  const confirm = await requestConfirmation('确定要发送角色类型给玩家？')
  if (confirm === true && !session.isSpectator) {
    pulseDistribution(
      'types',
      () => session.distributeTypes(true),
      '已发送角色类型'
    )
  }
  restoreFocus()
}

function openBluffs(): void {
  toggleDialog('bluffs')
}

function openGrimoire(): void {
  toggleDialog('grimoire')
}

function distributeRoles(confirm: boolean): void {
  closeDialog()
  if (!confirm || session.isSpectator) return

  // In a local room the role deal lives in the session store.  Re-apply it
  // before showing the distribution pulse so a manual grimoire edit cannot
  // replace the roles that the storyteller is sending.
  if (!(session.sessionId && session.gameServerId) && session.roleAssignmentSnapshot.length) {
    session.roleAssignmentSnapshot.forEach((roleId, index) => {
      const player = playersStore.players[index]
      if (!player || !roleId) return
      const role = appStore.roles.get(roleId) || appStore.rolesJSONbyId.get(roleId)
      if (!role) return
      playersStore.update({ player, property: 'role', value: role })
    })
  }

  pulseDistribution('roles', () => session.distributeRoles(true), '已发送角色')
  if (!isSendingBluff.value) return

  const payload: DistributionPayload = { val: true, role: 'demonAll' }
  pulseDistribution(
    'bluffs',
    () => session.distributeBluffs(payload),
    '已发送角色与恶魔伪装身份'
  )
}

async function distributeBluffs(
  role: BluffTarget = null,
  seat = false
): Promise<void> {
  if (!role && !seat) {
    closeDialog()
    return
  }

  const seatNum = seat ? await requestSeatNumber() : undefined
  if (seatNum === null) return

  const roleText: Record<Exclude<BluffTarget, null>, string> = {
    demon: '恶魔',
    lunatic: '疯子',
    snitch: '爪牙',
  }
  const targetText = role ? roleText[role] : `${seatNum}号位`
  const confirm = await requestConfirmation(
    `确定要发送伪装身份给${targetText}？`
  )
  if (confirm !== true || session.isSpectator) return

  const payload: DistributionPayload = { val: true, role, seatNum }
  pulseDistribution(
    'bluffs',
    () => session.distributeBluffs(payload),
    `已发送伪装身份给${targetText}`
  )
  closeDialog()
}

async function distributeGrimoire(
  role: GrimoireTarget = null,
  seat = false
): Promise<void> {
  if (!role && !seat) {
    closeDialog()
    return
  }

  const seatNum = seat ? await requestSeatNumber() : undefined
  if (seatNum === null) return

  const roleText: Record<Exclude<GrimoireTarget, null>, string> = {
    widow: '寡妇',
    spy: '间谍',
  }
  const targetText = role ? roleText[role] : `${seatNum}号位`
  const confirm = await requestConfirmation(`确定要发送魔典给${targetText}？`)
  if (confirm !== true || session.isSpectator) return

  const payload: DistributionPayload = { val: true, role, seatNum }
  pulseDistribution(
    'grimoire',
    () => session.distributeGrimoire(payload),
    `已发送魔典给${targetText}`
  )
  closeDialog()
}

onBeforeUnmount(() => {
  resetTimers.forEach((timer, key) => {
    window.clearTimeout(timer)
    resetDistribution[key]()
  })
  resetTimers.clear()
  if (statusTimer !== null) window.clearTimeout(statusTimer)
})

defineExpose({ openRoles, openTypes, openBluffs, openGrimoire })
</script>

<style scoped>
.distribution-dialog {
  display: grid;
  gap: 16px;
  width: min(440px, calc(100vw - 32px));
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 8px;
  color: white;
  background-color: #000;
  text-align: center;
}

.distribution-dialog h2 {
  margin: 0;
  font-size: 1.15rem;
}

.distribution-option {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 44px;
  cursor: pointer;
}

.distribution-option input {
  width: 22px;
  height: 22px;
}

.distribution-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.distribution-actions--targets {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.distribution-actions button {
  min-width: 44px;
  min-height: 44px;
  padding: 8px 14px;
  border: 1px solid rgba(255, 255, 255, 0.64);
  border-radius: 6px;
  color: white;
  background: rgba(255, 255, 255, 0.08);
  font: inherit;
  cursor: pointer;
}

.distribution-actions button:hover,
.distribution-actions button:focus-visible {
  border-color: var(--ts-accent-gold, #d6b86a);
  color: #f5d980;
}

.distribution-actions button:focus-visible {
  outline: 2px solid #f5d980;
  outline-offset: 2px;
}

.distribution-actions button:disabled {
  opacity: 0.55;
  cursor: wait;
}

.distribution-actions .distribution-primary {
  border-color: var(--ts-accent-gold, #d6b86a);
  background: rgba(168, 118, 34, 0.3);
}

.distribution-status {
  margin: 8px 0;
  padding: 10px 14px;
  border: 1px solid rgba(214, 184, 106, 0.55);
  border-radius: 6px;
  color: #f5d980;
  background: rgba(0, 0, 0, 0.88);
  text-align: center;
}

@media (max-width: 480px) {
  .distribution-dialog {
    width: calc(100vw - 24px);
    padding: 16px;
  }

  .distribution-actions--targets {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .distribution-actions button {
    transition: none;
  }
}
</style>

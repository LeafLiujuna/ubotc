<script setup lang="ts">
import { GameApi } from '@/api/http/game'
import { handleResponse } from '@/helpers/response'
import type { CreateRoomData, CreateRoomRequest } from '@/types/game'
import {
  computed,
  getCurrentInstance,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import Modal from './Modal.vue'

defineOptions({
  name: 'CreateRoomModal',
})

const props = withDefaults(
  defineProps<{
    /** Legacy RoomList passes these props and handles the create request itself. */
    existingRooms?: unknown[]
    submitting?: boolean
  }>(),
  {
    existingRooms: () => [],
    submitting: false,
  }
)

type ErrorField = 'roomName' | 'roomPassword' | 'form'

const visible = defineModel<boolean>('visible', { default: false })
const emit = defineEmits<{
  created: [room: CreateRoomData & { password?: string }]
  /** Kept for the legacy RoomList component. */
  create: [payload: CreateRoomRequest]
  close: []
}>()

const componentInstance = getCurrentInstance()
const controlledVisibility = computed(() => {
  const rawProps = componentInstance?.vnode.props as
    | Record<string, unknown>
    | null
    | undefined
  return Boolean(
    rawProps &&
    (Object.prototype.hasOwnProperty.call(rawProps, 'visible') ||
      Object.prototype.hasOwnProperty.call(rawProps, 'onUpdate:visible'))
  )
})
const legacyMode = computed(() => !controlledVisibility.value)
const modalVisible = computed({
  get: () => (legacyMode.value ? true : visible.value),
  set: (value: boolean) => {
    if (legacyMode.value) {
      if (!value) emit('close')
    } else {
      visible.value = value
    }
  },
})

const state = reactive({
  roomName: '',
  loading: false,
  isPrivate: false,
  roomPassword: '',
  showPassword: false,
  selectedDifficulty: 'Beginner',
  difficultyLevels: [
    { value: 'Beginner', label: '新手', description: '适合初次围坐钟楼的玩家' },
    {
      value: 'Intermediate',
      label: '进阶',
      description: '需要熟悉基础规则与互动',
    },
    {
      value: 'Veteran',
      label: '老手',
      description: '为熟练玩家准备的复杂对局',
    },
  ],
})

const errors = reactive<Record<ErrorField, string>>({
  roomName: '',
  roomPassword: '',
  form: '',
})

const dialogPanel = ref<HTMLElement | null>(null)
const roomNameInput = ref<HTMLInputElement | null>(null)
const passwordInput = ref<HTMLInputElement | null>(null)
let returnFocusElement: HTMLElement | null = null

const isSubmitting = computed(() => state.loading || props.submitting)

const selectedDifficultyDescription = computed(
  () =>
    state.difficultyLevels.find(
      (item) => item.value === state.selectedDifficulty
    )?.description || ''
)

function clearError(field: ErrorField): void {
  errors[field] = ''
  errors.form = ''
}

function validateRoomName(): boolean {
  const name = state.roomName.trim()
  errors.roomName = name ? '' : '请填写房间名称。'
  return !errors.roomName
}

function validatePassword(): boolean {
  errors.roomPassword =
    state.isPrivate && !state.roomPassword.trim()
      ? '密码房需要设置加入密码。'
      : ''
  return !errors.roomPassword
}

function validateForm(): boolean {
  const nameValid = validateRoomName()
  const passwordValid = validatePassword()
  return nameValid && passwordValid
}

async function focusFirstError(): Promise<void> {
  await nextTick()
  if (errors.roomName) roomNameInput.value?.focus()
  else if (errors.roomPassword) passwordInput.value?.focus()
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      message?: unknown
      response?: { data?: { message?: unknown } }
    }
    if (
      typeof candidate.response?.data?.message === 'string' &&
      candidate.response.data.message.trim()
    ) {
      return candidate.response.data.message
    }
    if (typeof candidate.message === 'string' && candidate.message.trim()) {
      return candidate.message
    }
  }
  return fallback
}

async function createRoom(): Promise<void> {
  errors.form = ''
  if (!validateForm()) {
    await focusFirstError()
    return
  }

  const payload: CreateRoomRequest = {
    name: state.roomName.trim(),
    tags: [{ tag: 'difficulty', detail: state.selectedDifficulty }],
    isPrivate: state.isPrivate,
    password: state.isPrivate ? state.roomPassword : undefined,
  }

  if (legacyMode.value) {
    emit('create', payload)
    emit('close')
    return
  }

  state.loading = true
  try {
    const response = await GameApi.createRoom(payload)
    const successful = await handleResponse(response, {
      ignoreAlertOnError: true,
      ignoreRedirectToLogin: true,
    })

    if (successful && response.data) {
      emit('created', {
        ...response.data,
        ...(state.isPrivate ? { password: state.roomPassword.trim() } : {}),
      })
      visible.value = false
      return
    }
    errors.form = response.message || '房间创建失败，请检查输入后重试。'
  } catch (error) {
    errors.form = getErrorMessage(error, '房间创建失败，请检查网络连接后重试。')
  } finally {
    state.loading = false
  }
}

function resetForm(): void {
  state.roomName = ''
  state.loading = false
  state.isPrivate = false
  state.roomPassword = ''
  state.showPassword = false
  state.selectedDifficulty = 'Beginner'
  errors.roomName = ''
  errors.roomPassword = ''
  errors.form = ''
}

function close(): void {
  if (isSubmitting.value) return
  modalVisible.value = false
}

function togglePrivate(): void {
  if (!state.isPrivate) {
    state.roomPassword = ''
    state.showPassword = false
    errors.roomPassword = ''
  } else {
    nextTick(() => passwordInput.value?.focus())
  }
}

function focusableElements(): HTMLElement[] {
  if (!dialogPanel.value) return []
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'summary',
    "[tabindex]:not([tabindex='-1'])",
  ].join(',')

  return Array.from(
    dialogPanel.value.querySelectorAll<HTMLElement>(selector)
  ).filter(
    (element) =>
      !element.hasAttribute('hidden') &&
      element.getAttribute('aria-hidden') !== 'true'
  )
}

function handleDialogKeydown(event: KeyboardEvent): void {
  if (!visible.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key !== 'Tab') return

  const elements = focusableElements()
  if (elements.length === 0) {
    event.preventDefault()
    return
  }

  const first = elements[0]
  const last = elements[elements.length - 1]
  const active = document.activeElement
  if (
    event.shiftKey &&
    (active === first || !dialogPanel.value?.contains(active))
  ) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

async function openDialog(): Promise<void> {
  returnFocusElement =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
  document.addEventListener('keydown', handleDialogKeydown)
  await nextTick()
  const modalRoot = dialogPanel.value?.closest<HTMLElement>("[role='dialog']")
  modalRoot?.setAttribute('aria-modal', 'true')
  modalRoot?.setAttribute('aria-labelledby', 'create-room-title')
  modalRoot?.setAttribute('aria-describedby', 'create-room-description')
  roomNameInput.value?.focus()
}

async function closeDialog(): Promise<void> {
  document.removeEventListener('keydown', handleDialogKeydown)
  resetForm()
  const elementToRestore = returnFocusElement
  returnFocusElement = null
  await nextTick()
  elementToRestore?.focus()
}

watch(visible, (isOpen) => {
  if (legacyMode.value) return
  if (isOpen) void openDialog()
  else void closeDialog()
})

onMounted(() => {
  if (legacyMode.value) void openDialog()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleDialogKeydown)
})
</script>

<template>
  <Modal
    v-model:visible="modalVisible"
    name="create-room"
    aria-label="创建房间"
  >
    <section ref="dialogPanel" class="create-room-panel">
      <header class="dialog-header">
        <p class="dialog-eyebrow">Open a Gathering</p>
        <h2 id="create-room-title">创建房间</h2>
        <p id="create-room-description">
          写下聚会名称与难度，其余规则可在进入魔典后继续设置。
        </p>
      </header>

      <form
        novalidate
        aria-describedby="create-room-description"
        @submit.prevent="createRoom"
      >
        <fieldset class="form-fields" :disabled="isSubmitting">
          <div class="form-field">
            <label for="create-room-name"
              >房间名称 <span aria-hidden="true">*</span></label
            >
            <input
              id="create-room-name"
              ref="roomNameInput"
              v-model="state.roomName"
              type="text"
              required
              maxlength="40"
              autocomplete="off"
              placeholder="例如：周末新手局"
              :aria-invalid="Boolean(errors.roomName)"
              :aria-describedby="
                errors.roomName
                  ? 'room-name-hint room-name-error'
                  : 'room-name-hint'
              "
              @input="clearError('roomName')"
              @blur="validateRoomName"
            />
            <p id="room-name-hint" class="field-hint">
              最多 40 个字符，玩家将在大厅中看到此名称。
            </p>
            <p
              v-if="errors.roomName"
              id="room-name-error"
              class="field-error"
              role="alert"
            >
              {{ errors.roomName }}
            </p>
          </div>

          <div class="form-field">
            <span id="difficulty-label" class="field-label">对局难度</span>
            <div
              class="difficulty-options"
              role="radiogroup"
              aria-labelledby="difficulty-label"
            >
              <label
                v-for="level in state.difficultyLevels"
                :key="level.value"
                class="difficulty-option"
                :class="{ selected: state.selectedDifficulty === level.value }"
              >
                <input
                  v-model="state.selectedDifficulty"
                  type="radio"
                  name="room-difficulty"
                  :value="level.value"
                  @change="errors.form = ''"
                />
                <span>{{ level.label }}</span>
              </label>
            </div>
            <p class="field-hint">{{ selectedDifficultyDescription }}</p>
          </div>

          <div class="privacy-section" :class="{ active: state.isPrivate }">
            <label class="privacy-toggle" for="create-room-private">
              <span>
                <strong>设为密码房</strong>
                <small>仅持有密码的玩家可以加入</small>
              </span>
              <input
                id="create-room-private"
                v-model="state.isPrivate"
                type="checkbox"
                @change="togglePrivate"
              />
              <span class="toggle-track" aria-hidden="true"><span></span></span>
            </label>

            <Transition name="reveal">
              <div v-if="state.isPrivate" class="form-field password-field">
                <label for="create-room-password"
                  >房间密码 <span aria-hidden="true">*</span></label
                >
                <div class="password-control">
                  <input
                    id="create-room-password"
                    ref="passwordInput"
                    v-model="state.roomPassword"
                    :type="state.showPassword ? 'text' : 'password'"
                    required
                    maxlength="80"
                    autocomplete="new-password"
                    placeholder="输入加入密码"
                    :aria-invalid="Boolean(errors.roomPassword)"
                    :aria-describedby="
                      errors.roomPassword
                        ? 'password-hint password-error'
                        : 'password-hint'
                    "
                    @input="clearError('roomPassword')"
                    @blur="validatePassword"
                  />
                  <button
                    type="button"
                    class="show-password"
                    :aria-pressed="state.showPassword"
                    :aria-label="state.showPassword ? '隐藏密码' : '显示密码'"
                    @click="state.showPassword = !state.showPassword"
                  >
                    {{ state.showPassword ? '隐藏' : '显示' }}
                  </button>
                </div>
                <p id="password-hint" class="field-hint">
                  密码不会显示在大厅中。
                </p>
                <p
                  v-if="errors.roomPassword"
                  id="password-error"
                  class="field-error"
                  role="alert"
                >
                  {{ errors.roomPassword }}
                </p>
              </div>
            </Transition>
          </div>
        </fieldset>

        <p v-if="errors.form" class="form-error" role="alert">
          {{ errors.form }}
        </p>

        <div class="form-actions">
          <button
            type="button"
            class="modal-button secondary"
            :disabled="isSubmitting"
            @click="close"
          >
            取消
          </button>
          <button
            type="submit"
            class="modal-button primary"
            :disabled="isSubmitting"
          >
            <span
              v-if="isSubmitting"
              class="button-spinner"
              aria-hidden="true"
            ></span>
            {{ isSubmitting ? '正在创建' : '创建并进入' }}
          </button>
        </div>
        <p class="submit-status" role="status" aria-live="polite">
          {{ isSubmitting ? '正在分配房间并获取进入授权，请稍候。' : '' }}
        </p>
      </form>
    </section>
  </Modal>
</template>

<style scoped lang="scss">
@use '../../vars.scss' as *;

:global(.modal-backdrop--create-room) {
  background:
    radial-gradient(
      circle at 50% 32%,
      rgba(126, 41, 49, 0.18),
      transparent 42%
    ),
    linear-gradient(rgba(6, 4, 8, 0.82), rgba(6, 4, 8, 0.94)),
    var(--ts-noise-stone);
  backdrop-filter: blur(8px) saturate(0.82);
}

:global(.modal.create-room) {
  --create-paper: #ead8b7;
  --create-paper-light: #fff6df;
  --create-paper-deep: #c9a875;
  --create-ink: #2b1b18;
  --create-ink-muted: #674b3d;
  --create-wine: #822d36;
  --create-wine-dark: #541a21;
  --create-gold: #b88942;
  --create-focus: var(--ts-focus-ring-on-parchment, #65242c);

  width: min(620px, calc(100vw - 28px));
  max-height: min(92dvh, 820px);
  padding: 0;
  overflow: auto;
  isolation: isolate;
  color: var(--create-ink);
  background-color: var(--create-paper);
  background-image:
    radial-gradient(
      circle at 0 0,
      rgba(130, 45, 54, 0.2),
      transparent 34%
    ),
    radial-gradient(
      circle at 100% 100%,
      rgba(92, 52, 31, 0.18),
      transparent 38%
    ),
    linear-gradient(
      90deg,
      rgba(92, 51, 30, 0.1),
      transparent 14%,
      transparent 86%,
      rgba(92, 51, 30, 0.1)
    ),
    linear-gradient(145deg, rgba(255, 248, 226, 0.9), rgba(224, 202, 165, 0.96)),
    var(--ts-noise-parchment);
  border: 1px solid var(--create-gold);
  border-radius: 16px;
  box-shadow:
    0 30px 100px rgba(0, 0, 0, 0.72),
    0 0 0 1px rgba(255, 231, 176, 0.12),
    inset 0 0 46px rgba(91, 54, 27, 0.16);
  backdrop-filter: none;
}

:global(.modal.create-room > .modal-ornament) {
  width: min(290px, 52%);
  background: linear-gradient(
    90deg,
    transparent,
    var(--create-wine),
    var(--create-gold),
    var(--create-wine),
    transparent
  );
  box-shadow: 0 0 18px rgba(130, 45, 54, 0.32);
}

:global(.modal.create-room > .top-right-buttons) {
  top: 14px;
  right: 14px;
}

:global(.modal.create-room > .top-right-buttons > .top-right-button) {
  color: var(--create-paper-light);
  background: linear-gradient(
    180deg,
    var(--create-wine),
    var(--create-wine-dark)
  );
  border-color: rgba(184, 137, 66, 0.82);
  border-radius: 50%;
  box-shadow:
    0 6px 16px rgba(69, 20, 26, 0.28),
    inset 0 1px rgba(255, 244, 216, 0.18);
}

:global(.modal.create-room > .top-right-buttons > .top-right-button:hover) {
  color: #fffaf0;
  background: linear-gradient(180deg, #9c3842, #671f27);
  border-color: var(--create-gold);
}

:global(.modal.create-room > .top-right-buttons > .top-right-button:focus-visible) {
  outline-color: var(--create-focus);
}

:global(.modal.create-room > .slot) {
  width: 100%;
  max-height: none;
  padding: 0;
}

.create-room-panel {
  position: relative;
  width: 100%;
  padding: clamp(26px, 5vw, 42px);
}

.create-room-panel
  :where(button, input, select, textarea, summary):focus-visible {
  outline-color: var(--ts-focus-ring-on-parchment, #65242c);
}

.create-room-panel::before,
.create-room-panel::after {
  position: absolute;
  right: 28px;
  left: 28px;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(91, 51, 34, 0.5),
    transparent
  );
  content: '';
}

.create-room-panel::before {
  top: 18px;
}
.create-room-panel::after {
  bottom: 18px;
}

.dialog-header {
  padding-right: 54px;
  margin-bottom: 26px;
}

.dialog-eyebrow {
  margin: 0 0 7px;
  color: #7c4a30;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.17em;
  text-transform: uppercase;
}

.dialog-header h2 {
  margin: 0;
  color: #3a231d;
  font-family: var(--ts-font-heading, serif);
  font-size: clamp(1.75rem, 4vw, 2.35rem);
}

.dialog-header p:last-child {
  max-width: 470px;
  margin: 9px 0 0;
  color: #72594a;
  line-height: 1.6;
}

.form-fields {
  display: grid;
  gap: 22px;
  min-width: 0;
  padding: 0;
  margin: 0;
  border: 0;
}

.form-field {
  display: grid;
  gap: 7px;
}

.form-field label,
.field-label {
  color: #432920;
  font-size: 0.88rem;
  font-weight: 800;
}

.form-field label span {
  color: var(--ts-accent-crimson, #8e2f36);
}

.form-field input {
  width: 100%;
  min-height: 48px;
  padding: 10px 13px;
  color: var(--ts-text-on-parchment, #2a1b18);
  background: rgba(255, 253, 244, 0.62);
  border: 1px solid #a98860;
  border-radius: var(--ts-radius-sm, 6px);
  box-shadow: inset 0 2px 5px rgba(75, 41, 25, 0.08);
}

.form-field input::placeholder {
  color: #6f5547;
}

.form-field input:focus {
  border-color: #76502f;
  outline: 3px solid var(--ts-focus-ring-on-parchment, #65242c);
  outline-offset: 1px;
}

.form-field input[aria-invalid='true'] {
  border-color: var(--ts-accent-crimson, #8e2f36);
  box-shadow: 0 0 0 2px rgba(142, 47, 54, 0.12);
}

.field-hint,
.field-error,
.form-error,
.submit-status {
  margin: 0;
  font-size: 0.76rem;
  line-height: 1.5;
}

.field-hint {
  color: #62493d;
}

.field-error,
.form-error {
  color: #7c1f28;
  font-weight: 700;
}

.form-error {
  padding: 10px 12px;
  margin-top: 18px;
  background: rgba(142, 47, 54, 0.1);
  border: 1px solid rgba(142, 47, 54, 0.32);
  border-radius: var(--ts-radius-sm, 6px);
}

.difficulty-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 9px;
}

.difficulty-option {
  position: relative;
  cursor: pointer;
}

.difficulty-option input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.difficulty-option > span {
  display: flex;
  min-height: 46px;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  color: #5b4033;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(91, 51, 34, 0.28);
  border-radius: var(--ts-radius-sm, 6px);
  font-weight: 800;
}

.difficulty-option:hover input:not(:disabled) + span,
.difficulty-option.selected > span {
  color: #fff6e8;
  background: #75404a;
  border-color: var(--ts-accent-crimson, #8e2f36);
  box-shadow: 0 5px 12px rgba(84, 29, 35, 0.18);
}

.difficulty-option input:focus-visible + span {
  outline: 3px solid var(--ts-focus-ring-on-parchment, #65242c);
  outline-offset: 2px;
}

.difficulty-option input:disabled + span {
  cursor: not-allowed;
  opacity: 0.55;
}

.privacy-section {
  padding: 14px;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(91, 51, 34, 0.22);
  border-radius: var(--ts-radius-md, 10px);
  transition:
    background-color var(--ts-motion-fast, 160ms) ease,
    border-color var(--ts-motion-fast, 160ms) ease;
}

.privacy-section.active {
  background: rgba(142, 47, 54, 0.075);
  border-color: rgba(142, 47, 54, 0.38);
}

.privacy-toggle {
  position: relative;
  display: flex;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  cursor: pointer;
}

.privacy-toggle > span:first-child {
  display: grid;
  gap: 3px;
}

.privacy-toggle strong {
  color: #432920;
  font-size: 0.88rem;
}

.privacy-toggle small {
  color: #664d40;
  font-size: 0.74rem;
}

.privacy-toggle input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.toggle-track {
  position: relative;
  width: 48px;
  height: 28px;
  flex: 0 0 auto;
  background: #a58e79;
  border: 1px solid #846b55;
  border-radius: 999px;
  transition: background-color var(--ts-motion-fast, 160ms) ease;
}

.toggle-track span {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  background: #fff8ea;
  border-radius: 50%;
  box-shadow: 0 2px 5px rgba(54, 29, 20, 0.28);
  transition: transform var(--ts-motion-fast, 160ms)
    var(--ts-ease-out, ease-out);
}

.privacy-toggle input:checked + .toggle-track {
  background: var(--ts-accent-crimson, #8e2f36);
  border-color: #70232a;
}

.privacy-toggle input:checked + .toggle-track span {
  transform: translateX(20px);
}

.privacy-toggle input:focus-visible + .toggle-track {
  outline: 3px solid var(--ts-focus-ring-on-parchment, #65242c);
  outline-offset: 3px;
}

.password-field {
  padding-top: 15px;
  margin-top: 13px;
  border-top: 1px solid rgba(91, 51, 34, 0.18);
}

.password-control {
  position: relative;
}

.password-control input {
  padding-right: 76px;
}

.show-password {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 66px;
  min-height: 44px;
  color: #6e4534;
  background: transparent;
  border: 0;
  border-left: 1px solid rgba(91, 51, 34, 0.2);
  cursor: pointer;
  font-weight: 700;
}

.form-actions {
  display: grid;
  grid-template-columns: minmax(120px, 0.72fr) minmax(180px, 1.28fr);
  gap: 12px;
  margin-top: 26px;
}

.modal-button {
  min-height: 48px;
  padding: 10px 18px;
  border-radius: var(--ts-radius-sm, 6px);
  cursor: pointer;
  font-weight: 850;
}

.modal-button.secondary {
  color: #53352a;
  background: rgba(255, 255, 255, 0.22);
  border: 1px solid rgba(91, 51, 34, 0.36);
}

.modal-button.primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: #fff6e8;
  background: linear-gradient(180deg, var(--ts-accent-crimson-hover, #a63c45), #70232a);
  border: 1px solid #612027;
  box-shadow: 0 8px 18px rgba(86, 26, 31, 0.24);
}

.modal-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.modal-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.button-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.34);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
}

.submit-status {
  min-height: 1.4em;
  margin-top: 8px;
  color: #62463c;
  text-align: right;
}

.reveal-enter-active,
.reveal-leave-active {
  transition:
    opacity var(--ts-motion-fast, 160ms) ease,
    transform var(--ts-motion-fast, 160ms) ease;
}

.reveal-enter-from,
.reveal-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 560px) {
  :global(.modal.create-room) {
    width: calc(100vw - 16px);
    max-height: calc(100dvh - 16px);
    border-right: 1px solid var(--create-gold);
    border-bottom: 0;
    border-left: 1px solid var(--create-gold);
    border-radius: 16px 16px 0 0;
  }

  .create-room-panel {
    padding: 28px 20px 24px;
  }

  .dialog-header {
    padding-right: 48px;
  }

  .difficulty-options,
  .form-actions {
    grid-template-columns: 1fr;
  }

  .privacy-toggle {
    align-items: flex-start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .button-spinner {
    animation: none;
  }

  .privacy-section,
  .toggle-track,
  .toggle-track span,
  .reveal-enter-active,
  .reveal-leave-active,
  .modal-button {
    transition: none;
  }
}
</style>

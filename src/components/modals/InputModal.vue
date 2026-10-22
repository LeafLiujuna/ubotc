<template>
  <Modal
    ref="modalRef"
    v-if="isVisible"
    name="input"
    size="sm"
    :visible="isVisible"
    :title="dialogHeading"
    :type="effectiveMode"
    :close-on-backdrop="!submitting"
    @close="finishDismissal"
  >
    <form class="input-dialog" :class="`input-dialog--${effectiveMode}`" @submit.prevent="onConfirm">
      <div
        v-if="effectiveMode !== 'input'"
        class="input-dialog__message"
        :class="{ 'input-dialog__message--danger': isDestructive }"
      >
        <span class="input-dialog__message-icon" aria-hidden="true">
          <font-awesome-icon :icon="['fas', isDestructive ? 'triangle-exclamation' : 'circle-info']" />
        </span>
        <p>{{ effectiveTitles[0] }}</p>
      </div>

      <div v-else class="input-dialog__fields">
        <label v-for="(_, index) in fieldCount" :key="index" class="input-dialog__field">
          <span>{{ effectiveTitles[index] || `输入项 ${index + 1}` }}</span>
          <input
            :id="`dialog-input-${index}`"
            v-model="inputs[index]"
            :type="effectiveInputTypes[index] || 'text'"
            :placeholder="effectivePlaceholders[index] || ''"
            :inputmode="legacyNumericInput ? 'decimal' : undefined"
            :aria-invalid="Boolean(warning)"
            :aria-describedby="warning ? 'input-dialog-warning' : undefined"
            autocomplete="off"
            @focus="$emit('typing', true)"
            @blur="$emit('typing', false)"
          />
        </label>
      </div>

      <p v-if="warning" id="input-dialog-warning" class="input-dialog__warning" role="alert">
        <font-awesome-icon :icon="['fas', 'circle-exclamation']" aria-hidden="true" />
        <span>{{ warning }}</span>
      </p>

      <footer class="input-dialog__actions">
        <button
          v-if="effectiveMode !== 'text'"
          type="button"
          class="ts-button ts-button--ghost"
          :disabled="submitting"
          @click="requestCancel"
        >
          取消
        </button>
        <button
          ref="confirmBtn"
          type="submit"
          class="ts-button"
          :class="isDestructive ? 'ts-button--danger' : 'ts-button--primary'"
          :disabled="submitting"
        >
          <font-awesome-icon
            v-if="submitting"
            class="input-dialog__spinner"
            :icon="['fas', 'spinner']"
            spin
            aria-hidden="true"
          />
          <span>{{ confirmLabel }}</span>
        </button>
      </footer>
    </form>
  </Modal>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import type { InputDialogMode } from "@/composables/useInputDialog";
import { useAppStore } from "@/stores/app";
import { useSessionStore } from "@/stores/session";
import Modal from "./Modal.vue";

type LegacyInputData = {
  name?: unknown;
  placeholder?: unknown;
  length?: unknown;
  allowEmpty?: unknown;
  inputTypes?: unknown;
};

const props = withDefaults(defineProps<{
  visible?: boolean;
  mode?: InputDialogMode;
  titles?: string[];
  placeholders?: string[];
  allowEmpty?: boolean;
  inputTypes?: string[];
  validate?: ((values: string[]) => string | null) | null;
}>(), {
  visible: false,
  mode: "input",
  titles: () => [""],
  placeholders: () => [""],
  allowEmpty: false,
  inputTypes: () => [],
  validate: null,
});

const emit = defineEmits<{
  confirm: [value: unknown];
  cancel: [];
  typing: [isTyping: boolean];
}>();

const appStore = useAppStore();
const sessionStore = useSessionStore();
const { modals } = storeToRefs(appStore);

const inputs = ref<string[]>([""]);
const warning = ref("");
const submitting = ref(false);
const confirmBtn = ref<HTMLButtonElement | null>(null);
const modalRef = ref<InstanceType<typeof Modal> | null>(null);
const pendingResult = ref<{ confirmed: true; value: unknown } | null>(null);

const legacyData = computed(() => (sessionStore.inputData || {}) as LegacyInputData);
const isLegacyDialog = computed(() => !props.visible && Boolean(modals.value.input));
const isVisible = computed(() => props.visible || Boolean(modals.value.input));

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item ?? ""));
  if (value === null || value === undefined) return [];
  return [String(value)];
}

function normalizeLegacyMode(value: string): InputDialogMode {
  if (value === "confirm") return "confirm";
  if (value === "text" || value === "alert") return "text";
  return "input";
}

const effectiveMode = computed<InputDialogMode>(() =>
  isLegacyDialog.value ? normalizeLegacyMode(sessionStore.inputModal) : props.mode,
);

const legacyTitles = computed(() => asStringList(legacyData.value.name));
const legacyPlaceholders = computed(() => asStringList(legacyData.value.placeholder));

const fieldCount = computed(() => {
  if (effectiveMode.value !== "input") return 0;
  if (!isLegacyDialog.value) {
    return Math.max(1, props.titles.length, props.placeholders.length, props.inputTypes.length);
  }

  const requested = Number(legacyData.value.length);
  return Math.max(
    1,
    Number.isFinite(requested) && requested > 0 ? Math.trunc(requested) : 0,
    legacyTitles.value.length,
    legacyPlaceholders.value.length,
  );
});

function pad(values: string[], length: number, fallback = ""): string[] {
  return Array.from({ length }, (_, index) => values[index] ?? fallback);
}

const effectiveTitles = computed(() => {
  const values = isLegacyDialog.value ? legacyTitles.value : props.titles;
  const length = effectiveMode.value === "input" ? fieldCount.value : 1;
  return pad(values, Math.max(1, length));
});

const effectivePlaceholders = computed(() => {
  const values = isLegacyDialog.value ? legacyPlaceholders.value : props.placeholders;
  return pad(values, Math.max(1, fieldCount.value));
});

const effectiveInputTypes = computed(() => {
  const legacyTypes = asStringList(legacyData.value.inputTypes);
  return pad(isLegacyDialog.value ? legacyTypes : props.inputTypes, Math.max(1, fieldCount.value), "text");
});

const allowEmpty = computed(() =>
  isLegacyDialog.value ? Boolean(legacyData.value.allowEmpty) : props.allowEmpty,
);

const legacyNumericInput = computed(() =>
  isLegacyDialog.value && ["seatNum", "timer"].includes(sessionStore.inputType),
);

const promptText = computed(() => effectiveTitles.value.join(" "));
const isDestructive = computed(() =>
  /删除|清空|移除|离开|返回大厅|放弃|重置|解散/.test(promptText.value),
);

const dialogHeading = computed(() => {
  if (effectiveMode.value === "input") return "输入信息";
  if (effectiveMode.value === "text") return "提示";
  return isDestructive.value ? "确认危险操作" : "请确认";
});

const confirmLabel = computed(() => {
  if (effectiveMode.value === "text") return "知道了";
  if (isDestructive.value) return "确认执行";
  return "确认";
});

watch(
  [isVisible, effectivePlaceholders, fieldCount],
  async ([show]) => {
    if (!show) {
      submitting.value = false;
      pendingResult.value = null;
      warning.value = "";
      return;
    }

    inputs.value = pad(effectivePlaceholders.value, Math.max(1, fieldCount.value));
    warning.value = "";
    submitting.value = false;
    await nextTick();

    if (effectiveMode.value === "input") {
      document.getElementById("dialog-input-0")?.focus();
    } else {
      confirmBtn.value?.focus();
    }
  },
  { immediate: true },
);

function closeLegacyDialog(): void {
  sessionStore.setTyping(false);
  sessionStore.clearInputHandlers();
  if (modals.value.input) appStore.toggleModal("input");
}

function finish(value: unknown): void {
  if (isLegacyDialog.value) {
    const resolver = sessionStore.inputResolver;
    resolver?.(value);
    closeLegacyDialog();
    return;
  }

  emit("confirm", value);
}

function requestConfirm(value: unknown): void {
  submitting.value = true;
  pendingResult.value = { confirmed: true, value };
  if (modalRef.value) {
    modalRef.value.close();
  } else {
    finishDismissal();
  }
}

function onConfirm(): void {
  if (submitting.value) return;

  if (effectiveMode.value === "input") {
    const values = pad(inputs.value, fieldCount.value);
    if (!allowEmpty.value && values.some((value) => value.trim() === "")) {
      warning.value = "请完成所有必填项。";
      nextTick(() => document.getElementById("dialog-input-0")?.focus());
      return;
    }

    if (!isLegacyDialog.value && props.validate) {
      const error = props.validate(values);
      if (error) {
        warning.value = error;
        nextTick(() => document.getElementById("dialog-input-0")?.focus());
        return;
      }
    }

    requestConfirm(values);
    return;
  }

  requestConfirm(true);
}

function requestCancel(): void {
  if (submitting.value) return;

  if (modalRef.value) {
    modalRef.value.close();
  } else {
    finishDismissal();
  }
}

function finishDismissal(): void {
  const result = pendingResult.value;
  pendingResult.value = null;
  if (result?.confirmed) {
    finish(result.value);
    return;
  }

  if (isLegacyDialog.value) {
    const rejecter = sessionStore.inputRejecter;
    rejecter?.(null);
    closeLegacyDialog();
    return;
  }

  emit("cancel");
}

defineExpose({ close: requestCancel });
</script>

<style scoped lang="scss">
.input-dialog {
  display: grid;
  gap: var(--ts-space-4);
  width: min(440px, calc(100vw - 48px));
}

.input-dialog__fields {
  display: grid;
  gap: var(--ts-space-3);
}

.input-dialog__field {
  display: grid;
  gap: var(--ts-space-2);

  > span {
    color: var(--ts-text-primary);
    font-size: 0.9rem;
    font-weight: 700;
  }

  input {
    width: 100%;
    min-height: 48px;
    padding: 10px 13px;
    color: var(--ts-text-primary);
    background: rgba(7, 5, 11, 0.7);
    border: 1px solid rgba(214, 184, 106, 0.3);
    border-radius: var(--ts-radius-sm);
    font: inherit;
    box-sizing: border-box;
    transition:
      border-color var(--ts-motion-fast) ease,
      box-shadow var(--ts-motion-fast) ease;

    &::placeholder {
      color: var(--ts-text-subtle);
    }

    &:focus {
      border-color: var(--ts-accent-gold);
      box-shadow: 0 0 0 3px rgba(240, 217, 144, 0.17);
      outline: none;
    }
  }
}

.input-dialog__message {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: center;
  gap: var(--ts-space-3);
  min-height: 76px;
  padding: var(--ts-space-3);
  color: var(--ts-text-primary);
  background: rgba(214, 184, 106, 0.075);
  border: 1px solid rgba(214, 184, 106, 0.2);
  border-radius: var(--ts-radius-md);

  p {
    margin: 0;
    font-size: 0.96rem;
    line-height: 1.65;
  }
}

.input-dialog__message--danger {
  background: rgba(142, 47, 54, 0.15);
  border-color: rgba(198, 90, 99, 0.46);

  .input-dialog__message-icon {
    color: var(--ts-danger);
    border-color: rgba(198, 90, 99, 0.44);
  }
}

.input-dialog__message-icon {
  display: inline-flex;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  color: var(--ts-accent-gold);
  border: 1px solid rgba(214, 184, 106, 0.28);
  border-radius: 50%;
}

.input-dialog__warning {
  display: flex;
  align-items: flex-start;
  gap: var(--ts-space-2);
  margin: 0;
  padding: 10px 12px;
  color: var(--ts-danger);
  background: rgba(142, 47, 54, 0.16);
  border: 1px solid rgba(198, 90, 99, 0.42);
  border-radius: var(--ts-radius-sm);
  font-size: 0.84rem;
  line-height: 1.45;
}

.input-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--ts-space-2);
  padding-top: var(--ts-space-1);
}

.input-dialog__spinner {
  margin-right: 7px;
}

@media (max-width: 520px) {
  .input-dialog {
    width: 100%;
  }

  .input-dialog__actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));

    .ts-button:only-child {
      grid-column: 1 / -1;
    }
  }
}
</style>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type {
  NightActionResolutionEffect,
  ServerNightActionRecord,
} from "@/types/socket";

export type NightActionCandidate = {
  id: string;
  name: string;
  seat: number;
  isDead: boolean;
  connected: boolean;
};

const props = withDefaults(defineProps<{
  actionId: string;
  roleName: string;
  candidates: NightActionCandidate[];
  record?: ServerNightActionRecord | null;
  maxTargets?: number;
  excludedUserIds?: string[];
  disabled?: boolean;
  saveRecord: (payload: { targetUserIds: string[]; result: string }) => Promise<boolean>;
  suggestedEffect?: NightActionResolutionEffect["type"] | null;
  resolveRecord?: (effects: NightActionResolutionEffect[]) => Promise<boolean>;
}>(), {
  record: null,
  maxTargets: 0,
  excludedUserIds: () => [],
  disabled: false,
  suggestedEffect: null,
  resolveRecord: undefined,
});

const editing = ref(false);
const saving = ref(false);
const resolving = ref(false);
const confirmingResolution = ref(false);
const editButton = ref<HTMLButtonElement | null>(null);
const resolutionButton = ref<HTMLButtonElement | null>(null);
const resolutionCancelButton = ref<HTMLButtonElement | null>(null);
const selectedTargetIds = ref<string[]>([]);
const result = ref("");
const errorMessage = ref("");
const resolutionError = ref("");

const safeId = computed(() => props.actionId.replace(/[^A-Za-z0-9_-]/g, "-"));
const excludedUserIdSet = computed(() => new Set(props.excludedUserIds));
const candidateById = computed(() => new Map(
  props.candidates.map((candidate) => [candidate.id, candidate]),
));
const selectedCandidates = computed(() => props.record?.targetUserIds
  .map((userId) => candidateById.value.get(userId) ?? {
    id: userId,
    name: "已离席玩家",
    seat: 0,
    isDead: false,
    connected: false,
  }) ?? []);
const hasRecord = computed(() => (
  Boolean(props.record?.targetUserIds.length) || Boolean(props.record?.result)
));
const controlsDisabled = computed(() => props.disabled || saving.value);
const resolutionDisabled = computed(() => (
  props.disabled || saving.value || resolving.value
));
function effectMetaForType(type: NightActionResolutionEffect["type"]) {
  if (type === "poisoned") {
    return {
      label: "中毒影响",
      action: "记录中毒影响",
      icon: "triangle-exclamation",
      tone: "poisoned",
      description: "仅记录为说书人可见的裁定，不自动修改角色能力结果。",
    };
  }
  if (type === "protected") {
    return {
      label: "受到保护",
      action: "记录保护状态",
      icon: "lock",
      tone: "protected",
      description: "仅记录本夜保护，不自动阻止死亡，最终结果仍由说书人裁定。",
    };
  }
  return {
    label: "今夜死亡",
    action: "标记目标死亡",
    icon: "skull",
    tone: "dead",
    description: "将立即同步死亡状态并保留一次鬼票；不会自动处理士兵、僧侣、镇长、红唇女郎或转生规则。",
  };
}
const effectMeta = computed(() => effectMetaForType(props.suggestedEffect ?? "dead"));
const canOfferResolution = computed(() => Boolean(
  props.suggestedEffect
  && props.resolveRecord
  && props.record?.targetUserIds.length,
));
const resolvedEffects = computed(() => props.record?.resolution?.effects ?? []);
const resolvedEffectItems = computed(() => resolvedEffects.value.map((effect) => ({
  ...effect,
  candidate: candidateById.value.get(effect.targetUserId) ?? {
    id: effect.targetUserId,
    name: "已离席玩家",
    seat: 0,
    isDead: effect.type === "dead",
    connected: false,
  },
})));

function resolvedEffectLabel(effect: (typeof resolvedEffectItems.value)[number]): string {
  const seat = effect.candidate.seat ? `${effect.candidate.seat} · ` : "";
  return `${seat}${effect.candidate.name} · ${effectMetaForType(effect.type).label}`;
}

function syncDraft(): void {
  selectedTargetIds.value = [...(props.record?.targetUserIds ?? [])];
  result.value = props.record?.result ?? "";
  errorMessage.value = "";
}

function openEditor(): void {
  if (controlsDisabled.value) return;
  confirmingResolution.value = false;
  resolutionError.value = "";
  syncDraft();
  editing.value = true;
}

function restoreEditButtonFocus(): void {
  void nextTick(() => editButton.value?.focus());
}

function cancelEditor(returnFocus = false): void {
  if (saving.value) return;
  syncDraft();
  editing.value = false;
  if (returnFocus) restoreEditButtonFocus();
}

function handleEditorEscape(): void {
  cancelEditor(true);
}

function openResolution(): void {
  if (resolutionDisabled.value || !canOfferResolution.value) return;
  if (editing.value) cancelEditor();
  resolutionError.value = "";
  confirmingResolution.value = true;
  void nextTick(() => resolutionCancelButton.value?.focus());
}

function cancelResolution(returnFocus = false): void {
  if (resolving.value) return;
  confirmingResolution.value = false;
  resolutionError.value = "";
  if (returnFocus) {
    void nextTick(() => resolutionButton.value?.focus());
  }
}

async function confirmResolution(): Promise<void> {
  if (
    resolutionDisabled.value
    || !props.suggestedEffect
    || !props.resolveRecord
    || !props.record?.targetUserIds.length
  ) return;

  resolving.value = true;
  resolutionError.value = "";
  try {
    const resolved = await props.resolveRecord(
      props.record.targetUserIds.map((targetUserId) => ({
        targetUserId,
        type: props.suggestedEffect!,
      })),
    );
    if (resolved) {
      confirmingResolution.value = false;
      void nextTick(() => resolutionButton.value?.focus());
    } else {
      resolutionError.value = "结算失败，请检查连接后重试。";
    }
  } catch {
    resolutionError.value = "结算失败，请检查连接后重试。";
  } finally {
    resolving.value = false;
  }
}

function isSelected(userId: string): boolean {
  return selectedTargetIds.value.includes(userId);
}

function isCandidateDisabled(candidate: NightActionCandidate): boolean {
  if (controlsDisabled.value || excludedUserIdSet.value.has(candidate.id)) return true;
  return !isSelected(candidate.id)
    && selectedTargetIds.value.length >= props.maxTargets;
}

function toggleTarget(candidate: NightActionCandidate): void {
  if (isCandidateDisabled(candidate)) return;
  if (isSelected(candidate.id)) {
    selectedTargetIds.value = selectedTargetIds.value.filter((id) => id !== candidate.id);
    return;
  }
  if (props.maxTargets === 1) {
    selectedTargetIds.value = [candidate.id];
    return;
  }
  selectedTargetIds.value = [...selectedTargetIds.value, candidate.id];
}

async function save(): Promise<void> {
  if (controlsDisabled.value) return;
  const normalizedResult = result.value.trim();
  if (normalizedResult.length > 500) {
    errorMessage.value = "行动结果最多 500 个字符。";
    return;
  }

  saving.value = true;
  errorMessage.value = "";
  try {
    try {
      const saved = await props.saveRecord({
        targetUserIds: [...selectedTargetIds.value],
        result: normalizedResult,
      });
      if (saved) {
        editing.value = false;
        restoreEditButtonFocus();
      } else {
        errorMessage.value = "保存失败，请检查连接后重试。";
      }
    } catch {
      errorMessage.value = "保存失败，请检查连接后重试。";
    }
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.record,
  () => {
    if (!editing.value) syncDraft();
    if (!resolving.value) confirmingResolution.value = false;
  },
  { deep: true, immediate: true },
);
</script>

<template>
  <section class="night-action-editor" :aria-label="`${roleName}行动记录`">
    <div class="night-action-editor__summary">
      <div class="night-action-editor__copy">
        <span class="night-action-editor__eyebrow">行动记录</span>
        <div v-if="hasRecord" class="night-action-editor__details" aria-live="polite">
          <span
            v-for="candidate in selectedCandidates"
            :key="candidate.id"
            class="night-action-editor__chip"
            :class="{ 'is-dead': candidate.isDead }"
          >
            <template v-if="candidate.seat">{{ candidate.seat }} · </template>{{ candidate.name }}
          </span>
          <span v-if="record?.result" class="night-action-editor__result">
            {{ record.result }}
          </span>
        </div>
        <small v-else>尚未记录目标或结果</small>
      </div>
      <button
        ref="editButton"
        type="button"
        class="night-action-editor__edit"
        :disabled="controlsDisabled"
        :aria-expanded="editing"
        :aria-controls="`night-action-editor-${safeId}`"
        :data-testid="`night-record-edit-${actionId}`"
        @click="editing ? cancelEditor() : openEditor()"
      >
        <font-awesome-icon :icon="editing ? 'xmark' : 'pen-to-square'" aria-hidden="true" />
        <span>{{ editing ? "取消" : hasRecord ? "编辑" : "记录" }}</span>
      </button>
    </div>

    <div
      v-if="canOfferResolution || resolvedEffectItems.length"
      class="night-action-editor__resolution"
    >
      <div
        v-if="resolvedEffectItems.length"
        class="night-action-editor__resolved"
        :data-testid="`night-resolution-status-${actionId}`"
        aria-live="polite"
      >
        <span class="night-action-editor__eyebrow">已结算影响</span>
        <div class="night-action-editor__effect-list">
          <span
            v-for="effect in resolvedEffectItems"
            :key="`${effect.targetUserId}-${effect.type}`"
            class="night-action-editor__effect-chip"
            :class="`is-${effect.type}`"
          >
            <font-awesome-icon
              :icon="effectMetaForType(effect.type).icon"
              aria-hidden="true"
            />
            <span>{{ resolvedEffectLabel(effect) }}</span>
          </span>
        </div>
      </div>

      <button
        v-if="canOfferResolution"
        ref="resolutionButton"
        type="button"
        class="night-action-editor__resolve"
        :class="`is-${effectMeta.tone}`"
        :disabled="resolutionDisabled"
        :aria-expanded="confirmingResolution"
        :aria-controls="`night-action-resolution-${safeId}`"
        :data-testid="`night-resolution-open-${actionId}`"
        @click="confirmingResolution ? cancelResolution() : openResolution()"
      >
        <font-awesome-icon :icon="effectMeta.icon" aria-hidden="true" />
        <span>{{ resolvedEffectItems.length ? "重新结算" : effectMeta.action }}</span>
      </button>

      <div
        v-if="confirmingResolution"
        :id="`night-action-resolution-${safeId}`"
        class="night-action-editor__resolution-confirm"
        :class="`is-${effectMeta.tone}`"
        role="group"
        :aria-labelledby="`night-action-resolution-title-${safeId}`"
        :aria-describedby="`night-action-resolution-description-${safeId}`"
        @keydown.esc.stop.prevent="cancelResolution(true)"
      >
        <div class="night-action-editor__resolution-copy">
          <font-awesome-icon :icon="effectMeta.icon" aria-hidden="true" />
          <div>
            <strong :id="`night-action-resolution-title-${safeId}`">
              确认{{ effectMeta.label }}
            </strong>
            <p :id="`night-action-resolution-description-${safeId}`">
              {{ effectMeta.description }}
            </p>
          </div>
        </div>
        <ul class="night-action-editor__resolution-targets" aria-label="本次结算目标">
          <li v-for="candidate in selectedCandidates" :key="candidate.id">
            <span v-if="candidate.seat" class="night-action-editor__seat">{{ candidate.seat }}</span>
            <span>{{ candidate.name }}</span>
          </li>
        </ul>
        <p v-if="effectMeta.tone === 'dead'" class="night-action-editor__death-warning">
          <font-awesome-icon icon="triangle-exclamation" aria-hidden="true" />
          此操作会立即改变公开存活状态，请先完成保护、士兵等规则裁定。
        </p>
        <p
          v-if="resolutionError"
          class="night-action-editor__resolution-error"
          role="alert"
        >
          {{ resolutionError }}
        </p>
        <div class="night-action-editor__resolution-footer">
          <button
            ref="resolutionCancelButton"
            type="button"
            class="night-action-editor__resolution-cancel"
            :disabled="resolving"
            :data-testid="`night-resolution-cancel-${actionId}`"
            @click="cancelResolution(true)"
          >
            取消
          </button>
          <button
            type="button"
            class="night-action-editor__resolution-submit"
            :class="`is-${effectMeta.tone}`"
            :disabled="resolutionDisabled"
            :data-testid="`night-resolution-confirm-${actionId}`"
            @click="confirmResolution"
          >
            <font-awesome-icon
              :icon="resolving ? 'spinner' : effectMeta.icon"
              :spin="resolving"
              aria-hidden="true"
            />
            <span>{{ resolving ? "结算中" : `确认${effectMeta.label}` }}</span>
          </button>
        </div>
      </div>
    </div>

    <form
      v-if="editing"
      :id="`night-action-editor-${safeId}`"
      class="night-action-editor__form"
      @keydown.esc.stop.prevent="handleEditorEscape"
      @submit.prevent="save"
    >
      <fieldset v-if="maxTargets > 0" class="night-action-editor__targets">
        <legend>选择目标</legend>
        <p>
          最多 {{ maxTargets }} 名，可留空。
          <span v-if="excludedUserIds.length">该角色不能选择自己。</span>
        </p>
        <div class="night-action-editor__target-grid">
          <button
            v-for="candidate in candidates"
            :key="candidate.id"
            type="button"
            :class="[
              'night-action-editor__target',
              { 'is-selected': isSelected(candidate.id), 'is-dead': candidate.isDead },
            ]"
            :aria-pressed="isSelected(candidate.id)"
            :disabled="isCandidateDisabled(candidate)"
            :title="excludedUserIdSet.has(candidate.id) ? '该角色不能选择自己' : undefined"
            :data-testid="`night-target-${actionId}-${candidate.id}`"
            @click="toggleTarget(candidate)"
          >
            <span class="night-action-editor__seat">{{ candidate.seat }}</span>
            <span>
              <strong>{{ candidate.name }}</strong>
              <small>{{ candidate.isDead ? "已死亡" : candidate.connected ? "存活" : "离线" }}</small>
            </span>
            <font-awesome-icon v-if="isSelected(candidate.id)" icon="check" aria-hidden="true" />
          </button>
        </div>
      </fieldset>

      <label class="night-action-editor__label" :for="`night-action-result-${safeId}`">
        说书人结果
        <small>仅说书人可见，可记录数字、身份或裁定。</small>
      </label>
      <textarea
        :id="`night-action-result-${safeId}`"
        v-model="result"
        rows="3"
        maxlength="500"
        :disabled="controlsDisabled"
        :data-testid="`night-result-${actionId}`"
        placeholder="例如：结果为 1；展示厨师身份；本夜不触发。"
      ></textarea>
      <div class="night-action-editor__form-footer">
        <span :class="{ 'is-error': errorMessage }" role="status" aria-live="polite">
          {{ errorMessage || `${result.length} / 500` }}
        </span>
        <button
          type="submit"
          class="night-action-editor__save"
          :disabled="controlsDisabled"
          :data-testid="`night-record-save-${actionId}`"
        >
          <font-awesome-icon :icon="saving ? 'spinner' : 'check'" :spin="saving" aria-hidden="true" />
          <span>{{ saving ? "保存中" : "保存记录" }}</span>
        </button>
      </div>
    </form>
  </section>
</template>

<style scoped lang="scss">
.night-action-editor {
  min-width: 0;
  margin-top: 4px;
  color: #4d3a31;
  background: rgba(255, 255, 255, 0.28);
  border: 1px solid rgba(109, 77, 59, 0.24);
  border-radius: var(--ts-radius-md, 10px);
}

.night-action-editor__summary {
  min-height: 48px;
  padding: 5px 6px 5px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.night-action-editor__copy {
  min-width: 0;
  display: grid;
  gap: 3px;

  > small {
    color: #6a5549;
    font-size: 0.74rem;
  }
}

.night-action-editor__eyebrow {
  color: #6a5549;
  font-size: 0.7rem;
  font-weight: 900;
  letter-spacing: 0.08em;
}

.night-action-editor__details {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.night-action-editor__chip {
  padding: 3px 7px;
  color: #28553a;
  background: rgba(80, 146, 104, 0.13);
  border: 1px solid rgba(52, 125, 80, 0.34);
  border-radius: var(--ts-radius-pill, 999px);
  font-size: 0.72rem;
  font-weight: 900;

  &.is-dead {
    color: #765d58;
    text-decoration: line-through;
  }
}

.night-action-editor__result {
  min-width: 0;
  overflow: hidden;
  color: #5c292d;
  font-size: 0.76rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.night-action-editor__edit,
.night-action-editor__save,
.night-action-editor__resolve,
.night-action-editor__resolution-cancel,
.night-action-editor__resolution-submit {
  min-height: 44px;
  padding: 7px 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: var(--ts-radius-md, 10px);
  cursor: pointer;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 900;
  touch-action: manipulation;
  transition:
    background-color 180ms ease-out,
    border-color 180ms ease-out,
    color 180ms ease-out,
    opacity 180ms ease-out;

  &:active:not(:disabled) {
    opacity: 0.76;
  }

  &:focus-visible {
    outline: 3px solid var(--ts-focus-ring, #8e652d);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.52;
  }
}

.night-action-editor__edit {
  flex: 0 0 auto;
  color: #5c292d;
  background: rgba(255, 255, 255, 0.48);
  border: 1px solid rgba(109, 77, 59, 0.34);
}

.night-action-editor__resolution {
  padding: 8px 10px 10px;
  display: grid;
  gap: 8px;
  border-top: 1px solid rgba(109, 77, 59, 0.2);
}

.night-action-editor__resolved {
  min-width: 0;
  display: grid;
  gap: 5px;
}

.night-action-editor__effect-list {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.night-action-editor__effect-chip {
  min-width: 0;
  padding: 5px 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid currentColor;
  border-radius: var(--ts-radius-pill, 999px);
  font-size: 0.78rem;
  font-weight: 900;
  line-height: 1.35;

  &.is-poisoned {
    color: #704b08;
    background: rgba(184, 126, 25, 0.13);
  }

  &.is-protected {
    color: #28553a;
    background: rgba(52, 125, 80, 0.12);
  }

  &.is-dead {
    color: var(--ts-danger, #842a32);
    background: rgba(142, 47, 54, 0.1);
  }
}

.night-action-editor__resolve {
  justify-self: start;
  color: #5c292d;
  background: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(109, 77, 59, 0.38);

  &.is-poisoned {
    color: #704b08;
    border-color: rgba(145, 94, 8, 0.55);
  }

  &.is-protected {
    color: #28553a;
    border-color: rgba(52, 125, 80, 0.5);
  }

  &.is-dead {
    color: var(--ts-danger, #842a32);
    border-color: rgba(142, 47, 54, 0.52);
  }
}

.night-action-editor__resolution-confirm {
  padding: 10px;
  display: grid;
  gap: 10px;
  color: #4d3a31;
  background: rgba(255, 255, 255, 0.56);
  border: 1px solid rgba(109, 77, 59, 0.32);
  border-left-width: 4px;
  border-radius: var(--ts-radius-md, 10px);

  &.is-poisoned {
    border-left-color: #91600d;
  }

  &.is-protected {
    border-left-color: #347d50;
  }

  &.is-dead {
    border-left-color: var(--ts-danger, #842a32);
  }
}

.night-action-editor__resolution-copy {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  align-items: start;
  gap: 8px;

  > svg {
    margin-top: 2px;
  }

  strong {
    font-size: 0.9rem;
  }

  p {
    margin: 3px 0 0;
    color: #5d493e;
    font-size: 0.78rem;
    line-height: 1.5;
  }
}

.night-action-editor__resolution-targets {
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  list-style: none;

  li {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.82rem;
    font-weight: 900;
  }

  .night-action-editor__seat {
    width: 24px;
    height: 24px;
  }
}

.night-action-editor__death-warning,
.night-action-editor__resolution-error {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 800;
  line-height: 1.5;
}

.night-action-editor__death-warning {
  color: var(--ts-danger, #842a32);
}

.night-action-editor__resolution-error {
  color: var(--ts-danger, #842a32);
}

.night-action-editor__resolution-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.night-action-editor__resolution-cancel {
  color: #4d3a31;
  background: rgba(255, 255, 255, 0.48);
  border: 1px solid rgba(109, 77, 59, 0.38);
}

.night-action-editor__resolution-submit {
  color: #fff7df;
  background: #6b4a12;
  border: 1px solid #543708;

  &.is-protected {
    background: #3f6b4f;
    border-color: #28553a;
  }

  &.is-dead {
    background: var(--ts-danger, #842a32);
    border-color: #5d171e;
  }
}

.night-action-editor__form {
  padding: 10px;
  display: grid;
  gap: 10px;
  border-top: 1px solid rgba(109, 77, 59, 0.2);
}

.night-action-editor__targets {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;

  legend {
    padding: 0;
    font-size: 0.82rem;
    font-weight: 900;
  }

  p {
    margin: 2px 0 8px;
    color: #6a5549;
    font-size: 0.72rem;
    line-height: 1.4;
  }
}

.night-action-editor__target-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.night-action-editor__target {
  min-width: 0;
  min-height: 48px;
  padding: 5px 8px;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 7px;
  color: #4d3a31;
  background: rgba(255, 255, 255, 0.42);
  border: 1px solid rgba(109, 77, 59, 0.3);
  border-radius: var(--ts-radius-md, 10px);
  cursor: pointer;
  font: inherit;
  text-align: left;
  touch-action: manipulation;

  > span:nth-child(2) {
    min-width: 0;
    display: grid;

    strong,
    small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong {
      font-size: 0.78rem;
    }

    small {
      color: #6a5549;
      font-size: 0.68rem;
    }
  }

  &.is-selected {
    color: #28553a;
    background: rgba(80, 146, 104, 0.16);
    border-color: rgba(52, 125, 80, 0.58);
  }

  &.is-dead strong {
    text-decoration: line-through;
  }

  &:focus-visible {
    outline: 3px solid var(--ts-focus-ring, #8e652d);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

.night-action-editor__seat {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff7df;
  background: var(--ts-focus-ring-on-parchment, #65242c);
  border-radius: 50%;
  font-size: 0.72rem;
  font-weight: 900;
}

.night-action-editor__label {
  display: grid;
  gap: 2px;
  font-size: 0.82rem;
  font-weight: 900;

  small {
    color: #6a5549;
    font-size: 0.72rem;
    font-weight: 500;
  }
}

textarea {
  width: 100%;
  min-height: 76px;
  padding: 9px 10px;
  resize: vertical;
  color: var(--ts-text-on-parchment, #2a1b18);
  background: rgba(255, 255, 255, 0.66);
  border: 1px solid rgba(109, 77, 59, 0.42);
  border-radius: var(--ts-radius-md, 10px);
  font: inherit;
  font-size: 1rem;
  line-height: 1.45;

  &:focus-visible {
    outline: 3px solid var(--ts-focus-ring, #8e652d);
    outline-offset: 1px;
  }
}

.night-action-editor__form-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  > span {
    color: #6a5549;
    font-size: 0.72rem;

    &.is-error {
      color: var(--ts-accent-crimson, #8e2f36);
      font-weight: 800;
    }
  }
}

.night-action-editor__save {
  color: #fff7df;
  background: var(--ts-focus-ring-on-parchment, #65242c);
  border: 1px solid #4d151b;
}

@media (max-width: 420px) {
  .night-action-editor__target-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .night-action-editor__form-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .night-action-editor__save {
    width: 100%;
  }

  .night-action-editor__resolve {
    width: 100%;
  }

  .night-action-editor__resolution-footer {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    padding-bottom: max(0px, env(safe-area-inset-bottom));
  }

  .night-action-editor__resolution-cancel,
  .night-action-editor__resolution-submit {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .night-action-editor__edit,
  .night-action-editor__save,
  .night-action-editor__resolve,
  .night-action-editor__resolution-cancel,
  .night-action-editor__resolution-submit {
    transition: none;
  }
}
</style>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useGameController } from "@/controllers/GameController";
import { SocketClientEvent } from "@/types/socket";
import Modal from "@/components/modals/Modal.vue";

const props = withDefaults(defineProps<{
  open: boolean;
  playerId: string;
  playerName?: string;
  roleName?: string;
}>(), {
  playerName: "玩家",
  roleName: "尚未分配身份",
});

const emit = defineEmits<{
  close: [];
  saved: [message: string];
}>();

const gameController = useGameController();
const notes = ref("");
const marks = ref<string[]>([]);
const markInput = ref("");
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref("");
let loadGeneration = 0;

function normalizeMark(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 40);
}

function addMark(): void {
  const nextMarks = markInput.value
    .split(/[，,]/)
    .map(normalizeMark)
    .filter(Boolean);
  for (const mark of nextMarks) {
    if (!marks.value.includes(mark) && marks.value.length < 12) {
      marks.value.push(mark);
    }
  }
  markInput.value = "";
}

function removeMark(mark: string): void {
  marks.value = marks.value.filter((item) => item !== mark);
}

async function loadNotes(): Promise<void> {
  if (!props.open || !props.playerId) return;
  const generation = ++loadGeneration;
  loading.value = true;
  errorMessage.value = "";

  try {
    const response = await gameController.request(SocketClientEvent.GetNotes);
    if (generation !== loadGeneration) return;
    const playerNotes = response.notes?.[props.playerId];
    notes.value = playerNotes?.notes || "";
    marks.value = [...(playerNotes?.marks || [])];
  } catch (error) {
    if (generation !== loadGeneration) return;
    errorMessage.value = error instanceof Error
      ? error.message
      : "私人笔记加载失败，请重试。";
  } finally {
    if (generation === loadGeneration) loading.value = false;
  }
}

async function saveNotes(): Promise<void> {
  if (saving.value || loading.value || !props.playerId) return;
  addMark();
  if (notes.value.length > 4000) {
    errorMessage.value = "笔记不能超过 4000 个字符。";
    return;
  }

  saving.value = true;
  errorMessage.value = "";
  try {
    await gameController.request(SocketClientEvent.UpdateNote, {
      playerId: props.playerId,
      notes: {
        notes: notes.value.trim(),
        marks: marks.value,
      },
    });
    emit("saved", `已保存 ${props.playerName} 的私人笔记`);
    emit("close");
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : "私人笔记保存失败，请重试。";
  } finally {
    saving.value = false;
  }
}

function close(): void {
  if (saving.value) return;
  loadGeneration += 1;
  emit("close");
}

watch(
  () => [props.open, props.playerId] as const,
  ([open]) => {
    if (open) void loadNotes();
  },
  { immediate: true },
);
</script>

<template>
  <Modal
    v-if="open"
    name="player-notes"
    :title="`私人笔记 · ${playerName}`"
    :description="`${roleName}；仅你本人可见，说书人之间共享说书人笔记。`"
    :close-on-backdrop="!saving"
    @close="close"
  >
    <form class="player-notes" @submit.prevent="saveNotes">
      <p v-if="loading" class="player-notes__status" role="status">
        正在加载笔记…
      </p>

      <template v-else>
        <label class="player-notes__field">
          <span>判断与行动记录</span>
          <textarea
            v-model="notes"
            rows="7"
            maxlength="4000"
            placeholder="例如：第 1 夜声称收到洗衣妇信息；白天重点观察 3 号。"
            :disabled="saving"
          />
          <small>{{ notes.length }} / 4000</small>
        </label>

        <div class="player-notes__field">
          <label for="player-note-mark">提醒标记</label>
          <div class="player-notes__mark-input">
            <input
              id="player-note-mark"
              v-model="markInput"
              type="text"
              maxlength="80"
              placeholder="输入标记后按回车"
              :disabled="saving || marks.length >= 12"
              @keydown.enter.prevent="addMark"
            />
            <button
              type="button"
              :disabled="saving || !markInput.trim() || marks.length >= 12"
              @click="addMark"
            >
              添加
            </button>
          </div>
          <ul v-if="marks.length" class="player-notes__marks" aria-label="已添加的提醒标记">
            <li v-for="mark in marks" :key="mark">
              <span>{{ mark }}</span>
              <button
                type="button"
                :aria-label="`删除标记 ${mark}`"
                :disabled="saving"
                @click="removeMark(mark)"
              >
                <font-awesome-icon :icon="['fas', 'xmark']" aria-hidden="true" />
              </button>
            </li>
          </ul>
          <small>最多 12 个标记；可记录“中毒”“已验证”“待回访”等私人提醒。</small>
        </div>
      </template>

      <p v-if="errorMessage" class="player-notes__error" role="alert">
        {{ errorMessage }}
      </p>

      <footer class="player-notes__actions">
        <button type="button" class="ts-button ts-button--ghost" :disabled="saving" @click="close">
          取消
        </button>
        <button type="submit" class="ts-button ts-button--primary" :disabled="loading || saving">
          {{ saving ? "保存中…" : "保存笔记" }}
        </button>
      </footer>
    </form>
  </Modal>
</template>

<style scoped lang="scss">
.player-notes {
  display: grid;
  gap: var(--ts-space-4, 16px);
  color: var(--ts-text-primary, #f4ebdd);
}

.player-notes__status,
.player-notes__error {
  margin: 0;
  padding: 12px;
  border-radius: var(--ts-radius-md, 10px);
}

.player-notes__status {
  color: var(--ts-text-muted, #c9bca7);
  background: rgba(214, 184, 106, 0.06);
}

.player-notes__error {
  color: var(--ts-danger, #ffb8b8);
  background: rgba(142, 47, 54, 0.16);
  border: 1px solid rgba(255, 184, 184, 0.28);
}

.player-notes__field {
  display: grid;
  gap: 8px;

  > span,
  > label {
    color: var(--ts-accent-gold-hover, #e7cf86);
    font-weight: 700;
  }

  textarea,
  input {
    width: 100%;
    box-sizing: border-box;
    color: var(--ts-text-primary, #f4ebdd);
    background: rgba(3, 3, 6, 0.58);
    border: 1px solid var(--ts-border-subtle, rgba(214, 184, 106, 0.22));
    border-radius: var(--ts-radius-md, 10px);
    font: inherit;

    &:focus-visible {
      outline: 3px solid var(--ts-focus-ring, #f0d990);
      outline-offset: 2px;
    }
  }

  textarea {
    min-height: 148px;
    padding: 12px;
    line-height: 1.55;
    resize: vertical;
  }

  input {
    min-height: 44px;
    padding: 8px 12px;
  }

  small {
    color: var(--ts-text-subtle, #9d907f);
    font-size: 0.75rem;
    line-height: 1.45;
  }
}

.player-notes__mark-input {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;

  button {
    min-width: 72px;
    min-height: 44px;
    color: var(--ts-text-primary, #f4ebdd);
    background: rgba(214, 184, 106, 0.1);
    border: 1px solid rgba(214, 184, 106, 0.34);
    border-radius: var(--ts-radius-md, 10px);
    cursor: pointer;
    font: inherit;
  }
}

.player-notes__marks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding-left: 12px;
    color: var(--ts-accent-gold-hover, #e7cf86);
    background: rgba(214, 184, 106, 0.08);
    border: 1px solid rgba(214, 184, 106, 0.26);
    border-radius: var(--ts-radius-pill, 999px);
  }

  button {
    width: 44px;
    height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: inherit;
    background: transparent;
    border: 0;
    border-radius: 50%;
    cursor: pointer;
  }
}

.player-notes__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 520px) {
  .player-notes__actions > button {
    flex: 1;
    min-height: 48px;
  }
}
</style>

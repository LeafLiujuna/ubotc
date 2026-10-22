<template>
  <span
    v-if="
      !session.gameServerId && !!session.sessionId &&
      (!session.isSpectator ||
        !!session.isHostAllowed ||
        !!session.isJoinAllowed)
    "
    class="local-timer-controls"
  >
    <button
      v-if="!session.isSpectator && (!timing || session.timer <= 0)"
      type="button"
      class="timer-button"
      data-testid="timer-start"
      @click="startTimer()"
    >
      开始
    </button>
    <button
      v-if="!session.isSpectator && timing && session.timer > 0"
      type="button"
      class="timer-button"
      data-testid="timer-stop"
      @click="stopTimer"
    >
      停止
    </button>
    <button
      type="button"
      class="timer-display"
      :disabled="session.isSpectator"
      data-testid="timer-display"
      @click="setTimer"
    >
      <span>计时 </span>
      <span :style="lessThanOneMinute">{{ formattedTime }}</span>
    </button>
  </span>
</template>

<script setup lang="ts">
import { useStorytellerUiStore } from '@/composables/useStoryteller';
import { computed, ref } from "vue";
import { requestInputModal } from "@/services/inputModalService";
import { useSessionStore } from "@/stores/session";

const session = useSessionStore();
const timing = ref(false);

const formattedTime = computed(() => {
  const minutes = Math.floor(session.timer / 60);
  const seconds = Math.ceil(session.timer % 60);
  return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
});

const lessThanOneMinute = computed(() => ({
  color: session.timer < 60 ? "red" : "white",
}));

function startTimer(time: number | null = null): void {
  if (session.isSpectator) return;
  session.startTimer(typeof time === "number" ? time : session.timer);
  timing.value = true;
}

function stopTimer(): void {
  if (session.isSpectator) return;
  session.stopTimer();
  timing.value = false;
}

async function setTimer(): Promise<void> {
  if (session.sessionId && session.gameServerId) { useStorytellerUiStore().timerOpen = true; return; }
  if (session.isSpectator || !session.sessionId) return;

  const input = await requestInputModal({
    inputType: "timer",
    inputModal: "input",
    inputData: {
      name: ["输入时间（分）"],
      length: 1,
      placeholder: [""],
    },
  }).catch(() => null);
  if (!Array.isArray(input)) return;

  const time = Number(input[0]);
  if (time <= 0) return;
  stopTimer();
  startTimer(time * 60);
}

defineExpose({ setTimer });
</script>

<style scoped>
.local-timer-controls {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.timer-button {
  min-width: 44px;
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 5px;
  color: white;
  background-color: rgba(0, 0, 0, 0.5);
  cursor: pointer;
}

.timer-display {
  min-height: 44px;
  padding: 0 4px;
  border: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  font-size: 20px;
  cursor: pointer;
}

.timer-display:disabled {
  cursor: default;
}
</style>

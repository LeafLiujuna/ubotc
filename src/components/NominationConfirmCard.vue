<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = withDefaults(defineProps<{
  open: boolean;
  nominatorSeat: number;
  nominatorName: string;
  nomineeSeat: number;
  nomineeName: string;
  requiredVotes?: number;
  pending?: boolean;
  statusText?: string;
  privateVote?: boolean;
}>(), { requiredVotes: 0, pending: false, statusText: '' });
const emit = defineEmits<{
  confirm: [];
  cancel: [];
  'update:privateVote': [value: boolean];
}>();
const cardRef = ref<HTMLElement | null>(null);
const countdown = ref(0);
let timer: ReturnType<typeof setInterval> | undefined;
function stopCountdown() {
  if (timer) clearInterval(timer);
  timer = undefined;
  countdown.value = 0;
}
function cancel() {
  if (props.pending) return;
  stopCountdown();
  emit('cancel');
}
function start() {
  if (props.pending || countdown.value) return;
  emit('confirm');
}
function startCountdown() {
  if (props.pending || countdown.value) return;
  countdown.value = 3;
  timer = setInterval(() => {
    countdown.value -= 1;
    if (!countdown.value) {
      stopCountdown();
      if (props.open && !props.pending) emit('confirm');
    }
  }, 1000);
}
watch(() => props.open, async open => {
  stopCountdown();
  if (!open) return;
  await nextTick();
  cardRef.value?.focus({ preventScroll: true });
});
watch(() => [props.nominatorSeat, props.nomineeSeat, props.pending], stopCountdown);
onBeforeUnmount(stopCountdown);
</script>

<template>
  <div v-if="open" class="table-nomination nomination-confirm-surface">
    <section ref="cardRef" class="table-nomination__panel nomination-confirm-card" role="dialog"
      aria-label="确认本轮提名" tabindex="-1" @keydown.esc.stop.prevent="cancel" @keyup.esc.stop>
      <p class="table-nomination__threshold">多数需要达到 <strong>{{ requiredVotes }}</strong> 票</p>
      <div class="table-nomination__route table-nomination__route--accessible">
        <span>提名者 · 第 {{ nominatorSeat }} 席 {{ nominatorName }}</span>
        <span>被提名者 · 第 {{ nomineeSeat }} 席 {{ nomineeName }}</span>
      </div>
      <div class="table-nomination__actions">
        <button type="button" class="gold" :disabled="pending || countdown > 0" @click="startCountdown">
          <font-awesome-icon icon="stopwatch" /> 倒计时
        </button>
        <button type="button" class="purple" aria-label="确认并开始投票" :disabled="pending || countdown > 0" @click="start">
          <font-awesome-icon icon="circle-play" /> {{ pending ? '正在开始…' : '开始' }}
        </button>
      </div>
      <div class="table-nomination__actions table-nomination__actions--secondary">
        <button type="button" disabled title="投票结束后可标记处决"><font-awesome-icon icon="skull" /> 标记</button>
        <button type="button" :disabled="pending" @click="cancel"><font-awesome-icon icon="circle-xmark" /> 关闭</button>
      </div>
      <label class="table-nomination__privacy" :title="privateVote ? '举手状态和最终票数仅说书人可见，投票期间显示夜晚效果。' : '举手状态和最终票数对所有玩家可见。'">
        <input type="checkbox" :checked="privateVote" :disabled="pending || countdown > 0"
          @change="emit('update:privateVote', ($event.target as HTMLInputElement).checked)" />隐私投票
      </label>
      <p class="table-nomination__route table-nomination__route--accessible">{{ privateVote ? '举手状态和最终票数仅说书人可见，投票期间显示夜晚效果。' : '举手状态和最终票数对所有玩家可见。' }}</p>
      <p v-if="statusText" class="table-nomination__status" role="status" aria-live="polite">{{ statusText }}</p>
    </section>
    <div v-if="countdown" class="table-nomination__countdown" role="status" aria-live="assertive">{{ countdown }}</div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/styles/table-nomination';
.nomination-confirm-surface { z-index: 51; }
</style>

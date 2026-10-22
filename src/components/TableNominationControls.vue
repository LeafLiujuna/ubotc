<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import ClockDial from './ClockDial.vue';
import { useTableNominationStore } from '@/stores/tableNomination';
import { useNominationAudio } from '@/composables/useNominationAudio';

const vote = useTableNominationStore();
const editing = ref(false);
const highest = ref(0);
const error = ref('');
const root = ref<HTMLElement | null>(null);
const showStart = ref(false);
let startTimer: ReturnType<typeof setTimeout> | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
watch(() => vote.open, open => {
  if (timer) clearInterval(timer);
  if (open) timer = setInterval(() => vote.tick(), 50);
  else { timer = undefined; editing.value = false; }
}, { immediate: true });
watch(() => vote.phase, (phase, previous) => {
  if (startTimer) clearTimeout(startTimer);
  showStart.value = phase === 'voting' && previous === 'countdown';
  if (showStart.value) startTimer = setTimeout(() => { showStart.value = false; }, 500);
});
onBeforeUnmount(() => { if (timer) clearInterval(timer); if (startTimer) clearTimeout(startTimer); });
const phaseLabel = computed(() => ({ ready: '等待开始', countdown: '即将开始', voting: '正在计票', paused: '已暂停', complete: '计票完成' })[vote.phase]);
const minuteSeat = computed(() => ['voting', 'paused', 'complete'].includes(vote.phase)
  ? vote.currentSeat + 1 : vote.nominator + 1);
const sweep = computed(() => vote.phase === 'ready' ? null : {
  nomineeSeat: vote.nominee + 1, turnIndex: vote.locked + 1,
  remainingMs: vote.phase === 'paused' ? vote.remaining : vote.duration,
  receivedAt: vote.deadline - vote.duration, durationMs: vote.duration,
  stage: vote.phase === 'countdown' ? 'countdown' : 'voting',
  paused: vote.phase === 'paused', complete: vote.phase === 'complete',
});
useNominationAudio(() => ({
  round: `${vote.nominator}:${vote.nominee}`,
  active: vote.open && vote.phase !== 'ready', paused: vote.phase === 'paused', locked: vote.locked,
  countdown: vote.phase === 'countdown'
    ? { remainingMs: 3000, receivedAt: vote.deadline - 3000, paused: false } : null,
}));
function handleStyle(side: 'nominator' | 'nominee') {
  const seat = side === 'nominator' ? minuteSeat.value - 1 : vote.nominee;
  const angle = (seat / Math.max(vote.votes.length, 1) * 360 - 90) * Math.PI / 180;
  const radius = side === 'nominator' ? 24 : 18;
  return { left: `${50 + Math.cos(angle) * radius}%`, top: `${50 + Math.sin(angle) * radius}%` };
}
let dragging: 'nominator' | 'nominee' | null = null;
let dragPointer: number | null = null;
let dragOrigin = { x: 0, y: 0 };
let suppressClick = false;
function dragStart(side: 'nominator' | 'nominee', event: PointerEvent) {
  if (!vote.canEdit) return;
  dragging = side;
  dragPointer = event.pointerId;
  dragOrigin = { x: event.clientX, y: event.clientY };
  suppressClick = false;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  event.preventDefault();
}
function dragEnd(event: PointerEvent) {
  if (!dragging || event.pointerId !== dragPointer) return;
  const bounds = root.value!.getBoundingClientRect();
  const x = event.clientX - bounds.left - bounds.width / 2;
  const y = event.clientY - bounds.top - bounds.height / 2;
  if (Math.hypot(event.clientX - dragOrigin.x, event.clientY - dragOrigin.y) > 8 && Math.hypot(x, y) > bounds.width * .08) {
    const angle = (Math.atan2(y, x) * 180 / Math.PI + 450) % 360;
    vote.selectSeat(Math.round(angle / 360 * vote.votes.length) % vote.votes.length, dragging);
    suppressClick = true;
  }
  dragging = null;
  dragPointer = null;
}
function selectSide(side: 'nominator' | 'nominee') {
  if (suppressClick) { suppressClick = false; return; }
  if (vote.canEdit) vote.selecting = vote.selecting === side ? null : side;
}
function editHighest() { highest.value = vote.highestVotes; error.value = ''; editing.value = true; }
function saveHighest() {
  if (!vote.setHighestVotes(Number(highest.value))) { error.value = `请输入 0 至 ${vote.votes.length} 的整数`; return; }
  editing.value = false;
}
</script>

<template>
  <div v-if="vote.open" ref="root" class="table-nomination" aria-label="手动提名计票" @keydown.esc.stop.prevent="editing ? editing = false : vote.close()" @keyup.esc.stop>
    <div class="table-nomination__dial" aria-hidden="true">
      <ClockDial mode="sweep" :seat-count="vote.votes.length" :minute-seat="minuteSeat" :hour-seat="vote.nominee + 1"
        :paused="vote.phase === 'paused'" :vote-sweep="sweep" />
    </div>
    <button v-for="side in (['nominator', 'nominee'] as const)" :key="side" type="button" class="table-nomination__hand"
      :class="`table-nomination__hand--${side}`" :style="handleStyle(side)" :disabled="!vote.canEdit"
      :aria-label="`选择${side === 'nominator' ? '提名者' : '被提名者'}，当前第 ${vote[side] + 1} 席`"
      :aria-pressed="vote.selecting === side" :title="`拖动指针或点击后选择${side === 'nominator' ? '提名者' : '被提名者'}`"
      @pointerdown="dragStart(side, $event)" @pointerup="dragEnd" @pointercancel="dragging = null; dragPointer = null"
      @click="selectSide(side)">
      <span aria-hidden="true">{{ side === 'nominator' ? '提' : '被' }}</span>
    </button>
    <section class="table-nomination__panel" aria-label="提名控制">
      <form v-if="editing" class="table-nomination__edit" @submit.prevent="saveHighest">
        <label for="nomination-highest">修改最高票数</label>
        <input id="nomination-highest" v-model.number="highest" type="number" min="0" :max="vote.votes.length" step="1" autofocus />
        <p v-if="error" role="alert">{{ error }}</p>
        <div class="table-nomination__actions"><button type="submit">确认</button><button type="button" @click="editing = false">取消</button></div>
      </form>
      <template v-else>
        <button type="button" class="table-nomination__threshold" title="修改最高票数" @click="editHighest">多数需要达到 <strong>{{ vote.requiredVotes }}</strong> 票 <font-awesome-icon icon="pen-to-square" /></button>
        <div class="table-nomination__actions">
          <button v-if="vote.phase === 'ready' || vote.phase === 'complete'" type="button" class="gold" @click="vote.start(true)"><font-awesome-icon icon="stopwatch" /> 倒计时</button>
          <button v-else type="button" class="gold" :disabled="vote.phase === 'countdown'" @click="vote.togglePause()"><font-awesome-icon :icon="vote.phase === 'paused' ? 'play' : 'pause'" /> {{ vote.phase === 'paused' ? '继续' : '暂停' }}</button>
          <button v-if="vote.phase === 'ready'" type="button" class="purple" @click="vote.start()"><font-awesome-icon icon="circle-play" /> 开始</button>
          <button v-else type="button" class="purple table-nomination__action--long" @click="vote.resetRound()"><font-awesome-icon icon="rotate-left" /> 重新开始</button>
        </div>
        <div class="table-nomination__actions table-nomination__actions--secondary">
          <button type="button" :class="{ 'table-nomination__action--long': vote.markedSeat === vote.nominee }" :disabled="vote.phase !== 'complete'" @click="vote.mark()"><font-awesome-icon icon="skull" /> {{ vote.markedSeat === vote.nominee ? '取消标记' : '标记' }}</button>
          <button type="button" @click="vote.close()"><font-awesome-icon icon="circle-xmark" /> 关闭</button>
        </div>
        <label class="table-nomination__privacy"><input v-model="vote.privateVote" type="checkbox" :disabled="!vote.canEdit" />隐私投票</label>
        <div class="table-nomination__route">
          <button type="button" :disabled="!vote.canEdit" :aria-pressed="vote.selecting === 'nominator'" @click="vote.selecting = 'nominator'">{{ vote.nominator + 1 }} 号</button>
          <span>提名</span>
          <button type="button" :disabled="!vote.canEdit" :aria-pressed="vote.selecting === 'nominee'" @click="vote.selecting = 'nominee'">{{ vote.nominee + 1 }} 号</button>
        </div>
        <p class="table-nomination__status" role="status" aria-live="polite">{{ vote.selecting ? `请选择${vote.selecting === 'nominator' ? '提名者' : '被提名者'}` : `${phaseLabel} · ${vote.yesVotes} 票` }}</p>
      </template>
    </section>
    <div v-if="vote.phase === 'countdown' || showStart" :key="showStart ? 'start' : vote.countdown" class="table-nomination__countdown" aria-live="assertive">{{ showStart ? '开始' : vote.countdown }}</div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/table-nomination';
</style>

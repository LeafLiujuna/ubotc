<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import ClockDial from './ClockDial.vue';
import { useGameController } from '@/controllers/GameController';
import { useGameStore } from '@/stores/game';
import { usePlayersStore } from '@/stores/players';
import { useRealtimeVoteStore } from '@/stores/realtimeVote';
import { useUserStore } from '@/stores/user';
import { emptyVoteSeat } from '@/utils/voteParticipant';
import type { ClientSubmitVoteMessage } from '@/types/socket';
import { useNominationAudio } from '@/composables/useNominationAudio';

const emit = defineEmits<{ startNomination: [] }>();
const vote = useRealtimeVoteStore();
const game = useGameStore();
const players = usePlayersStore();
const user = useUserStore();
const controller = useGameController();
const panel = ref<HTMLElement | null>(null);
const error = ref('');
const commandPending = ref(false);
const ballotPending = ref(false);
const clock = ref(Date.now());
const clockTimer = setInterval(() => { clock.value = Date.now(); }, 100);
const showStart = ref(false);
let startTimer: ReturnType<typeof setTimeout> | undefined;
watch(() => [vote.nominationId, vote.stage, vote.isActive] as const, (next, previous) => {
  if (startTimer) clearTimeout(startTimer);
  showStart.value = next[0] === previous?.[0] && next[2]
    && next[1] === 'voting' && previous?.[1] === 'countdown';
  if (showStart.value) startTimer = setTimeout(() => { showStart.value = false; }, 500);
});
onBeforeUnmount(() => { clearInterval(clockTimer); if (startTimer) clearTimeout(startTimer); });
const isDM = computed(() => game.currentIsDm);
const hidden = computed(() => vote.privateVote && !isDM.value);
const ownResult = computed(() => vote.results[user.userId || '']);
const ownChoice = computed(() => vote.choices[user.userId || '']);
const emptySeatTurn = computed(() => isDM.value ? emptyVoteSeat(vote.currentVoterUserId) : 0);
const canChoose = computed(() => vote.isActive && controller.isConnected
  && vote.submissionState === 'idle' && !commandPending.value && !ballotPending.value
  && (Boolean(emptySeatTurn.value) || (vote.canVote
    && (vote.sweepVote || vote.currentVoterUserId === user.userId) && !ownResult.value)));
const isReady = computed(() => vote.sweepVote && vote.isActive && vote.stage === 'ready');
const countdown = computed(() => vote.sweepVote && vote.isActive && vote.stage === 'countdown'
  ? Math.max(1, Math.ceil(((vote.turnRemainingMs ?? 0) - (vote.paused ? 0 : clock.value - (vote.turnReceivedAt ?? clock.value))) / 1000)) : 0);
const sweep = computed(() => vote.sweepVote ? {
  nomineeSeat: seatFor(vote.nomineeUserId), turnIndex: vote.turnIndex ?? 1,
  remainingMs: vote.turnRemainingMs ?? vote.turnDurationMs ?? 600,
  receivedAt: vote.turnReceivedAt ?? Date.now(), durationMs: vote.turnDurationMs ?? 600,
  stage: vote.stage, paused: vote.paused, complete: vote.isComplete,
} : null);
useNominationAudio(() => ({
  round: vote.nominationId, active: vote.isVisible && (vote.isActive || vote.isComplete), paused: vote.paused,
  // Turn progression is public even for private votes; choices stay private.
  locked: vote.sweepVote ? (vote.isComplete ? players.players.length : Math.max(0, (vote.turnIndex ?? 1) - 1))
    : vote.processedVotes,
  countdown: vote.isActive && vote.stage === 'countdown' && vote.turnReceivedAt != null
    ? { remainingMs: vote.turnRemainingMs ?? 3000, receivedAt: vote.turnReceivedAt, paused: vote.paused } : null,
}));
const tally = computed(() => vote.isComplete ? vote.yesVotes : vote.currentYesVotes);
const marked = computed(() => vote.dayNominationState?.executionMarkerUserId === vote.nomineeUserId);
const canMark = computed(() => vote.isComplete && Boolean(vote.nomineeUserId)
  && !vote.dayNominationState?.finalized && vote.yesVotes >= vote.requiredVotes);
const phaseLabel = computed(() => {
  if (vote.isComplete) return hidden.value ? '隐私投票已结束' : (vote.yesVotes >= vote.requiredVotes ? '投票通过' : '投票未通过');
  if (vote.paused) return '已暂停';
  if (isReady.value) return '等待说书人开始，可提前举手';
  if (countdown.value) return '即将开始';
  if (vote.sweepVote) return ownResult.value ? '你的投票已锁定' : '指针经过你的座位后锁票';
  if (emptySeatTurn.value) return `第 ${emptySeatTurn.value} 席 · 说书人代投`;
  if (vote.currentVoterUserId === user.userId) return '现在轮到你投票。';
  return vote.currentVoterSeat ? `现在轮到第 ${vote.currentVoterSeat} 席投票。` : '正在同步投票';
});
function seatFor(id: string | null): number {
  return emptyVoteSeat(id) || players.players.findIndex(player => player.id === id) + 1;
}
const lastVoterSeat = ref<number | null>(null);
watch([() => vote.nominationId, () => vote.currentVoterSeat], ([round, seat], previous) => {
  if (round !== previous?.[0]) lastVoterSeat.value = null;
  if (seat != null) lastVoterSeat.value = seat;
}, { immediate: true });
// A result and the next turn arrive separately. Hold the hand between them.
const minuteSeat = computed(() => vote.currentVoterSeat ?? lastVoterSeat.value
  ?? (seatFor(vote.isComplete ? vote.nomineeUserId : vote.initiatorUserId) || null));

async function submit(choice: ClientSubmitVoteMessage['vote'], seat = emptySeatTurn.value) {
  const empty = isDM.value && seat && (!vote.sweepVote || !players.players[seat - 1]?.id);
  if (!canChoose.value && !(vote.sweepVote && vote.isActive && empty && !vote.results[`@seat:${seat}`]
    && controller.isConnected && vote.submissionState === 'idle' && !commandPending.value && !ballotPending.value)) return;
  const revision = vote.syncRevision;
  const voter = vote.currentVoterUserId;
  const round = vote.nominationId;
  ballotPending.value = true;
  vote.beginSubmission(choice);
  error.value = '';
  try {
    await controller.submitVote({ vote: choice, ...(vote.sweepVote ? { nominationId: round! } : {}), ...(empty ? {
      seat, nominationId: round!,
    } : {}) });
    // Broadcasts can advance the turn before the request is acknowledged.
    if (vote.sweepVote && vote.syncRevision === revision) vote.clearSubmission();
    else if (vote.syncRevision === revision && vote.currentVoterUserId === voter && vote.isActive) {
      vote.markSubmissionAwaiting();
    }
  } catch (cause) {
    if (vote.syncRevision !== revision || (!vote.sweepVote && vote.currentVoterUserId !== voter)) return;
    vote.clearSubmission();
    error.value = cause instanceof Error ? cause.message : '投票提交失败，请重试';
  } finally { ballotPending.value = false; }
}
async function control(action: 'pause' | 'resume' | 'cancel' | 'mark' | 'start' | 'countdown' | 'restart') {
  if (!isDM.value || !controller.isConnected || commandPending.value) return;
  if (action === 'mark' ? !canMark.value : action !== 'restart' && action !== 'cancel' && !vote.isActive) return;
  commandPending.value = true;
  error.value = '';
  try {
    if (action === 'mark') await controller.setExecutionMarker({ nomineeUserId: marked.value ? null : vote.nomineeUserId });
    else {
      const payload = { nominationId: vote.nominationId! };
      if (action === 'pause') await controller.pauseVote(payload);
      else if (action === 'resume') await controller.resumeVote(payload);
      else if (action === 'cancel') await controller.cancelVote(payload);
      else await controller.resumeVote({ ...payload, ...(action === 'countdown' ? { countdown: true } : {}),
        ...(action === 'restart' ? { restart: true } : {}) });
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '操作失败，请重试';
  } finally { commandPending.value = false; }
}
function nextNomination() {
  if (isDM.value && !vote.isActive && vote.hide()) emit('startNomination');
}
async function changePrivacy(event: Event) {
  if (!isDM.value || !isReady.value || commandPending.value) return;
  commandPending.value = true;
  try {
    await controller.resumeVote({ nominationId: vote.nominationId!, privateVote: (event.target as HTMLInputElement).checked });
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '操作失败，请重试'; }
  finally { commandPending.value = false; }
}
defineExpose({
  focus: () => panel.value?.focus({ preventScroll: true }),
  voteForSeat: (seat: number) => {
    if (vote.sweepVote) {
      const player = players.players[seat - 1];
      if (!player || (player.id && player.id !== user.userId)) return;
      const id = player.id || `@seat:${seat}`;
      return submit(vote.choices[id]?.vote === 'yes' ? 'no' : 'yes', player.id ? 0 : seat);
    }
    if (seat === vote.currentVoterSeat) return submit('yes');
  },
});
</script>

<template>
  <div v-if="vote.isVisible && vote.phase !== 'idle'" class="table-nomination"
    :class="{ 'table-nomination--player': !isDM, 'table-nomination--sweep': vote.sweepVote }" aria-label="提名投票">
    <div class="table-nomination__dial" aria-hidden="true">
      <ClockDial mode="sweep" :seat-count="players.players.length"
        :minute-seat="minuteSeat"
        :hour-seat="seatFor(vote.nomineeUserId) || null" :paused="vote.paused" :vote-sweep="sweep" />
    </div>
    <section id="table-nomination-panel" ref="panel" class="table-nomination__panel" role="dialog"
      aria-label="提名控制" tabindex="-1" @keydown.esc.stop.prevent="vote.hide()" @keyup.esc.stop>
      <p class="table-nomination__threshold">多数需要达到 <strong>{{ vote.requiredVotes }}</strong> 票</p>
      <div class="table-nomination__route table-nomination__route--accessible">
        <span>{{ seatFor(vote.initiatorUserId) }} 号</span><span>提名</span><span>{{ seatFor(vote.nomineeUserId) }} 号</span>
      </div>
      <div v-if="(!vote.sweepVote || !isDM) && ((vote.sweepVote && (vote.canVote || ownResult)) || canChoose || vote.submissionState !== 'idle')" class="table-nomination__actions table-nomination__ballot">
        <button type="button" class="gold table-nomination__action--long" aria-label="赞成 · 举手" :aria-pressed="ownChoice?.vote === 'yes'"
          :disabled="!canChoose" @click="submit('yes')"><font-awesome-icon icon="hand" />{{ vote.sweepVote ? '举手' : '赞成 · 举手' }}</button>
        <button type="button" class="purple table-nomination__action--long" aria-label="反对 · 放下" :aria-pressed="ownChoice?.vote === 'no'"
          :disabled="!canChoose" @click="submit('no')"><font-awesome-icon icon="hand" />{{ vote.sweepVote ? '放下' : '反对 · 放下' }}</button>
      </div>
      <div v-if="isDM" class="table-nomination__actions">
        <template v-if="isDM">
          <template v-if="isReady">
            <button type="button" class="gold" :disabled="commandPending || !controller.isConnected" @click="control('countdown')"><font-awesome-icon icon="stopwatch" />倒计时</button>
            <button type="button" class="purple" :disabled="commandPending || !controller.isConnected" @click="control('start')"><font-awesome-icon icon="circle-play" />开始</button>
          </template>
          <button v-else-if="vote.isActive" type="button" class="gold" :disabled="commandPending || !controller.isConnected"
            @click="control(vote.paused ? 'resume' : 'pause')"><font-awesome-icon :icon="vote.paused ? 'play' : 'pause'" /> {{ vote.paused ? '继续' : '暂停' }}</button>
          <button v-else-if="!vote.sweepVote" type="button" class="purple table-nomination__action--long" :disabled="!controller.isConnected || vote.dayNominationState?.finalized"
            @click="nextNomination"><font-awesome-icon icon="rotate-left" /> 再次提名</button>
          <button v-if="vote.sweepVote && !isReady" type="button" class="purple" :disabled="commandPending || !controller.isConnected || vote.dayNominationState?.finalized" @click="control('restart')"><font-awesome-icon icon="rotate-left" />重置</button>
          <button v-else-if="vote.isActive && !isReady" type="button" class="purple table-nomination__action--long" :disabled="commandPending || !controller.isConnected" @click="control('cancel')"><font-awesome-icon icon="circle-xmark" /> 取消本轮</button>
        </template>
      </div>
      <div v-if="isDM || !vote.sweepVote" class="table-nomination__actions table-nomination__actions--secondary">
        <button v-if="isDM" type="button" :class="{ 'table-nomination__action--long': marked }" :disabled="!canMark || commandPending || !controller.isConnected" @click="control('mark')"><font-awesome-icon icon="skull" /> {{ marked ? '取消标记' : '标记' }}</button>
        <button type="button" :disabled="!vote.canHide || commandPending" @click="vote.sweepVote ? control('cancel') : vote.hide()"><font-awesome-icon icon="circle-xmark" /> 关闭</button>
      </div>
      <label v-if="isDM" class="table-nomination__privacy"><input type="checkbox" :checked="vote.privateVote"
        :disabled="!isReady || commandPending || !controller.isConnected" @change="changePrivacy" />隐私投票</label>
      <p class="table-nomination__status" :class="{ 'table-nomination__route--accessible': vote.sweepVote && !vote.isComplete }" role="status" aria-live="polite">{{ phaseLabel }}</p>
      <p v-if="!hidden && (!vote.sweepVote || vote.isComplete)" class="table-nomination__tally">{{ vote.isComplete ? '最终结果' : '正在计票' }} · {{ tally }} 票</p>
      <p v-else-if="hidden" class="table-nomination__route--accessible">举手状态和最终票数仅说书人可见</p>
      <p v-if="ownResult" class="table-nomination__own-vote" :class="{ 'table-nomination__route--accessible': vote.sweepVote }">我的选择：{{ ownResult.vote === 'yes' ? '举手' : '未举手' }}</p>
      <p v-if="error" class="table-nomination__error" role="alert">{{ error }}</p>
    </section>
    <div v-if="countdown || showStart" :key="showStart ? 'start' : countdown" class="table-nomination__countdown" role="status">{{ showStart ? '开始' : countdown }}</div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/table-nomination';
.table-nomination__actions:not(.table-nomination__actions--secondary) + .table-nomination__actions:not(.table-nomination__actions--secondary) { margin-top: 6px; }
</style>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Token from './Token.vue';
import { motionEnabled } from '@/composables/useMotion';
import type { Role } from '@/types/domain';

const props = withDefaults(defineProps<{
  role: Role;
  revealed: boolean;
  preview?: boolean;
  animateInitialReveal?: boolean;
  seatIndex: number;
  startedAt?: number;
  turnDelay?: number;
}>(), { preview: false, animateInitialReveal: false });
const emit = defineEmits<{ (event: 'turn-complete'): void }>();

const COVER_MS = 1600, TURN_MS = 1000;
const ready = computed(() => props.revealed && Boolean(props.role.id));
const alreadyVisibleAtMount = props.revealed && !props.animateInitialReveal;
// 以整桌揭晓开始时间计算剩余盖牌时间，重连时不从头播放。
const elapsed = Math.max(0, Date.now() - (props.startedAt ?? Date.now()));
const coverDelay = Math.min(props.seatIndex, 19) * 90;
const coverRemaining = Math.max(0, COVER_MS + coverDelay - elapsed);
const turnDelay = computed(() => Math.max(0, props.turnDelay || 0));
const covering = ref(!alreadyVisibleAtMount && motionEnabled.value && coverRemaining > 0);
const faceUp = ref(ready.value && !props.animateInitialReveal);
const turning = ref(false);
// 盖牌期间不向正面 Token 传入身份，避免翻转途中提前显示角色内容。
const faceRole = computed(() => faceUp.value ? props.role : { id: '' });
const state = computed(() => covering.value ? 'covering' : turning.value ? 'revealing' : faceUp.value ? 'revealed' : 'covered');
let coverTimer: ReturnType<typeof setTimeout> | undefined;
let turnTimer: ReturnType<typeof setTimeout> | undefined;

function reconcile() {
  // 关闭动画时直接落到最终状态，并通知父组件继续揭晓流程。
  if (!motionEnabled.value) {
    clearTimeout(coverTimer); clearTimeout(turnTimer);
    covering.value = false; turning.value = false; faceUp.value = ready.value;
    emit('turn-complete');
    return;
  }
  if (covering.value) return;
  if (!ready.value) { faceUp.value = false; turning.value = false; return; }
  if (faceUp.value) return;
  faceUp.value = true;
  // On reconnect, wait for the public role projection without replaying old flips.
  if (alreadyVisibleAtMount) return;
  turning.value = true;
  turnTimer = setTimeout(() => { turning.value = false; emit('turn-complete'); }, TURN_MS + turnDelay.value);
}

if (covering.value) coverTimer = setTimeout(() => { covering.value = false; reconcile(); }, coverRemaining);
watch([ready, motionEnabled, () => props.animateInitialReveal], reconcile);
if (!covering.value && props.animateInitialReveal) reconcile();
onBeforeUnmount(() => { clearTimeout(coverTimer); clearTimeout(turnTimer); });
</script>

<template>
  <div class="grimoire-reveal-token" :class="{ 'is-covered': !faceUp, 'is-covering': covering, 'is-turning': turning }"
    :data-reveal-state="state" :style="{ '--reveal-cover-delay': `${coverDelay - elapsed}ms`, '--reveal-turn-delay': `${turnDelay}ms` }">
    <div class="reveal-disc">
      <div class="reveal-disc-face reveal-disc-front"><Token :role="faceRole" :animate-changes="false" /></div>
      <div class="reveal-disc-face reveal-disc-back" aria-hidden="true"></div>
    </div>
    <div v-if="preview && !faceUp && role.id" class="reveal-disc-preview"><Token :role="role" :animate-changes="false" /></div>
  </div>
</template>

<style scoped lang="scss">
.grimoire-reveal-token { position: relative; width: 100%; aspect-ratio: 1; perspective: 650px; isolation: isolate; }
.reveal-disc { position: absolute; inset: 0; transform-style: preserve-3d; transform: rotateY(0deg); }
.is-covered .reveal-disc { transform: rotateY(180deg); }
.reveal-disc-face { position: absolute; inset: 0; border-radius: 50%; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
.reveal-disc-front { transform: rotateY(0deg); }
.reveal-disc-back { transform: rotateY(180deg); overflow: hidden; border: 2px solid #080808; background: #35362d; box-shadow: 0 2px 6px #0008, inset 0 0 0 3px #10120d70; }
.reveal-disc-back::before { content: ''; position: absolute; inset: 0; border-radius: inherit; background: url('@/assets/token.png') center / cover; filter: grayscale(.7) brightness(.34); opacity: .7; }
.reveal-disc-preview { position: absolute; inset: 0; z-index: 2; }
.is-covering .reveal-disc { animation: ts-grimoire-cover 1600ms cubic-bezier(.3, .05, .2, 1) var(--reveal-cover-delay) both; }
.is-turning .reveal-disc { animation: ts-grimoire-turn 1000ms cubic-bezier(.2, .7, .25, 1) var(--reveal-turn-delay, 0ms) both; }
@media (prefers-reduced-motion: reduce) { .is-covering .reveal-disc, .is-turning .reveal-disc { animation: none; } }
:global(.ts-reduce-motion) .is-covering .reveal-disc, :global(.ts-reduce-motion) .is-turning .reveal-disc { animation: none; }
</style>

<script setup lang="ts">
/**
 * The clock face. One component, three jobs:
 *
 * - `mode="select"` — the nomination dial. Seats ring the face as real buttons;
 *   the long hand marks the nominator, the short hand the nominee.
 * - `mode="sweep"`  — mounted at the centre of the game table. A single hand
 *   steps clockwise to whichever seat is currently voting, dragging a trail
 *   behind it, with the remaining turn time drawn as a shrinking wedge.
 * - `mode="clock"`  — decoration. Hands follow real wall-clock time and stop
 *   while the dial is off-screen.
 *
 * Hand rotation is a plain CSS transition over `--hand-deg`, not a JS
 * animation: the overshoot in `--ts-ease-dial` supplies the spring feel, the
 * global reduced-motion gate collapses it for free, and the resting angle stays
 * inspectable as an inline style. Angles accumulate — see `advanceClockwise` —
 * so a hand crossing twelve o'clock sweeps forward instead of rewinding.
 *
 * Timed voting sweeps interpolate from server turn timestamps on each frame.
 * The countdown wedge is also JS-driven, because it has to resume from a
 * partial value after a reconnect and freeze mid-sweep when the storyteller
 * pauses; neither is expressible as a declarative CSS transition.
 */
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import { advanceClockwise, countdownFraction, seatArc, seatToDeg, timeToHands } from "@/utils/dial";
import { animateIfAllowed, applyResting, observeInView, motionEnabled } from "@/composables/useMotion";
import type { MotionPlayback } from "@/composables/useMotion";

export type DialSeat = {
  /** 1-based seat number, matching "第 N 席" and the server's `seat` field. */
  seat: number;
  label: string;
  disabled?: boolean;
  /** Free-form status word appended to the accessible name (e.g. 今日已提名). */
  state?: string;
  selected?: boolean;
};

const props = withDefaults(
  defineProps<{
    seatCount: number;
    mode?: "select" | "sweep" | "clock";
    /** Short hand target — the nominee. */
    hourSeat?: number | null;
    /** Long hand target — the nominator. */
    minuteSeat?: number | null;
    voteSweep?: {
      nomineeSeat: number; turnIndex: number; remainingMs: number;
      receivedAt: number; durationMs: number; stage: string; paused: boolean; complete: boolean;
    } | null;
    /** Sweep hand target — the seat currently voting. */
    sweepSeat?: number | null;
    countdownMs?: number | null;
    countdownStartedAt?: number | null;
    /** Full length of a turn; the wedge is drawn as remaining / total. */
    turnDurationMs?: number | null;
    paused?: boolean;
    seats?: DialSeat[];
    /** Dim the whole dial when there is nothing to point at. */
    idle?: boolean;
    ariaLabel?: string;
  }>(),
  {
    mode: "select",
    hourSeat: null,
    minuteSeat: null,
    voteSweep: null,
    sweepSeat: null,
    countdownMs: null,
    countdownStartedAt: null,
    turnDurationMs: null,
    paused: false,
    seats: () => [],
    idle: false,
    ariaLabel: "",
  },
);

const emit = defineEmits<{ "select-seat": [seat: number] }>();

const root = useTemplateRef<HTMLElement>("root");
const countdownEl = useTemplateRef<HTMLElement>("countdownEl");

/** At least one seat, so the angle maths never divides by zero. */
const total = computed(() => Math.max(1, Math.round(props.seatCount) || 1));
const tickCount = computed(() => total.value);
const arc = computed(() => seatArc(total.value));

/* ---------------------------------------------------------------- hands ---- */

/**
 * Accumulated angles. These only ever grow, which is what keeps the hands
 * turning clockwise; the rendered `rotate()` therefore climbs past 360deg and
 * that is deliberate, not a bug.
 */
const initialAngle = (seat: number | null) => seat == null ? 0 : seatToDeg(seat, total.value);
const hourDeg = ref(initialAngle(props.hourSeat));
const minuteDeg = ref(initialAngle(props.minuteSeat));
const sweepDeg = ref(initialAngle(props.sweepSeat));

/** How many whole laps the sweep hand has run — remounts the trail to replay it. */
const sweepKey = ref(0);

const trackSeat = (angle: typeof hourDeg, seat: number | null | undefined): void => {
  if (seat == null || !Number.isFinite(seat)) return;
  angle.value = advanceClockwise(angle.value, seatToDeg(seat, total.value));
};

watch(
  () => [props.hourSeat, total.value] as const,
  () => trackSeat(hourDeg, props.hourSeat),
  { immediate: true },
);

watch(
  () => [props.minuteSeat, total.value] as const,
  () => trackSeat(minuteDeg, props.minuteSeat),
  { immediate: true },
);

watch(
  () => [props.sweepSeat, total.value] as const,
  () => {
    if (props.sweepSeat == null) return;
    trackSeat(sweepDeg, props.sweepSeat);
    sweepKey.value += 1;
  },
  { immediate: true },
);

const hasHour = computed(() => props.mode === "clock" || props.hourSeat != null);
const hasMinute = computed(() => props.mode === "clock" || props.minuteSeat != null);
const hasSweep = computed(() => props.mode === "sweep" && props.sweepSeat != null);

/* ------------------------------------------------------- wall-clock mode ---- */

const clockHands = ref({ hour: 0, minute: 0, second: 0 });
let clockTimer: ReturnType<typeof setInterval> | null = null;

const readClock = (): void => {
  const now = new Date(Date.now());
  clockHands.value = timeToHands(now.getHours(), now.getMinutes(), now.getSeconds());
};

const startClock = (): void => {
  if (clockTimer !== null) return;
  readClock();
  // A second is plenty: the hand transition covers the gap between ticks.
  clockTimer = setInterval(readClock, 1000);
};

const stopClock = (): void => {
  if (clockTimer === null) return;
  clearInterval(clockTimer);
  clockTimer = null;
};

let stopViewObserver: (() => void) | null = null;

const releaseViewObserver = (): void => {
  stopViewObserver?.();
  stopViewObserver = null;
};

watch(
  () => [props.mode, root.value] as const,
  ([mode, element]) => {
    if (mode !== "clock") {
      releaseViewObserver();
      stopClock();
      return;
    }
    // Off-screen dials stop ticking; with reduced motion the observer resolves
    // immediately so the hands still show the right time.
    if (!element || stopViewObserver) return;
    stopViewObserver = observeInView(element, startClock, stopClock);
  },
  { immediate: true },
);

const displayHour = computed(() => (props.mode === "clock" ? clockHands.value.hour : hourDeg.value));
const voteAngle = ref(0);
let voteFrame: number | null = null;
function drawVoteHand() {
  const sweep = props.voteSweep;
  if (!sweep) return;
  const base = seatToDeg(sweep.nomineeSeat, total.value);
  const elapsed = sweep.paused ? 0 : Math.max(0, Date.now() - sweep.receivedAt);
  const progress = Math.max(0, Math.min(1, 1 - (sweep.remainingMs - elapsed) / Math.max(1, sweep.durationMs)));
  voteAngle.value = base + (sweep.complete ? 360 : sweep.stage !== 'voting' ? 0
    : arc.value * (Math.max(0, sweep.turnIndex - 1) + (motionEnabled.value ? progress : 0)));
  if (!sweep.complete && !sweep.paused && sweep.stage === 'voting' && progress < 1) {
    voteFrame = requestAnimationFrame(drawVoteHand);
  } else voteFrame = null;
}
watch(() => [props.voteSweep, total.value, motionEnabled.value], () => {
  if (voteFrame !== null) cancelAnimationFrame(voteFrame);
  voteFrame = null;
  drawVoteHand();
}, { immediate: true, deep: true });
const displayMinute = computed(() =>
  props.mode === "clock" ? clockHands.value.minute : props.voteSweep ? voteAngle.value : minuteDeg.value,
);

/* ------------------------------------------------------------ countdown ---- */

const showCountdown = computed(
  () => props.mode === "sweep" && !!props.countdownMs && !!props.turnDurationMs,
);

let countdownPlayback: MotionPlayback | null = null;

const stopCountdown = (): void => {
  countdownPlayback?.stop();
  countdownPlayback = null;
};

/**
 * Redraw the wedge from wherever this turn actually stands. Called on every
 * turn change rather than counted down locally, so a client that reconnects
 * halfway through a turn picks up the correct arc instead of restarting it.
 */
const runCountdown = (): void => {
  stopCountdown();
  const element = countdownEl.value;
  if (!element || !showCountdown.value) return;

  const fraction = countdownFraction(
    props.countdownMs,
    props.countdownStartedAt,
    props.turnDurationMs,
    Date.now(),
  );
  const fromDeg = `${(fraction * 360).toFixed(2)}deg`;

  // The wedge is the honest picture of time left, so it must be correct even
  // when animation is off — hence the resting value rather than a bare no-op.
  applyResting(element, { "--ts-arc": fromDeg });
  if (fraction <= 0) return;

  const remaining = fraction * (props.turnDurationMs ?? 0);
  try {
    countdownPlayback = animateIfAllowed(
      element,
      { "--ts-arc": [fromDeg, "0deg"] },
      { duration: remaining / 1000, ease: "linear" },
      { "--ts-arc": fromDeg },
    );
  } catch {
    // Animating a custom property needs @property registration, which not every
    // engine honours. The resting arc is already on the element, so the wedge
    // simply holds the correct value instead of sweeping.
    countdownPlayback = null;
  }
  if (props.paused) countdownPlayback?.pause();
};

watch(
  () => [
    props.countdownMs,
    props.countdownStartedAt,
    props.turnDurationMs,
    showCountdown.value,
    countdownEl.value,
  ] as const,
  () => runCountdown(),
  { immediate: true, flush: "post" },
);

watch(
  () => props.paused,
  (paused) => {
    if (!countdownPlayback) return;
    // Pausing keeps the current angle on screen; resuming continues from it.
    if (paused) countdownPlayback.pause();
    else countdownPlayback.play();
  },
);

onBeforeUnmount(() => {
  if (voteFrame !== null) cancelAnimationFrame(voteFrame);
  stopCountdown();
  stopClock();
  releaseViewObserver();
});

/* ------------------------------------------------------------ seat ring ---- */

const seatNodes = computed(() =>
  props.seats.map((seat) => {
    // -90deg puts seat 1 at twelve o'clock, matching the game table's ring.
    const angle = -90 + arc.value * (seat.seat - 1);
    const radian = (angle * Math.PI) / 180;
    return {
      ...seat,
      angle,
      style: {
        left: `${(50 + Math.cos(radian) * 41).toFixed(3)}%`,
        top: `${(50 + Math.sin(radian) * 41).toFixed(3)}%`,
      },
      accessibleName: [`第 ${seat.seat} 席`, seat.label, seat.state].filter(Boolean).join("，"),
    };
  }),
);

const onSeatClick = (seat: DialSeat): void => {
  if (seat.disabled) return;
  emit("select-seat", seat.seat);
};

/**
 * Arrow keys walk the ring, which is how a dial is expected to behave. Every
 * seat stays individually tabbable, so this is additive — existing Tab order is
 * untouched.
 */
const onSeatKeydown = (event: KeyboardEvent, index: number): void => {
  const step =
    event.key === "ArrowRight" || event.key === "ArrowDown"
      ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : 0;

  let targetIndex = -1;
  if (step !== 0) {
    const count = seatNodes.value.length;
    if (count === 0) return;
    targetIndex = (index + step + count) % count;
  } else if (event.key === "Home") {
    targetIndex = 0;
  } else if (event.key === "End") {
    targetIndex = seatNodes.value.length - 1;
  } else {
    return;
  }

  event.preventDefault();
  const buttons = root.value?.querySelectorAll<HTMLButtonElement>("[data-dial-seat]");
  buttons?.[targetIndex]?.focus();
};
</script>

<template>
  <div
    ref="root"
    class="clock-dial"
    :class="[`clock-dial--${mode}`, { 'is-idle': idle, 'is-paused': paused, 'clock-dial--vote-sweep': Boolean(voteSweep) }]"
    :style="{ '--dial-seats': total, '--dial-arc': `${arc}deg` }"
  >
    <div class="clock-dial__face" aria-hidden="true">
      <div class="clock-dial__ticks clock-ticks" :style="{ '--ts-tick-count': tickCount }"></div>
      <!-- Quarter marks, set inline so they win regardless of stylesheet order. -->
      <div
        class="clock-dial__ticks clock-ticks clock-ticks--accent"
        :style="{ '--ts-tick-count': 4, '--ts-tick-length': '9%' }"
      ></div>

      <div
        v-if="showCountdown"
        ref="countdownEl"
        class="clock-dial__countdown"
        :class="{ 'is-frozen': paused }"
      ></div>

      <!-- Remounted on every step so the pulse replays where the hand lands. -->
      <div
        v-if="hasSweep"
        :key="sweepKey"
        class="clock-dial__tick-flash"
        :style="{ '--hand-deg': `${sweepDeg}deg` }"
      ></div>

      <template v-if="hasSweep">
        <span
          v-for="trail in 3"
          :key="`trail-${trail}`"
          class="clock-dial__hand clock-dial__hand--trail"
          :style="{ '--hand-deg': `${sweepDeg}deg`, '--trail-index': trail }"
        ></span>
        <span class="clock-dial__hand clock-dial__hand--sweep" :style="{ '--hand-deg': `${sweepDeg}deg` }"></span>
      </template>

      <span
        v-if="hasMinute"
        class="clock-dial__hand clock-dial__hand--minute"
        :style="{ '--hand-deg': `${displayMinute}deg` }"
      ></span>
      <span
        v-if="hasHour"
        class="clock-dial__hand clock-dial__hand--hour"
        :style="{ '--hand-deg': `${displayHour}deg` }"
      ></span>

      <span class="clock-dial__hub"></span>
    </div>

    <div class="clock-dial__center">
      <slot name="center" />
    </div>

    <ul
      v-if="mode === 'select' && seatNodes.length"
      class="clock-dial__seats"
      :aria-label="ariaLabel || undefined"
    >
      <li
        v-for="(seat, index) in seatNodes"
        :key="seat.seat"
        class="clock-dial__seat-slot"
        :style="seat.style"
      >
        <button
          type="button"
          data-dial-seat
          class="clock-dial__seat"
          :class="{ 'is-selected': seat.selected, 'is-blocked': seat.disabled }"
          :disabled="seat.disabled"
          :aria-pressed="seat.selected ? 'true' : 'false'"
          :aria-label="seat.accessibleName"
          @click="onSeatClick(seat)"
          @keydown="onSeatKeydown($event, index)"
        >
          <span class="clock-dial__seat-index">{{ seat.seat }}</span>
          <span class="clock-dial__seat-name">{{ seat.label }}</span>
          <span v-if="seat.state" class="clock-dial__seat-state">{{ seat.state }}</span>
        </button>
      </li>
    </ul>

    <slot />
  </div>
</template>

<style lang="scss">
@use "../styles/clock-dial";
</style>

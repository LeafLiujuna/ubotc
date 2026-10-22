<script setup lang="ts">
/**
 * Full-screen announcement for a day/night change.
 *
 * Pure renderer: every timing decision lives in `usePhaseTransition`, and this
 * component only maps the machine's current stage onto class names. That split
 * is what lets the sequencing be unit-tested without a DOM.
 *
 * Teleported to `<body>` because the game view is a positioned, occasionally
 * transformed subtree — anchoring a fixed overlay inside it would make the
 * banner drift with the table. The z-index sits above every panel and below
 * `--ts-z-modal`, so an open dialog is never covered by a passing banner.
 *
 * Accessibility: the visual layer is `aria-hidden`, and the phase is announced
 * separately through a polite live region. Screen-reader users get the fact
 * without the theatre, and never have a 2.8s animation read to them twice.
 */
import { computed } from "vue";
import { usePhaseTransition } from "@/composables/usePhaseTransition";

// `shaking` is deliberately not read here: the jolt belongs to the hall behind
// the banner, so `Game.vue` puts `.phase-shake` on the view root instead.
const { cue, stage, inputLocked, skip } = usePhaseTransition();

const isDayOrNight = computed(() => cue.value?.kind === "day" || cue.value?.kind === "night");
const title = computed(() => cue.value?.kind === "day"
  ? "白天"
  : cue.value?.kind === "night" ? "夜晚" : cue.value?.title || "");

/** Keep the spoken announcement consistent with the visible banner. */
const announcement = computed(() =>
  isDayOrNight.value
    ? title.value
    : cue.value ? `${cue.value.title}。${cue.value.subtitle}` : "",
);

const rootClass = computed(() => {
  const active = cue.value;
  if (!active) return [];
  return [
    `phase-transition--${active.kind}`,
    `is-${stage.value}`,
    { "is-locked": inputLocked.value && active.kind !== "night" },
  ];
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="cue"
      :key="cue.id"
      class="phase-transition"
      :class="rootClass"
      aria-hidden="true"
      @pointerdown="skip"
    >
      <template v-if="cue.kind !== 'night'">
        <div class="phase-transition__wash"></div>
        <div class="phase-transition__clouds phase-transition__clouds--far"></div>
        <div class="phase-transition__clouds phase-transition__clouds--near"></div>
      </template>

      <div class="phase-transition__banner">
        <p v-if="!isDayOrNight" class="phase-transition__eyebrow">{{ cue.eyebrow }}</p>
        <p class="phase-transition__title">
          <span class="phase-transition__title-text">{{ title }}</span>
          <span class="phase-transition__sheen"></span>
        </p>
        <span v-if="!isDayOrNight" class="filigree-divider phase-transition__rule">
          <span class="filigree-divider__mark"></span>
        </span>
        <p v-if="!isDayOrNight" class="phase-transition__subtitle">{{ cue.subtitle }}</p>
        <p v-if="!isDayOrNight && cue.footer" class="phase-transition__footer">{{ cue.footer }}</p>
      </div>

      <p v-if="inputLocked && !isDayOrNight" class="phase-transition__hint">点按任意处跳过</p>
    </div>
  </Teleport>

  <span class="sr-only" role="status">{{ announcement }}</span>
</template>

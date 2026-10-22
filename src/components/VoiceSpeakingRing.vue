<script setup lang="ts">
defineProps<{ active?: boolean }>()
</script>

<template>
  <Transition name="voice-speaking">
    <span v-if="active" class="voice-speaking-ring" aria-hidden="true" />
  </Transition>
</template>

<style scoped>
.voice-speaking-ring {
  position: absolute;
  z-index: 3;
  inset: -5px;
  border: clamp(3px, .5vmin, 6px) solid #ffc43d;
  border-radius: calc(var(--voice-portrait-radius, 7px) + 4px);
  box-shadow: 0 0 8px #efad2966, inset 0 0 2px #ffdc83;
  pointer-events: none;
  animation: voice-speaking-pulse .85s ease-in-out infinite alternate;
}
@keyframes voice-speaking-pulse {
  from { opacity: .65; transform: scale(1); }
  to { opacity: 1; transform: scale(1.035); }
}
.voice-speaking-enter-active, .voice-speaking-leave-active { transition: opacity .16s ease; }
.voice-speaking-enter-from, .voice-speaking-leave-to { opacity: 0; }
.voice-speaking-leave-active { animation: none; }
@media (prefers-reduced-motion: reduce) {
  .voice-speaking-ring { animation: none; }
  .voice-speaking-enter-active, .voice-speaking-leave-active { transition: none; }
}
</style>

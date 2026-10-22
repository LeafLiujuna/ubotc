<template>
  <svg class="role-alignment-filter" width="0" height="0" aria-hidden="true" focusable="false">
    <defs>
      <filter :id="filterId" color-interpolation-filters="sRGB">
        <!-- Select only the opposite alignment, keeping neutral artwork intact. -->
        <feColorMatrix in="SourceGraphic" :values="mask" result="mask" />
        <feColorMatrix in="SourceGraphic" values="0 0 1 0 0  .55 1 -.55 0 0  1 0 0 0 0  0 0 0 1 0" result="tinted" />
        <feComposite in="tinted" in2="mask" operator="in" result="colored" />
        <feComposite in="SourceGraphic" in2="mask" operator="out" result="original" />
        <feComposite in="colored" in2="original" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
      </filter>
    </defs>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ filterId: string; alignment?: string }>();
const mask = computed(() => `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${props.alignment === 'good' ? '6 -3 -3' : '-3 -3 6'} 0 -.5`);
</script>

<style scoped>
.role-alignment-filter { position: absolute; pointer-events: none; }
</style>

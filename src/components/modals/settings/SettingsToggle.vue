<script setup lang="ts">
defineProps<{ label: string; modelValue: boolean; disabled?: boolean; title?: string }>();
defineEmits<{ "update:modelValue": [value: boolean] }>();
</script>

<template>
  <div class="settings-row" :title="title">
    <span>{{ label }}</span>
    <button type="button" class="settings-control settings-toggle" role="switch"
      :aria-label="label" :aria-checked="modelValue" :class="{ enabled: modelValue }"
      :disabled="disabled" @click="$emit('update:modelValue', !modelValue)">
      <span aria-hidden="true">{{ modelValue ? '✓' : '●' }}</span>
    </button>
  </div>
</template>

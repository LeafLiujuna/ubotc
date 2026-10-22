<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  dead: boolean;
  voteless: boolean;
  canEdit: boolean;
  pending?: boolean;
  seat: number;
}>();
const emit = defineEmits<{ cycle: [] }>();
const status = computed(() => !props.dead ? '存活' : props.voteless ? '已死亡，死人票已用' : '已死亡，保留一张死人票');
const action = computed(() => !props.dead ? '标记死亡' : props.voteless ? '恢复存活' : '消耗死人票');
const label = computed(() => `第 ${props.seat} 席：${status.value}${props.canEdit ? `；点击${action.value}` : ''}`);
</script>

<template>
  <component :is="canEdit ? 'button' : 'span'" class="death-shroud"
    :class="{ 'death-shroud--alive': !dead }" :type="canEdit ? 'button' : undefined"
    :role="canEdit ? undefined : 'img'" :disabled="canEdit ? pending : undefined"
    :aria-label="label" :title="label" @click.stop="canEdit && !pending && emit('cycle')">
    <span v-if="dead && voteless" class="death-shroud__spent" aria-hidden="true"></span>
  </component>
</template>

<style scoped>
.death-shroud {
  position: absolute;
  top: -13%;
  left: 50%;
  z-index: 9;
  width: 36%;
  height: 50%;
  transform: translateX(-50%);
  appearance: none;
  box-sizing: border-box;
  min-height: 0;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: url('@/assets/shroud.png') center top / 100% 100% no-repeat;
  filter: drop-shadow(0 2px 2px #0009);
  transition: opacity 150ms ease;
}
button.death-shroud { cursor: pointer; }
span.death-shroud { pointer-events: none; }
.death-shroud--alive { opacity: 0; }
.death-shroud--alive:hover, .death-shroud--alive:focus-visible { opacity: .65; }
.death-shroud:focus-visible { outline: 2px solid #e9cd86; outline-offset: 3px; }
.death-shroud:disabled { cursor: wait; }
.death-shroud__spent {
  position: absolute;
  top: 13%;
  left: 13%;
  width: 74%;
  aspect-ratio: 1;
  box-sizing: border-box;
  border: 2px solid #b8a0ca;
  border-radius: 50%;
  background: radial-gradient(circle, #72518f80 45%, #35223bc9 75%);
  box-shadow: 0 0 0 1px #26202c, inset 0 0 3px #d6b5e5;
}
@media (prefers-reduced-motion: reduce) { .death-shroud { transition: none; } }
</style>

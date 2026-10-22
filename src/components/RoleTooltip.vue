<template>
  <aside :id="id" ref="tooltip" role="tooltip" class="role-tooltip" :class="`role-tooltip--${side}`" :style="position">
    <div class="role-tooltip__content">
      <p class="role-tooltip__heading">
        <strong :class="`role-tooltip__name--${role.team}`">{{ role.name || '未命名角色' }}</strong>
        <span v-if="role.englishName"> ({{ role.englishName }})</span>
        <span v-if="teamLabel"> – {{ teamLabel }}</span>
      </p>
      <p v-if="role.ability" class="role-tooltip__ability">{{ role.ability }}</p>
      <p v-if="role.flavor" class="role-tooltip__flavor">{{ role.flavor }}</p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, type CSSProperties } from 'vue';
import type { GameScriptCharacter } from '@/types/gameScript';
import { roleTooltipPosition, type RoleTooltipSide } from '@/utils/roleTooltipPosition';

const props = defineProps<{
  id: string;
  role: GameScriptCharacter & { englishName?: string };
  anchor: HTMLElement;
}>();
const tooltip = ref<HTMLElement | null>(null);
const position = ref<CSSProperties>({ left: '0px', top: '0px', visibility: 'hidden' });
const side = ref<RoleTooltipSide>('right');
const teamLabel = computed(() => ({
  townsfolk: '镇民', outsider: '外来者', minion: '爪牙', demon: '恶魔',
  traveler: '旅行者', fabled: '传奇角色', loric: '奇遇角色',
}[props.role.team] || ''));

onMounted(() => {
  if (!tooltip.value || !props.anchor.isConnected) return;
  const table = props.anchor.closest('.reference-table')?.getBoundingClientRect();
  const placement = roleTooltipPosition(props.anchor.getBoundingClientRect(), tooltip.value.getBoundingClientRect(),
    { width: window.innerWidth, height: window.innerHeight }, table ? table.left + table.width / 2 : undefined);
  side.value = placement.side;
  position.value = { ...placement.style, visibility: 'visible' };
});
</script>

<style scoped lang="scss">
.role-tooltip {
  position: fixed;
  z-index: var(--ts-z-tooltip, 80);
  box-sizing: border-box;
  width: 400px;
  max-width: calc(100vw - 16px);
  padding: 8px 10px 9px;
  border: 1px solid var(--ts-border-strong, #8f7443);
  border-radius: 7px;
  background:
    var(--ts-noise-parchment, none),
    radial-gradient(ellipse at 45% 30%, #fffbed 0%, #f1e7cf 72%, #e4d4af 100%);
  box-shadow: 0 2px 6px #0007, inset 0 0 9px #a0804c25;
  color: var(--ts-text-on-parchment, #2a1b18);
  font-family: var(--ts-font-ui, 'Microsoft YaHei', sans-serif);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
  text-align: left;
  text-shadow: none;
  white-space: normal;
  overflow-wrap: anywhere;
  pointer-events: none;
  animation: role-tooltip-appear 120ms ease-out;

  &__content { max-height: calc(100dvh - 36px); overflow-y: auto; }

  &::before, &::after {
    content: '';
    position: absolute;
    width: 0;
    height: 0;
    border: 9px solid transparent;
  }
  &::after { border-width: 8px; }
  &--right::before, &--right::after,
  &--left::before, &--left::after {
    top: var(--pointer-y);
    transform: translateY(-50%);
  }
  &--right::before { left: -10px; border-left: 0; border-right-color: var(--ts-border-strong, #8f7443); }
  &--right::after { left: -8px; border-left: 0; border-right-color: #f4ead3; }
  &--left::before { right: -10px; border-right: 0; border-left-color: var(--ts-border-strong, #8f7443); }
  &--left::after { right: -8px; border-right: 0; border-left-color: #f4ead3; }
  &--top::before, &--top::after,
  &--bottom::before, &--bottom::after {
    left: var(--pointer-x);
    transform: translateX(-50%);
  }
  &--bottom::before { top: -10px; border-top: 0; border-bottom-color: var(--ts-border-strong, #8f7443); }
  &--bottom::after { top: -8px; border-top: 0; border-bottom-color: #f4ead3; }
  &--top::before { bottom: -10px; border-bottom: 0; border-top-color: var(--ts-border-strong, #8f7443); }
  &--top::after { bottom: -8px; border-bottom: 0; border-top-color: #f4ead3; }

  :where(p) { margin: 0; }
  &__heading { margin-bottom: 3px; }
  &__name--townsfolk { color: var(--ts-almanac-blue, #1e6ba6); }
  &__name--outsider { color: #238da8; }
  &__name--minion { color: #b74625; }
  &__name--demon { color: var(--ts-wax-crimson, #7c2229); }
  &__name--traveler { color: #795093; }
  &__name--fabled, &__name--loric { color: #88651b; }
  &__ability { white-space: pre-line; }
  &__flavor {
    margin-top: 3px;
    color: var(--ts-ink-faded, #7f7461);
    font-style: italic;
    font-weight: 400;
  }
}

@keyframes role-tooltip-appear { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .role-tooltip { animation: none; } }
</style>

import { h, render, type ObjectDirective } from 'vue';
import type { GameScriptCharacter } from '@/types/gameScript';
import RoleTooltip from '@/components/RoleTooltip.vue';

type TooltipRole = GameScriptCharacter | null | undefined;
type TooltipState = { role: TooltipRole; hide: () => void; cleanup: () => void };
const states = new WeakMap<HTMLElement, TooltipState>();
let activeHide: (() => void) | undefined;
let nextId = 0;

/** Attach to the interactive token so keyboard focus and pointer hover agree. */
export const roleTooltip: ObjectDirective<HTMLElement, TooltipRole> = {
  mounted(element, binding) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let container: HTMLDivElement | undefined;
    const id = `role-tooltip-${++nextId}`;
    const state: TooltipState = { role: binding.value, hide, cleanup };
    function hide() {
      clearTimeout(timer);
      if (container) {
        render(null, container);
        container.remove();
        container = undefined;
      }
      const descriptions = (element.getAttribute('aria-describedby') || '').split(/\s+/).filter(value => value && value !== id);
      if (descriptions.length) element.setAttribute('aria-describedby', descriptions.join(' '));
      else element.removeAttribute('aria-describedby');
      if (activeHide === hide) activeHide = undefined;
    }
    function show() {
      activeHide?.();
      hide();
      if (!state.role?.id || element.matches(':disabled')) return;
      activeHide = hide;
      timer = setTimeout(() => {
        if (!state.role?.id || !element.isConnected) return;
        container = document.createElement('div');
        document.body.append(container);
        render(h(RoleTooltip, { id, role: state.role, anchor: element }), container);
        element.setAttribute('aria-describedby', [element.getAttribute('aria-describedby'), id].filter(Boolean).join(' '));
      }, 180);
    }
    function enter(event: PointerEvent) {
      if (event.pointerType === 'touch') return;
      show();
    }
    function keydown(event: KeyboardEvent) { if (event.key === 'Escape') hide(); }
    function cleanup() {
      hide();
      element.removeEventListener('pointerenter', enter);
      element.removeEventListener('pointerleave', hide);
      element.removeEventListener('pointerdown', hide);
      element.removeEventListener('focus', show);
      element.removeEventListener('blur', hide);
      element.removeEventListener('click', hide);
      document.removeEventListener('keydown', keydown);
      window.removeEventListener('resize', hide);
      window.removeEventListener('scroll', hide, true);
    }
    element.addEventListener('pointerenter', enter);
    element.addEventListener('pointerleave', hide);
    element.addEventListener('pointerdown', hide);
    element.addEventListener('focus', show);
    element.addEventListener('blur', hide);
    element.addEventListener('click', hide);
    document.addEventListener('keydown', keydown);
    window.addEventListener('resize', hide);
    window.addEventListener('scroll', hide, true);
    states.set(element, state);
  },
  updated(element, binding) {
    const state = states.get(element);
    if (!state) return;
    if (state.role !== binding.value) state.hide();
    state.role = binding.value;
  },
  beforeUnmount(element) {
    states.get(element)?.cleanup();
    states.delete(element);
  },
};

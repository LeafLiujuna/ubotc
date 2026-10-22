import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { shallowMount } from '@vue/test-utils';
import { nextTick } from 'vue';
import GrimoireRevealToken from '@/components/GrimoireRevealToken.vue';
import Token from '@/components/Token.vue';
import { setAppMotionEnabled } from '@/composables/useMotion';

const role = { id: 'chef', name: '厨师', team: 'townsfolk' };
beforeEach(() => { setActivePinia(createPinia()); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-18T00:00:00Z')); setAppMotionEnabled(true); });
afterEach(() => { setAppMotionEnabled(true); vi.useRealTimers(); });

test('secret roles stay out of the rendered faces while the blank discs turn face-down', async () => {
  const wrapper = shallowMount(GrimoireRevealToken, { props: { role, revealed: false, seatIndex: 2, startedAt: Date.now() } });
  try {
    expect(wrapper.findComponent(Token).props('role')).toEqual({ id: '' });
    expect(wrapper.attributes('data-reveal-state')).toBe('covering');
    await vi.advanceTimersByTimeAsync(1779);
    expect(wrapper.attributes('data-reveal-state')).toBe('covering');
    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.attributes('data-reveal-state')).toBe('covered');
    expect(wrapper.findComponent(Token).props('role')).toEqual({ id: '' });
  } finally { wrapper.unmount(); }
});

test('an early reveal waits for the cover to finish, turns once and settles face-up', async () => {
  const wrapper = shallowMount(GrimoireRevealToken, { props: { role, revealed: false, seatIndex: 0, startedAt: Date.now() } });
  try {
    await wrapper.setProps({ revealed: true });
    expect(wrapper.findComponent(Token).props('role')).toEqual({ id: '' });
    await vi.advanceTimersByTimeAsync(1600);
    expect(wrapper.attributes('data-reveal-state')).toBe('revealing');
    expect(wrapper.findComponent(Token).props('role')).toEqual(role);
    expect(wrapper.findComponent(Token).props('animateChanges')).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.attributes('data-reveal-state')).toBe('revealed');
    await wrapper.setProps({ role: { ...role } });
    expect(wrapper.attributes('data-reveal-state')).toBe('revealed');
  } finally { wrapper.unmount(); }
});

test('a staggered reveal stays raised through its delay and settles face-up after the turn', async () => {
  const wrapper = shallowMount(GrimoireRevealToken, { props: { role, revealed: false, seatIndex: 3, startedAt: Date.now() - 10000, turnDelay: 270 } });
  try {
    await wrapper.setProps({ revealed: true });
    expect(wrapper.attributes('data-reveal-state')).toBe('revealing');
    expect(wrapper.attributes('style')).toContain('--reveal-turn-delay: 270ms');
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.attributes('data-reveal-state')).toBe('revealing');
    await vi.advanceTimersByTimeAsync(269);
    expect(wrapper.attributes('data-reveal-state')).toBe('revealing');
    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.attributes('data-reveal-state')).toBe('revealed');
  } finally { wrapper.unmount(); }
});

test('players wait for the public role projection if the reveal event arrives first', async () => {
  const wrapper = shallowMount(GrimoireRevealToken, { props: { role: { id: '' }, revealed: false, seatIndex: 0, startedAt: Date.now() - 10000 } });
  try {
    await wrapper.setProps({ revealed: true });
    expect(wrapper.attributes('data-reveal-state')).toBe('covered');
    await wrapper.setProps({ role });
    expect(wrapper.attributes('data-reveal-state')).toBe('revealing');
    expect(wrapper.findComponent(Token).props('role')).toEqual(role);
  } finally { wrapper.unmount(); }
});

test('a newly revealed seat whose role projection arrives after mount still animates', async () => {
  const wrapper = shallowMount(GrimoireRevealToken, { props: { role: { id: '' }, revealed: true, animateInitialReveal: true, seatIndex: 0, startedAt: Date.now() - 10000 } });
  try {
    expect(wrapper.attributes('data-reveal-state')).toBe('covered');
    await wrapper.setProps({ role });
    expect(wrapper.attributes('data-reveal-state')).toBe('revealing');
    expect(wrapper.findComponent(Token).props('role')).toEqual(role);
    await vi.advanceTimersByTimeAsync(1000);
    expect(wrapper.attributes('data-reveal-state')).toBe('revealed');
  } finally { wrapper.unmount(); }
});

test('reconnect resumes a cover at its original offset and does not replay completed reveals', async () => {
  const wrapper = shallowMount(GrimoireRevealToken, { props: { role, revealed: false, seatIndex: 1, startedAt: Date.now() - 1000 } });
  try {
    expect(wrapper.attributes('style')).toContain('-910ms');
    await vi.advanceTimersByTimeAsync(690);
    expect(wrapper.attributes('data-reveal-state')).toBe('covered');
  } finally { wrapper.unmount(); }
  const restored = shallowMount(GrimoireRevealToken, { props: { role: { id: '' }, revealed: true, seatIndex: 1, startedAt: Date.now() - 10000 } });
  try {
    await restored.setProps({ role });
    expect(restored.attributes('data-reveal-state')).toBe('revealed');
    expect(restored.find('.is-turning').exists()).toBe(false);
  } finally { restored.unmount(); }
});

test('storyteller hover preview does not change the public reveal state', async () => {
  const wrapper = shallowMount(GrimoireRevealToken, { props: { role, revealed: false, seatIndex: 0, startedAt: Date.now() - 10000 } });
  try {
    await wrapper.setProps({ preview: true });
    expect(wrapper.findAllComponents(Token).map(token => token.props('role'))).toEqual([{ id: '' }, role]);
    expect(wrapper.attributes('data-reveal-state')).toBe('covered');
    await wrapper.setProps({ preview: false });
    expect(wrapper.findAllComponents(Token).map(token => token.props('role'))).toEqual([{ id: '' }]);
  } finally { wrapper.unmount(); }
});

test('reducing motion settles current turns immediately and still honors public reveal permissions', async () => {
  const wrapper = shallowMount(GrimoireRevealToken, { props: { role, revealed: false, seatIndex: 0, startedAt: Date.now() } });
  try {
    setAppMotionEnabled(false); await nextTick();
    expect(wrapper.attributes('data-reveal-state')).toBe('covered');
    await wrapper.setProps({ revealed: true });
    expect(wrapper.attributes('data-reveal-state')).toBe('revealed');
    expect(wrapper.findComponent(Token).props('role')).toEqual(role);
    expect(vi.getTimerCount()).toBe(0);
  } finally { wrapper.unmount(); }
});

test('leaving during an animation clears its scheduled work', () => {
  const wrapper = shallowMount(GrimoireRevealToken, { props: { role, revealed: false, seatIndex: 0, startedAt: Date.now() } });
  expect(vi.getTimerCount()).toBe(1);
  wrapper.unmount(); expect(vi.getTimerCount()).toBe(0);
});

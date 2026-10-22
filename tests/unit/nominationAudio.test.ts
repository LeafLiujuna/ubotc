import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick, reactive } from 'vue';
import { useAppStore } from '@/stores/app';
import { useNominationAudio } from '@/composables/useNominationAudio';

const clips: FakeAudio[] = [];
class FakeAudio {
  currentTime = 0;
  volume = 1;
  play = vi.fn().mockResolvedValue(undefined);
  pause = vi.fn();
  constructor(public src: string) { clips.push(this); }
}
let wrapper: ReturnType<typeof mount>;
beforeEach(() => {
  setActivePinia(createPinia());
  clips.length = 0;
  vi.stubGlobal('Audio', FakeAudio);
  vi.spyOn(Date, 'now').mockReturnValue(10000);
});
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function create(locked = 0) {
  const state = reactive({ round: 'one', active: true, paused: false, locked,
    countdown: null as { remainingMs: number; receivedAt: number; paused: boolean } | null });
  wrapper = mount({ setup() { useNominationAudio(() => ({ ...state })); return () => null; } });
  return state;
}

test('plays one neutral lock per seat advance, ignoring initial history, duplicate sync and resets', async () => {
  const state = create(2);
  expect(clips).toHaveLength(0);
  state.locked = 3; await nextTick();
  expect(clips[0].src).toContain('vote-lock.mp3');
  expect(clips[0].play).toHaveBeenCalledTimes(1);
  state.locked = 3; await nextTick();
  state.round = 'two'; state.locked = 0; await nextTick();
  expect(clips[0].play).toHaveBeenCalledTimes(1);
  state.locked = 1; await nextTick();
  expect(clips[0].play).toHaveBeenCalledTimes(2);
  state.active = false; state.locked = 4; await nextTick();
  expect(clips[0].play).toHaveBeenCalledTimes(2);
});

test('seeks countdowns to the authoritative time and holds them during pause', async () => {
  const state = create();
  state.countdown = { remainingMs: 2500, receivedAt: 9500, paused: false }; await nextTick();
  const audio = clips[0];
  expect(audio.src).toContain('countdown.mp3');
  expect(audio.currentTime).toBe(1);
  expect(audio.play).toHaveBeenCalledTimes(1);
  state.countdown = { remainingMs: 1800, receivedAt: 10000, paused: true }; await nextTick();
  expect(audio.currentTime).toBe(1.2);
  expect(audio.play).toHaveBeenCalledTimes(1);
  state.countdown = { remainingMs: 1800, receivedAt: 10000, paused: false }; await nextTick();
  expect(audio.currentTime).toBe(1.2);
  expect(audio.play).toHaveBeenCalledTimes(2);
  const pauses = audio.pause.mock.calls.length;
  state.countdown = null; await nextTick();
  expect(audio.pause).toHaveBeenCalledTimes(pauses);
  state.paused = true; await nextTick();
  expect(audio.pause).toHaveBeenCalledTimes(pauses + 1);
});

test('uses current sound volume, immediately silences active clips, and releases them on close', async () => {
  const state = create();
  const prefs = useAppStore().grimoire;
  prefs.soundVolume = 25;
  state.countdown = { remainingMs: 3000, receivedAt: 10000, paused: false }; await nextTick();
  expect(clips[0].volume).toBe(0.25);
  prefs.isMuted = true; await nextTick();
  expect(clips[0].volume).toBe(0);
  expect(clips[0].pause).toHaveBeenCalled();
  state.locked = 1; await nextTick();
  expect(clips[1].play).not.toHaveBeenCalled();
  prefs.isMuted = false; prefs.soundVolume = 50; await nextTick();
  state.countdown = null; state.locked = 2; await nextTick();
  expect(clips[1].volume).toBe(0.5);
  expect(clips[1].play).toHaveBeenCalledTimes(1);
  const pauses = clips[1].pause.mock.calls.length;
  wrapper.unmount();
  expect(clips[1].pause).toHaveBeenCalledTimes(pauses + 1);
});

test('handles rejected autoplay without scheduling delayed sounds', async () => {
  const state = create();
  state.locked = 1; await nextTick();
  clips[0].play.mockRejectedValue(new Error('NotAllowedError'));
  state.locked = 2; await nextTick(); await Promise.resolve();
  expect(clips[0].play).toHaveBeenCalledTimes(2);
});

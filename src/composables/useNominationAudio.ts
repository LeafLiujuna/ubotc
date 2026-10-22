import { onBeforeUnmount, watch } from 'vue';
import { useAppStore } from '@/stores/app';
import countdownUrl from '@/assets/sounds/countdown.mp3';
import lockUrl from '@/assets/sounds/vote-lock.mp3';

type NominationAudioState = {
  round: string | number | null;
  active: boolean;
  paused: boolean;
  locked: number;
  countdown: { remainingMs: number; receivedAt: number; paused: boolean } | null;
};

/** Sound follows the voting clock; ballot choices never affect what others hear. */
export function useNominationAudio(state: () => NominationAudioState): void {
  const app = useAppStore();
  let countdown: HTMLAudioElement | null = null;
  let lock: HTMLAudioElement | null = null;
  const volume = () => app.grimoire.isMuted ? 0
    : Math.max(0, Math.min(1, app.grimoire.soundVolume / 100));
  const stop = (audio: HTMLAudioElement | null) => { audio?.pause(); };
  const play = (audio: HTMLAudioElement) => {
    audio.volume = volume();
    if (!audio.volume) return;
    // Autoplay restrictions and missing audio devices must not interrupt a vote.
    void audio.play()?.catch(() => {});
  };

  watch(state, (next, previous) => {
    if (next.round !== previous?.round || !next.active || next.paused
      || next.locked < (previous?.locked ?? 0)) {
      stop(countdown);
      stop(lock);
    }
    const timing = next.countdown;
    if (timing && next.active) {
      countdown ??= new Audio(countdownUrl);
      stop(countdown);
      // A reconnect or resume picks up the current numeral instead of saying 3 again.
      countdown.currentTime = Math.max(0, (3000 - timing.remainingMs
        + (timing.paused ? 0 : Date.now() - timing.receivedAt)) / 1000);
      if (!timing.paused) play(countdown);
    }
    // The fourth cue says "start" at 3s. Let its tail finish as the hand begins
    // sweeping; resets, pauses and closing still stop both clips above.
    if (previous && next.round === previous.round && next.active
      && next.locked > previous.locked) {
      // Coalesced/replayed packets get one cue, never a burst of historical sounds.
      lock ??= new Audio(lockUrl);
      stop(lock);
      lock.currentTime = 0;
      play(lock);
    }
  }, { immediate: true });

  watch(() => [app.grimoire.isMuted, app.grimoire.soundVolume], () => {
    for (const audio of [countdown, lock]) if (audio) {
      audio.volume = volume();
      if (!audio.volume) stop(audio);
    }
  });
  onBeforeUnmount(() => { stop(countdown); stop(lock); });
}

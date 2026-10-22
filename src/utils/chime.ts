/**
 * Synthesised clocktower bell.
 *
 * The repository ships one sound effect (`countdown`) and no bell, so the
 * phase-transition chime is generated at runtime instead of adding a binary
 * asset. A struck bell is a handful of
 * *inharmonic* partials — ratios that are deliberately not integer multiples —
 * each decaying at its own rate, with the high partials dying first. Four sine
 * oscillators reproduce that convincingly at a fraction of the bytes.
 *
 * Every entry point is best-effort: browsers refuse to start an AudioContext
 * before the first user gesture, and a game can legitimately reach a phase
 * change without one (a spectator who loaded the page and never clicked). A
 * silent failure is the correct outcome there — the visual banner carries the
 * message on its own.
 */

/** Timbres: one per phase cue, plus the vote-turn ding. */
export type ChimeVoice = "night" | "day" | "toll" | "double" | "turn" | "invite" | "voiceJoin" | "voiceLeave" | "decline";

interface VoiceSpec {
  /** Fundamental in Hz. */
  root: number;
  /** Inharmonic partial ratios, quietest last. */
  partials: number[];
  /** Seconds until the fundamental has decayed to silence. */
  decay: number;
  /** Peak gain, kept well under 1 so a phase change never dominates voice chat. */
  peak: number;
  /** Extra strikes after the first, as [delaySeconds, gainScale] pairs. */
  restrikes?: Array<[number, number]>;
}

const VOICES: Record<ChimeVoice, VoiceSpec> = {
  invite: { root: 659.3, partials: [1, 2.01], decay: 0.55, peak: 0.07, restrikes: [[0.2, 0.8]] },
  voiceJoin: { root: 783.99, partials: [1, 1.5, 2], decay: 0.45, peak: 0.06 },
  voiceLeave: { root: 392, partials: [1, 1.5], decay: 0.4, peak: 0.06 },
  decline: { root: 329.6, partials: [1, 2.01], decay: 0.35, peak: 0.05 },
  // Night: a low, cold bell. Long decay, dark partials.
  night: {
    root: 174.6,
    partials: [1, 2.02, 2.98, 5.42],
    decay: 4.2,
    peak: 0.13,
  },
  // Day: brighter and shorter — a hand bell rather than a tower bell.
  day: {
    root: 293.7,
    partials: [1, 2.01, 3.04, 4.98],
    decay: 2.8,
    peak: 0.11,
  },
  // Final judgement: the deepest toll, struck twice.
  toll: {
    root: 116.5,
    partials: [1, 2.04, 2.94, 4.1],
    decay: 5.6,
    peak: 0.15,
    restrikes: [[1.5, 0.82]],
  },
  // Return to town square: two quick strikes, a summons rather than a knell.
  double: {
    root: 261.6,
    partials: [1, 2.03, 3.01],
    decay: 2.2,
    peak: 0.1,
    restrikes: [[0.26, 0.86]],
  },
  // Your vote turn: one small bright ding. Short and quiet on purpose — it can
  // land mid-discussion and must never talk over the table.
  turn: {
    root: 523.3,
    partials: [1, 2.02, 2.96],
    decay: 1.1,
    peak: 0.08,
  },
};

type AudioContextCtor = typeof AudioContext;

let sharedContext: AudioContext | null = null;

const resolveAudioContextCtor = (): AudioContextCtor | null => {
  if (typeof window === "undefined") return null;
  const legacy = (window as unknown as { webkitAudioContext?: AudioContextCtor })
    .webkitAudioContext;
  return window.AudioContext ?? legacy ?? null;
};

/**
 * Lazily create the one shared context. Browsers cap the number of contexts a
 * page may open, and creating one per chime leaks them.
 */
const acquireContext = (): AudioContext | null => {
  if (sharedContext) return sharedContext;
  const Ctor = resolveAudioContextCtor();
  if (!Ctor) return null;
  try {
    sharedContext = new Ctor();
  } catch {
    return null;
  }
  return sharedContext;
};

/** Schedule one strike of the bell at `startAt` on the context clock. */
const strike = (
  context: AudioContext,
  destination: AudioNode,
  spec: VoiceSpec,
  startAt: number,
  gainScale: number,
): void => {
  spec.partials.forEach((ratio, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = spec.root * ratio;

    // Upper partials are quieter and die sooner: that ratio is what separates a
    // bell from an organ pipe.
    const partialPeak = (spec.peak * gainScale) / (index + 1) ** 1.35;
    const partialDecay = spec.decay / (index + 1) ** 0.6;

    gain.gain.setValueAtTime(0.0001, startAt);
    // A 6ms attack keeps the strike transient without the click of a hard start.
    gain.gain.exponentialRampToValueAtTime(Math.max(partialPeak, 0.0002), startAt + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + partialDecay);

    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + partialDecay + 0.05);
  });
};

/**
 * Play a phase-transition bell. No-op when muted, when the platform has no Web
 * Audio, or when the context cannot be resumed without a user gesture.
 */
export const playChime = (voice: ChimeVoice, options: { muted?: boolean; volume?: number } = {}): void => {
  if (options.muted) return;

  const spec = VOICES[voice];
  if (!spec) return;

  const context = acquireContext();
  if (!context) return;

  if (context.state === "suspended") {
    // Returns a promise that rejects when no gesture has happened yet. The
    // strikes below are still scheduled; they simply play inaudibly if the
    // resume never lands, which is the same outcome as staying silent.
    void context.resume().catch(() => {});
  }

  try {
    // One shared low-pass rounds off the digital edge of stacked sines.
    const tone = context.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2600;
    tone.Q.value = 0.5;
    const master = context.createGain();
    master.gain.value = Math.max(0, Math.min(1, (options.volume ?? 100) / 100));
    tone.connect(master);
    master.connect(context.destination);

    const now = context.currentTime;
    strike(context, tone, spec, now, 1);
    for (const [delay, gainScale] of spec.restrikes ?? []) {
      strike(context, tone, spec, now + delay, gainScale);
    }
  } catch {
    // An exhausted or closed context should never break a phase change.
  }
};

/** Test seam: drop the cached context so a fresh one is built next call. */
export const resetChimeContext = (): void => {
  if (sharedContext && typeof sharedContext.close === "function") {
    void Promise.resolve(sharedContext.close()).catch(() => {});
  }
  sharedContext = null;
};

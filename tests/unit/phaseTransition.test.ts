import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  PHASE_TIMING,
  buildDayCue,
  buildFinalCue,
  buildNightCue,
  buildReturnCue,
  cnNumeral,
  usePhaseTransition,
} from "../../src/composables/usePhaseTransition";

/** Walk the machine's clock forward past one whole enter → hold → exit run. */
const FULL_RUN = PHASE_TIMING.enter + PHASE_TIMING.hold + PHASE_TIMING.exit;

describe("cnNumeral", () => {
  test("renders the day and night counts a table will realistically reach", () => {
    expect(cnNumeral(1)).toBe("一");
    expect(cnNumeral(9)).toBe("九");
    expect(cnNumeral(10)).toBe("十");
    expect(cnNumeral(11)).toBe("十一");
    expect(cnNumeral(20)).toBe("二十");
    expect(cnNumeral(37)).toBe("三十七");
  });

  test("falls back to digits rather than emitting nonsense", () => {
    expect(cnNumeral(0)).toBe("0");
    expect(cnNumeral(140)).toBe("140");
    expect(cnNumeral(2.5)).toBe("2.5");
  });
});

describe("cue builders", () => {
  test("number every night and day so a banner is never ambiguous", () => {
    expect(buildNightCue(2)).toMatchObject({
      kind: "night",
      eyebrow: "NIGHT 2",
      title: "第二夜",
      chime: "night",
    });
    expect(buildDayCue(3)).toMatchObject({
      kind: "day",
      eyebrow: "DAY 3",
      title: "第三天",
      footer: "TOWN SQUARE",
    });
  });

  test("fall back to an unnumbered banner for legacy rooms with no day counter", () => {
    expect(buildNightCue(null).eyebrow).toBe("NIGHTFALL");
    expect(buildDayCue(null).title).toBe("天亮了");
  });

  test("jolt the hall only for the cues that arrive as a summons", () => {
    expect(buildNightCue(1).shake).toBe(false);
    expect(buildDayCue(1).shake).toBe(false);
    expect(buildFinalCue().shake).toBe(true);
    expect(buildReturnCue().shake).toBe(true);
  });

  test("issue a distinct id per cue so a superseding banner remounts", () => {
    expect(buildNightCue(1).id).not.toBe(buildNightCue(1).id);
  });
});

describe("phase transition machine", () => {
  const machine = usePhaseTransition();

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    machine.reset();
  });

  afterEach(() => {
    machine.reset();
    vi.useRealTimers();
  });

  test("starts idle with nothing on screen", () => {
    expect(machine.stage.value).toBe("idle");
    expect(machine.cue.value).toBeNull();
    expect(machine.inputLocked.value).toBe(false);
  });

  test("runs enter → hold → exit → idle on the published timings", () => {
    machine.announce(buildNightCue(1));
    expect(machine.stage.value).toBe("enter");
    expect(machine.cue.value?.title).toBe("第一夜");

    vi.advanceTimersByTime(PHASE_TIMING.enter);
    expect(machine.stage.value).toBe("hold");

    vi.advanceTimersByTime(PHASE_TIMING.hold);
    expect(machine.stage.value).toBe("exit");

    vi.advanceTimersByTime(PHASE_TIMING.exit);
    expect(machine.stage.value).toBe("idle");
    expect(machine.cue.value).toBeNull();
  });

  test("claims the pointer while a banner is up and releases it after", () => {
    machine.announce(buildDayCue(1));
    expect(machine.inputLocked.value).toBe(true);

    vi.advanceTimersByTime(FULL_RUN);
    expect(machine.inputLocked.value).toBe(false);
  });

  test("stays click-through when a dialog already owns the pointer", () => {
    document.body.dataset.tsModalLockCount = "1";
    try {
      machine.announce(buildDayCue(1));
      expect(machine.cue.value).not.toBeNull();
      expect(machine.inputLocked.value).toBe(false);
    } finally {
      delete document.body.dataset.tsModalLockCount;
    }
  });

  test("jolts the hall only while a shaking cue is entering", () => {
    machine.announce(buildReturnCue());
    expect(machine.shaking.value).toBe(true);

    vi.advanceTimersByTime(PHASE_TIMING.enter);
    expect(machine.stage.value).toBe("hold");
    expect(machine.shaking.value).toBe(false);
  });

  test("skip cuts to the exit stage instead of dropping the banner", () => {
    machine.announce(buildNightCue(1));
    machine.skip();
    expect(machine.stage.value).toBe("exit");
    expect(machine.cue.value?.title).toBe("第一夜");

    vi.advanceTimersByTime(PHASE_TIMING.exit);
    expect(machine.stage.value).toBe("idle");
  });

  test("a second skip during the exit ends it immediately", () => {
    machine.announce(buildNightCue(1));
    machine.skip();
    machine.skip();
    expect(machine.stage.value).toBe("idle");
    expect(machine.cue.value).toBeNull();
  });

  test("queues a cue that lands mid-banner and plays it after the current one", () => {
    machine.announce(buildNightCue(1));
    vi.advanceTimersByTime(PHASE_TIMING.enter);
    expect(machine.stage.value).toBe("hold");

    // The night is barely up when the storyteller pushes on to day: the current
    // banner should hurry off rather than sit out its full hold.
    machine.announce(buildDayCue(1));
    expect(machine.stage.value).toBe("exit");
    expect(machine.cue.value?.title).toBe("第一夜");

    vi.advanceTimersByTime(PHASE_TIMING.exit);
    expect(machine.stage.value).toBe("enter");
    expect(machine.cue.value?.title).toBe("第一天");
  });

  test("keeps only the newest of several cues queued behind one banner", () => {
    machine.announce(buildNightCue(1));
    machine.announce(buildDayCue(1));
    machine.announce(buildFinalCue());

    vi.advanceTimersByTime(PHASE_TIMING.exit);
    expect(machine.cue.value?.kind).toBe("final");

    // …and the superseded day cue never appears afterwards.
    vi.advanceTimersByTime(FULL_RUN);
    expect(machine.stage.value).toBe("idle");
    expect(machine.cue.value).toBeNull();
  });

  test("reset clears a queued cue as well as the visible one", () => {
    machine.announce(buildNightCue(1));
    machine.announce(buildDayCue(1));
    machine.reset();

    expect(machine.stage.value).toBe("idle");
    expect(machine.cue.value).toBeNull();

    vi.advanceTimersByTime(FULL_RUN);
    expect(machine.cue.value).toBeNull();
  });
});

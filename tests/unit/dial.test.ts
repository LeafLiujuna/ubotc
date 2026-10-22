import { describe, expect, test } from "vitest";
import {
  advanceClockwise,
  countdownFraction,
  normaliseDeg,
  seatArc,
  seatToDeg,
  timeToHands,
} from "../../src/utils/dial";

describe("seatToDeg", () => {
  test("puts seat 1 at twelve o'clock and walks clockwise from there", () => {
    expect(seatToDeg(1, 12)).toBe(0);
    expect(seatToDeg(4, 12)).toBe(90);
    expect(seatToDeg(7, 12)).toBe(180);
    expect(seatToDeg(10, 12)).toBe(270);
  });

  test("spaces seats evenly for table sizes that are not clock-shaped", () => {
    expect(seatToDeg(1, 15)).toBe(0);
    expect(seatToDeg(6, 15)).toBe(120);
    expect(seatToDeg(15, 15)).toBeCloseTo(336, 6);
  });

  test("survives an empty table instead of dividing by zero", () => {
    expect(seatToDeg(1, 0)).toBe(0);
    expect(seatToDeg(Number.NaN, 12)).toBe(0);
  });
});

describe("advanceClockwise", () => {
  test("crosses twelve o'clock forwards rather than rewinding", () => {
    // Seat 12 -> seat 1 on a twelve-seat table: +20deg forward, never -340.
    expect(advanceClockwise(350, 10)).toBe(370);
  });

  test("stays put when the hand already points at the target", () => {
    expect(advanceClockwise(0, 0)).toBe(0);
    expect(advanceClockwise(90, 90)).toBe(90);
    // 370deg and 10deg are the same bearing, so there is nothing to travel.
    expect(advanceClockwise(370, 10)).toBe(370);
  });

  test("keeps climbing across many laps", () => {
    let angle = 0;
    const seen: number[] = [];
    // Three full circuits of a five-seat table.
    for (let lap = 0; lap < 3; lap += 1) {
      for (let seat = 1; seat <= 5; seat += 1) {
        angle = advanceClockwise(angle, seatToDeg(seat, 5));
        seen.push(angle);
      }
    }
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]).toBeGreaterThan(seen[i - 1]);
    }
    // Fifteen steps of 72deg, minus the first step which starts already on 0.
    expect(seen[seen.length - 1]).toBeCloseTo(1008, 6);
  });

  test("picks the next occurrence when the target is just behind", () => {
    expect(advanceClockwise(371, 10)).toBe(730);
  });
});

describe("normaliseDeg", () => {
  test("folds accumulated laps back into a single turn", () => {
    expect(normaliseDeg(730)).toBe(10);
    expect(normaliseDeg(-10)).toBe(350);
    expect(normaliseDeg(0)).toBe(0);
  });
});

describe("seatArc", () => {
  test("reports the angle one seat occupies", () => {
    expect(seatArc(12)).toBe(30);
    expect(seatArc(8)).toBe(45);
    expect(seatArc(0)).toBe(0);
  });
});

describe("timeToHands", () => {
  test("maps wall-clock time onto hand angles", () => {
    expect(timeToHands(3, 0, 0).hour).toBe(90);
    expect(timeToHands(3, 0, 0).minute).toBe(0);
    expect(timeToHands(6, 30, 0).minute).toBe(180);
    expect(timeToHands(0, 15, 30).second).toBe(180);
  });

  test("creeps the hour hand between marks the way a real clock does", () => {
    // Half past six leaves the hour hand halfway to seven, not still on six.
    expect(timeToHands(6, 30, 0).hour).toBe(195);
  });

  test("treats noon and midnight alike", () => {
    expect(timeToHands(12, 0, 0).hour).toBe(0);
  });
});

describe("countdownFraction", () => {
  test("returns the full turn when no time has elapsed yet", () => {
    expect(countdownFraction(30_000, 1_000, 30_000, 1_000)).toBe(1);
  });

  test("recomputes from the timestamp so a reconnect lands mid-arc", () => {
    expect(countdownFraction(30_000, 1_000, 30_000, 16_000)).toBe(0.5);
  });

  test("bottoms out at zero once the turn has run out", () => {
    expect(countdownFraction(30_000, 1_000, 30_000, 90_000)).toBe(0);
  });

  test("treats missing turn data as nothing to draw", () => {
    expect(countdownFraction(null, null, null, 1_000)).toBe(0);
    expect(countdownFraction(30_000, 1_000, 0, 1_000)).toBe(0);
  });

  test("never exceeds a full turn even if the server is generous", () => {
    expect(countdownFraction(45_000, 1_000, 30_000, 1_000)).toBe(1);
  });
});

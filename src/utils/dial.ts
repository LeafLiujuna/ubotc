/**
 * Clock-dial geometry, shared by the nomination dial, the table-centre sweep
 * hand and the decorative homepage clock.
 *
 * Two conventions are baked in and must not drift:
 *
 * 1. **Seat numbers are 1-based.** That matches `ServerPlayerVoteStartMessage.seat`,
 *    `turnIndex` and the "第 N 席" labels in the UI. The table's own `tableSeats`
 *    array is 0-based, so callers converting from an array index pass `index + 1`.
 * 2. **Seat 1 sits at twelve o'clock and the ring runs clockwise.** The table
 *    lays seats out at `-90 + (360 / total) * index` degrees, and both hand
 *    sprites (`clock-big.png`, `clock-small.png`) point straight up at rest, so
 *    a hand aimed at seat N is simply rotated by `(360 / total) * (N - 1)`.
 */

/** Degrees of rotation for a hand pointing at a 1-based seat. */
export const seatToDeg = (seat: number, total: number): number => {
  if (!Number.isFinite(seat) || !Number.isFinite(total) || total <= 0) return 0;
  return ((seat - 1) / total) * 360;
};

/**
 * Lift `target` into the first turn at or after `prev`, so a hand always
 * travels clockwise.
 *
 * A real clock hand never runs backwards, and neither should ours: moving from
 * seat 12 to seat 1 must sweep forward past twelve o'clock, not rewind almost a
 * full circle. Returning `prev + 360` when the two are already aligned would
 * spin a pointless extra lap, so an exact match is left untouched.
 */
export const advanceClockwise = (prev: number, target: number): number => {
  if (!Number.isFinite(prev)) return target;
  if (!Number.isFinite(target)) return prev;
  return target + 360 * Math.ceil((prev - target) / 360);
};

/**
 * Normalise a rotation that has accumulated many turns back into `[0, 360)`.
 * Used for reading a resting angle out of the DOM, never for driving motion —
 * driving motion with a normalised value is exactly what causes rewinds.
 */
export const normaliseDeg = (deg: number): number => {
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
};

/** Angle occupied by a single seat. Also the tick spacing on the dial. */
export const seatArc = (total: number): number => {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return 360 / total;
};

/**
 * Hour/minute angles for wall-clock time, for the decorative homepage dial.
 * The hour hand creeps between marks the way a real one does.
 */
export const timeToHands = (
  hours: number,
  minutes: number,
  seconds = 0,
): { hour: number; minute: number; second: number } => {
  const minuteFraction = minutes + seconds / 60;
  const hourFraction = (hours % 12) + minuteFraction / 60;
  return {
    hour: hourFraction * 30,
    minute: minuteFraction * 6,
    second: seconds * 6,
  };
};

/**
 * Fraction of a turn still to run, clamped to `[0, 1]`.
 *
 * `remainingMs` is whatever the server last told us, captured at
 * `receivedAt`; `now` lets the caller supply a single consistent clock reading
 * (and lets tests stay deterministic). Recomputing from the timestamp rather
 * than counting down locally means a reconnect mid-turn lands on the right arc
 * instead of restarting the wedge.
 */
export const countdownFraction = (
  remainingMs: number | null | undefined,
  receivedAt: number | null | undefined,
  totalMs: number | null | undefined,
  now: number,
): number => {
  if (!remainingMs || !totalMs || totalMs <= 0) return 0;
  const elapsed = receivedAt ? Math.max(0, now - receivedAt) : 0;
  const left = remainingMs - elapsed;
  if (left <= 0) return 0;
  return Math.min(1, left / totalMs);
};

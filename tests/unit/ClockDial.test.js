import { describe, expect, test, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ClockDial from "../../src/components/ClockDial.vue";

const seats = (count, overrides = {}) =>
  Array.from({ length: count }, (_, index) => ({
    seat: index + 1,
    label: `玩家${index + 1}`,
    ...(overrides[index + 1] ?? {}),
  }));

/** Pull the accumulated rotation out of a hand's inline --hand-deg. */
const handDeg = (wrapper, modifier) => {
  const hand = wrapper.find(`.clock-dial__hand--${modifier}`);
  expect(hand.exists()).toBe(true);
  const match = /--hand-deg:\s*([-\d.]+)deg/.exec(hand.attributes("style") ?? "");
  expect(match, `expected --hand-deg on the ${modifier} hand`).not.toBeNull();
  return Number(match[1]);
};

describe("ClockDial select mode", () => {
  test("renders one native button per seat", () => {
    const wrapper = mount(ClockDial, {
      props: { seatCount: 8, mode: "select", seats: seats(8) },
    });

    const buttons = wrapper.findAll("button.clock-dial__seat");
    expect(buttons).toHaveLength(8);
    expect(buttons[0].element.tagName).toBe("BUTTON");
    expect(buttons[3].text()).toContain("玩家4");
  });

  test("emits the 1-based seat number when a seat is chosen", async () => {
    const wrapper = mount(ClockDial, {
      props: { seatCount: 8, mode: "select", seats: seats(8) },
    });

    await wrapper.findAll("button.clock-dial__seat")[2].trigger("click");

    expect(wrapper.emitted("select-seat")).toEqual([[3]]);
  });

  test("marks blocked seats disabled and stays silent when they are clicked", async () => {
    const wrapper = mount(ClockDial, {
      props: {
        seatCount: 4,
        mode: "select",
        seats: seats(4, { 2: { disabled: true, state: "已死亡，不可选择" } }),
      },
    });

    const blocked = wrapper.findAll("button.clock-dial__seat")[1];
    expect(blocked.attributes("disabled")).toBeDefined();

    await blocked.trigger("click");
    expect(wrapper.emitted("select-seat")).toBeUndefined();
  });

  test("names each seat for assistive tech, including its status", () => {
    const wrapper = mount(ClockDial, {
      props: {
        seatCount: 4,
        mode: "select",
        seats: seats(4, { 3: { state: "今日已提名" } }),
      },
    });

    const labelled = wrapper.findAll("button.clock-dial__seat")[2];
    expect(labelled.attributes("aria-label")).toBe("第 3 席，玩家3，今日已提名");
  });

  test("points the long hand at the nominator and the short hand at the nominee", () => {
    const wrapper = mount(ClockDial, {
      props: {
        seatCount: 12,
        mode: "select",
        seats: seats(12),
        minuteSeat: 4,
        hourSeat: 7,
      },
    });

    expect(handDeg(wrapper, "minute")).toBe(90);
    expect(handDeg(wrapper, "hour")).toBe(180);
  });

  test("omits a hand entirely until it has a seat to point at", () => {
    const wrapper = mount(ClockDial, {
      props: { seatCount: 12, mode: "select", seats: seats(12) },
    });

    expect(wrapper.find(".clock-dial__hand--minute").exists()).toBe(false);
    expect(wrapper.find(".clock-dial__hand--hour").exists()).toBe(false);
  });
});

describe("ClockDial sweep mode", () => {
  test('sweeps through a seat over its remaining time and freezes at the same angle when paused or reconnected', async () => {
    vi.useFakeTimers(); vi.setSystemTime(10000);
    const state = { nomineeSeat: 8, turnIndex: 2, remainingMs: 300, receivedAt: 10000,
      durationMs: 600, stage: 'voting', paused: true, complete: false };
    const wrapper = mount(ClockDial, { props: { seatCount: 8, mode: 'sweep', minuteSeat: 2, hourSeat: 8, voteSweep: state } });
    try {
      expect(handDeg(wrapper, 'minute')).toBe(382.5);
      await vi.advanceTimersByTimeAsync(500);
      expect(handDeg(wrapper, 'minute')).toBe(382.5);
      await wrapper.setProps({ voteSweep: { ...state, receivedAt: 10500, paused: false } });
      await vi.advanceTimersByTimeAsync(150);
      expect(handDeg(wrapper, 'minute')).toBeGreaterThan(390);
      await wrapper.setProps({ voteSweep: { ...state, turnIndex: 2, remainingMs: 150, receivedAt: 10650 } });
      expect(handDeg(wrapper, 'minute')).toBe(393.75);
      await wrapper.setProps({ voteSweep: { ...state, complete: true } });
      expect(handDeg(wrapper, 'minute')).toBe(675);
      expect(wrapper.findAll('.clock-dial__hand--trail')).toHaveLength(0);
    } finally { wrapper.unmount(); vi.useRealTimers(); }
  });
  test("advances the sweep hand clockwise past twelve instead of rewinding", async () => {
    const wrapper = mount(ClockDial, {
      props: { seatCount: 12, mode: "sweep", sweepSeat: 12 },
    });

    const before = handDeg(wrapper, "sweep");
    expect(before).toBe(330);

    await wrapper.setProps({ sweepSeat: 1 });

    const after = handDeg(wrapper, "sweep");
    // Seat 1 is 0deg, but the hand must travel forward to 360deg to reach it.
    expect(after).toBe(360);
    expect(after).toBeGreaterThan(before);
  });

  test("keeps climbing across repeated circuits of the table", async () => {
    const wrapper = mount(ClockDial, {
      props: { seatCount: 5, mode: "sweep", sweepSeat: 1 },
    });

    const seen = [handDeg(wrapper, "sweep")];
    for (const seat of [2, 3, 4, 5, 1, 2, 3]) {
      await wrapper.setProps({ sweepSeat: seat });
      seen.push(handDeg(wrapper, "sweep"));
    }

    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]).toBeGreaterThan(seen[i - 1]);
    }
  });

  test("trails the hand with three lagging ghosts", () => {
    const wrapper = mount(ClockDial, {
      props: { seatCount: 12, mode: "sweep", sweepSeat: 3 },
    });

    expect(wrapper.findAll(".clock-dial__hand--trail")).toHaveLength(3);
  });

  test("draws no countdown wedge without both a remaining time and a turn length", () => {
    const wrapper = mount(ClockDial, {
      props: { seatCount: 12, mode: "sweep", sweepSeat: 3, countdownMs: 30_000 },
    });

    expect(wrapper.find(".clock-dial__countdown").exists()).toBe(false);
  });

  test("draws the wedge once the turn length is known", () => {
    const wrapper = mount(ClockDial, {
      props: {
        seatCount: 12,
        mode: "sweep",
        sweepSeat: 3,
        countdownMs: 30_000,
        countdownStartedAt: Date.now(),
        turnDurationMs: 30_000,
      },
    });

    expect(wrapper.find(".clock-dial__countdown").exists()).toBe(true);
  });

  test("flags a paused turn on the wedge so a frozen clock is not mistaken for a running one", () => {
    const wrapper = mount(ClockDial, {
      props: {
        seatCount: 12,
        mode: "sweep",
        sweepSeat: 3,
        countdownMs: 30_000,
        countdownStartedAt: Date.now(),
        turnDurationMs: 30_000,
        paused: true,
      },
    });

    expect(wrapper.find(".clock-dial__countdown").classes()).toContain("is-frozen");
    expect(wrapper.classes()).toContain("is-paused");
  });

  test("renders no seat buttons — the table draws its own seats", () => {
    const wrapper = mount(ClockDial, {
      props: { seatCount: 12, mode: "sweep", sweepSeat: 3, seats: seats(12) },
    });

    expect(wrapper.findAll("button.clock-dial__seat")).toHaveLength(0);
  });

  test("dims itself when there is no nomination to display", () => {
    const wrapper = mount(ClockDial, {
      props: { seatCount: 12, mode: "sweep", sweepSeat: null, idle: true },
    });

    expect(wrapper.classes()).toContain("is-idle");
    expect(wrapper.find(".clock-dial__hand--sweep").exists()).toBe(false);
  });
});

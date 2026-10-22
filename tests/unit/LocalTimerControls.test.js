// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import LocalTimerControls from "@/components/LocalTimerControls.vue";
import { useSessionStore } from "@/stores/session";

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("LocalTimerControls", () => {
  test("starts and stops the current local timer", async () => {
    const sessionStore = useSessionStore();
    sessionStore.setSessionId("room-12");
    const startTimer = vi
      .spyOn(sessionStore, "startTimer")
      .mockImplementation(() => {});
    const stopTimer = vi
      .spyOn(sessionStore, "stopTimer")
      .mockImplementation(() => {});
    const wrapper = mount(LocalTimerControls);

    await wrapper.get('[data-testid="timer-start"]').trigger("click");
    expect(startTimer).toHaveBeenCalledWith(480);

    await wrapper.get('[data-testid="timer-stop"]').trigger("click");
    expect(stopTimer).toHaveBeenCalledOnce();
  });

  test("uses the input modal result as minutes and formats the countdown", async () => {
    const sessionStore = useSessionStore();
    sessionStore.setSessionId("room-12");
    sessionStore.timer = 59;
    const startTimer = vi
      .spyOn(sessionStore, "startTimer")
      .mockImplementation(() => {});
    const stopTimer = vi
      .spyOn(sessionStore, "stopTimer")
      .mockImplementation(() => {});
    const wrapper = mount(LocalTimerControls);

    expect(wrapper.get('[data-testid="timer-display"]').text()).toContain("0:59");
    await wrapper.get('[data-testid="timer-display"]').trigger("click");
    sessionStore.inputResolver?.(["2"]);
    await flushPromises();

    expect(stopTimer).toHaveBeenCalledOnce();
    expect(startTimer).toHaveBeenCalledWith(120);
  });
});

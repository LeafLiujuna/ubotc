import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useAppStore } from "@/stores/app";

describe("app modal layering", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("keeps the source modal open while an input dialog is shown", () => {
    const appStore = useAppStore();

    appStore.toggleModal("settings");
    appStore.toggleModal("input");

    expect(appStore.modals.settings).toBe(true);
    expect(appStore.modals.input).toBe(true);

    appStore.toggleModal("input");

    expect(appStore.modals.settings).toBe(true);
    expect(appStore.modals.input).toBe(false);
  });

  it("still keeps regular business modals mutually exclusive", () => {
    const appStore = useAppStore();

    appStore.toggleModal("settings");
    appStore.toggleModal("roles");

    expect(appStore.modals.settings).toBe(false);
    expect(appStore.modals.roles).toBe(true);
  });

  it("closes every room overlay when leaving a room", () => {
    const appStore = useAppStore();

    appStore.toggleModal("settings");
    appStore.toggleModal("input");
    appStore.closeAllModals();

    expect(Object.values(appStore.modals).every((visible) => !visible)).toBe(true);
  });
});

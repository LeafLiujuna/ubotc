import { beforeEach, describe, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { requestInputModal } from "@/services/inputModalService";
import { useAppStore } from "@/stores/app";
import { useSessionStore } from "@/stores/session";

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("input modal service", () => {
  test("stores the request, closes the menu and resolves the submitted value", async () => {
    const appStore = useAppStore();
    const sessionStore = useSessionStore();
    const toggleMenu = vi.spyOn(appStore, "toggleMenu");
    const toggleModal = vi.spyOn(appStore, "toggleModal");
    const setInputResolver = vi.spyOn(sessionStore, "setInputResolver");
    const setInputRejecter = vi.spyOn(sessionStore, "setInputRejecter");
    const inputData = { title: "修改名称", maxLength: 20 };
    appStore.grimoire.isMenuOpen = true;

    const result = requestInputModal({
      inputType: "text",
      inputModal: "prompt",
      inputData,
    });

    expect(setInputResolver).toHaveBeenCalledOnce();
    expect(setInputRejecter).toHaveBeenCalledOnce();
    expect(sessionStore.inputType).toBe("text");
    expect(sessionStore.inputModal).toBe("prompt");
    expect(sessionStore.inputData).toEqual(inputData);
    expect(toggleMenu).toHaveBeenCalledWith(false);
    expect(toggleModal).toHaveBeenCalledWith("input");

    sessionStore.inputResolver?.(["钟匠"]);
    await expect(result).resolves.toEqual(["钟匠"]);
  });

  test("keeps a closed menu closed and forwards cancellation", async () => {
    const appStore = useAppStore();
    const sessionStore = useSessionStore();
    const toggleMenu = vi.spyOn(appStore, "toggleMenu");
    const error = new Error("cancelled");

    const result = requestInputModal({
      inputType: "confirm",
      inputModal: "confirm",
      inputData: { title: "确认操作" },
    });
    const rejection = expect(result).rejects.toBe(error);

    expect(toggleMenu).not.toHaveBeenCalled();
    sessionStore.inputRejecter?.(error);
    await rejection;
  });
});

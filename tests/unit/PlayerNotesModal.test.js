// @vitest-environment jsdom

import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import PlayerNotesModal from "@/components/PlayerNotesModal.vue";
import { useGameController } from "@/controllers/GameController";
import { SocketClientEvent } from "@/types/socket";

describe("PlayerNotesModal", () => {
  let wrapper;

  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
    document.body.style.overflow = "";
    delete document.body.dataset.tsModalLockCount;
  });

  test("loads and saves private notes through the canonical game controller", async () => {
    const controller = useGameController();
    const request = vi.spyOn(controller, "request")
      .mockImplementation(async (event, payload) => {
        if (event === SocketClientEvent.GetNotes) {
          return {
            notes: {
              "user-2": {
                notes: "第一夜已验证",
                marks: ["已验证"],
              },
            },
          };
        }
        if (event === SocketClientEvent.UpdateNote) {
          return { status: 200, payload };
        }
        return { status: 200 };
      });

    wrapper = mount(PlayerNotesModal, {
      attachTo: document.body,
      props: {
        open: true,
        playerId: "user-2",
        playerName: "二号玩家",
        roleName: "洗衣妇",
      },
      global: {
        stubs: { "font-awesome-icon": true },
      },
    });
    await flushPromises();

    const textarea = document.body.querySelector("textarea");
    const markInput = document.body.querySelector("#player-note-mark");
    const form = document.body.querySelector("form");
    expect(textarea.value).toBe("第一夜已验证");
    expect(document.body.textContent).toContain("已验证");

    textarea.value = "第一夜已验证；白天待回访";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    markInput.value = "待回访";
    markInput.dispatchEvent(new Event("input", { bubbles: true }));
    markInput.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flushPromises();

    expect(request).toHaveBeenCalledWith(SocketClientEvent.UpdateNote, {
      playerId: "user-2",
      notes: {
        notes: "第一夜已验证；白天待回访",
        marks: ["已验证", "待回访"],
      },
    });
    expect(wrapper.emitted("saved")).toEqual([["已保存 二号玩家 的私人笔记"]]);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});

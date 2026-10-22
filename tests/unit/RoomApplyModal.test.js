// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import RoomApplyModal from "@/components/RoomApplyModal.vue";
import { useGameStore } from "@/stores/game";

describe("RoomApplyModal", () => {
  let wrapper;

  beforeEach(() => {
    setActivePinia(createPinia());
    useGameStore().updateRoomUser({
      userId: "dm-1",
      displayName: "本地说书人",
      isDM: true,
    });
  });

  afterEach(() => {
    wrapper?.unmount();
    document.body.innerHTML = "";
    document.body.style.overflow = "";
    delete document.body.dataset.tsModalLockCount;
  });

  test("explains an in-progress seat invitation and emits the decision", async () => {
    wrapper = mount(RoomApplyModal, {
      attachTo: document.body,
      props: {
        apply: {
          applyId: "apply-1",
          type: "dmInvitePlayer",
          fromUserId: "dm-1",
        },
      },
      global: { stubs: { "font-awesome-icon": true } },
    });

    expect(document.body.textContent).toContain("说书人邀请你加入游戏");
    expect(document.body.textContent).toContain("本地说书人");

    const acceptButton = [...document.body.querySelectorAll("button")]
      .find((button) => button.textContent.includes("同意并加入"));
    acceptButton.click();
    expect(wrapper.emitted("respond")).toEqual([[true]]);
  });
});

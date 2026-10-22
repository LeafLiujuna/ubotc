// @vitest-environment jsdom

import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import Modal from "@/components/modals/Modal.vue";

const mountedWrappers = [];

async function settle() {
  await nextTick();
  await nextTick();
}

async function settleClose(wrapper) {
  const timeoutAt = Date.now() + 1000;
  while (!wrapper.emitted("close") && Date.now() < timeoutAt) {
    await new Promise((resolve) => window.setTimeout(resolve, 25));
    await nextTick();
  }
}

function mountModal(options = {}) {
  const { global = {}, ...mountOptions } = options;
  const wrapper = mount(Modal, {
    attachTo: document.body,
    ...mountOptions,
    global: {
      ...global,
      stubs: {
        transition: false,
        "font-awesome-icon": true,
        ...global.stubs,
      },
    },
  });
  mountedWrappers.push(wrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of mountedWrappers.splice(0).reverse()) {
    wrapper.unmount();
  }

  document.body.innerHTML = "";
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
  delete document.body.dataset.tsModalLockCount;
  delete document.body.dataset.tsModalOriginalOverflow;
  delete document.body.dataset.tsModalOriginalPaddingRight;
});

describe("Modal", () => {
  test("teleports and defaults to visible for legacy parent-v-if usage", async () => {
    document.body.style.overflow = "scroll";
    const trigger = document.createElement("button");
    trigger.textContent = "Open";
    document.body.append(trigger);
    trigger.focus();

    const wrapper = mountModal({
      props: {
        name: "role-select",
        title: "选择角色",
        description: "从当前剧本中选择一个角色。",
      },
      slots: {
        default: "<button id='modal-action'>确认</button>",
      },
    });
    await settle();

    const backdrop = document.body.querySelector(".modal-backdrop");
    const dialog = document.body.querySelector("[role='dialog']");
    expect(backdrop).not.toBeNull();
    expect(wrapper.find("[role='dialog']").exists()).toBe(false);
    expect(backdrop.classList.contains("modal-backdrop--role-select")).toBe(true);
    expect(backdrop.dataset.modalName).toBe("role-select");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toMatch(/^ts-modal-title-/);
    expect(dialog.getAttribute("aria-describedby")).toMatch(/^ts-modal-description-/);
    expect(document.activeElement).toBe(dialog);
    expect(document.body.style.overflow).toBe("hidden");

    document.body.querySelector(".top-right-button").click();
    expect(wrapper.emitted("close")).toBeUndefined();
    await settleClose(wrapper);

    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(document.body.querySelector("[role='dialog']")).toBeNull();
    expect(document.body.style.overflow).toBe("scroll");
    expect(document.activeElement).toBe(trigger);
  });

  test("closes from the backdrop by default and supports an explicit lock", async () => {
    const wrapper = mountModal({
      props: {
        name: "input",
        type: "input",
        showClose: false,
      },
      slots: { default: "Prompt" },
    });
    await settle();

    const backdrop = document.body.querySelector(".modal-backdrop");
    expect(backdrop.classList.contains("modal-backdrop--input")).toBe(true);
    expect(backdrop.dataset.modalName).toBe("input");

    document.body.querySelector("[role='dialog']").click();
    await settle();
    expect(wrapper.emitted("close")).toBeUndefined();

    backdrop.click();
    expect(wrapper.emitted("close")).toBeUndefined();
    await settleClose(wrapper);
    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(document.body.querySelector("[role='dialog']")).toBeNull();

    const locked = mountModal({
      props: { closeOnBackdrop: false },
      slots: { default: "Locked prompt" },
    });
    await settle();
    document.body.querySelector(".modal-backdrop").click();
    await settle();
    expect(locked.emitted("close")).toBeUndefined();
  });

  test("uses the configured return target when the opener did not receive focus", async () => {
    const trigger = document.createElement("button");
    trigger.id = "phase-trigger";
    trigger.textContent = "Phase";
    document.body.append(trigger);

    const wrapper = mountModal({
      props: {
        title: "Phase",
        returnFocus: "#phase-trigger",
      },
    });
    await settle();

    document.body.querySelector(".top-right-button").click();
    expect(wrapper.emitted("close")).toBeUndefined();
    await settleClose(wrapper);

    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(document.activeElement).toBe(trigger);
  });

  test("closes on Escape and exposes a reliable fallback label", async () => {
    const wrapper = mountModal({
      props: { name: "settings" },
      slots: { default: "Settings" },
    });
    await settle();

    const dialog = document.body.querySelector("[role='dialog']");
    expect(dialog.getAttribute("aria-label")).toBe("settings 对话框");
    dialog.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    }));
    await settleClose(wrapper);

    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(document.body.querySelector("[role='dialog']")).toBeNull();
  });

  test("cycles focus within the teleported dialog", async () => {
    mountModal({
      props: { showClose: false },
      slots: {
        default: [
          "<button id='first-action'>First</button>",
          "<button id='last-action'>Last</button>",
        ].join(""),
      },
    });
    await settle();

    const first = document.getElementById("first-action");
    const last = document.getElementById("last-action");

    last.focus();
    last.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    }));
    expect(document.activeElement).toBe(first);

    first.focus();
    first.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }));
    expect(document.activeElement).toBe(last);
  });

  test("keeps body scrolling locked until the last modal closes", async () => {
    const first = mountModal({ slots: { default: "First" } });
    const second = mountModal({ slots: { default: "Second" } });
    await settle();

    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.dataset.tsModalLockCount).toBe("2");

    first.unmount();
    mountedWrappers.splice(mountedWrappers.indexOf(first), 1);
    await settle();
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.body.dataset.tsModalLockCount).toBe("1");

    second.unmount();
    mountedWrappers.splice(mountedWrappers.indexOf(second), 1);
    await settle();
    expect(document.body.style.overflow).toBe("");
    expect(document.body.dataset.tsModalLockCount).toBeUndefined();
  });
});

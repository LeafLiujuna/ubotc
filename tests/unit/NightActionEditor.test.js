// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import NightActionEditor from "@/components/NightActionEditor.vue";

const wrappers = [];

function mountEditor(overrides = {}) {
  const wrapper = mount(NightActionEditor, {
    attachTo: document.body,
    props: {
      actionId: "character:poisoner",
      roleName: "投毒者",
      candidates: [{
        id: "player-1",
        name: "暮鸦",
        seat: 2,
        isDead: false,
        connected: true,
      }],
      record: {
        actionId: "character:poisoner",
        targetUserIds: ["player-1"],
      },
      maxTargets: 1,
      saveRecord: vi.fn().mockResolvedValue(true),
      suggestedEffect: "poisoned",
      resolveRecord: vi.fn().mockResolvedValue(true),
      ...overrides,
    },
    global: {
      stubs: {
        "font-awesome-icon": true,
      },
    },
  });
  wrappers.push(wrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0).reverse()) wrapper.unmount();
  document.body.innerHTML = "";
});

describe("NightActionEditor resolution", () => {
  test("confirms a suggested effect, restores focus and renders the authoritative result", async () => {
    const resolveRecord = vi.fn().mockResolvedValue(true);
    const wrapper = mountEditor({ resolveRecord });
    const openButton = wrapper.get('[data-testid="night-resolution-open-character:poisoner"]');

    expect(openButton.text()).toContain("记录中毒影响");
    await openButton.trigger("click");
    const cancelButton = wrapper.get('[data-testid="night-resolution-cancel-character:poisoner"]');
    expect(document.activeElement).toBe(cancelButton.element);
    expect(wrapper.text()).toContain("仅记录为说书人可见的裁定");

    await wrapper.get('[data-testid="night-resolution-confirm-character:poisoner"]').trigger("click");
    await flushPromises();
    expect(resolveRecord).toHaveBeenCalledWith([{
      targetUserId: "player-1",
      type: "poisoned",
    }]);
    expect(document.activeElement).toBe(openButton.element);

    await wrapper.setProps({
      record: {
        actionId: "character:poisoner",
        targetUserIds: ["player-1"],
        resolution: {
          effects: [{ targetUserId: "player-1", type: "poisoned" }],
          resolvedAt: 100,
          resolvedByUserId: "dm-1",
        },
      },
    });
    const status = wrapper.get('[data-testid="night-resolution-status-character:poisoner"]');
    expect(status.text()).toContain("2 · 暮鸦 · 中毒影响");
    expect(openButton.text()).toContain("重新结算");

    await openButton.trigger("click");
    await wrapper.get(".night-action-editor__resolution-confirm").trigger("keydown", {
      key: "Escape",
    });
    expect(wrapper.find(".night-action-editor__resolution-confirm").exists()).toBe(false);
    expect(document.activeElement).toBe(openButton.element);
  });

  test("keeps a failed resolution open with an inline recovery message", async () => {
    const wrapper = mountEditor({
      resolveRecord: vi.fn().mockResolvedValue(false),
    });

    await wrapper.get('[data-testid="night-resolution-open-character:poisoner"]').trigger("click");
    await wrapper.get('[data-testid="night-resolution-confirm-character:poisoner"]').trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe("结算失败，请检查连接后重试。");
    expect(wrapper.find(".night-action-editor__resolution-confirm").exists()).toBe(true);
  });

  test("separates death from ordinary recording with an explicit danger confirmation", async () => {
    const resolveRecord = vi.fn().mockResolvedValue(true);
    const wrapper = mountEditor({
      actionId: "character:imp",
      roleName: "小恶魔",
      record: {
        actionId: "character:imp",
        targetUserIds: ["player-1"],
      },
      suggestedEffect: "dead",
      resolveRecord,
    });

    await wrapper.get('[data-testid="night-resolution-open-character:imp"]').trigger("click");
    expect(wrapper.text()).toContain("此操作会立即改变公开存活状态");
    expect(wrapper.get('[data-testid="night-resolution-confirm-character:imp"]')
      .classes()).toContain("is-dead");
    expect(resolveRecord).not.toHaveBeenCalled();
  });
});

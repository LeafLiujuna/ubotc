import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import InputModal from "@/components/modals/InputModal.vue";
import { useAppStore } from "@/stores/app";
import { useSessionStore } from "@/stores/session";

const ModalStub = {
  props: ["visible", "title", "closeOnBackdrop"],
  emits: ["close"],
  setup(_props, { emit, expose }) {
    expose({ close: () => emit("close") });
  },
  template: '<section v-if="visible" role="dialog" :aria-label="title"><slot /></section>',
};

function mountDialog() {
  return mount(InputModal, {
    global: {
      stubs: {
        Modal: ModalStub,
        "font-awesome-icon": true,
      },
    },
  });
}

describe("InputModal legacy bridge", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("resolves a legacy confirmation without closing its source modal", async () => {
    const appStore = useAppStore();
    const sessionStore = useSessionStore();
    const resolve = vi.fn();

    appStore.toggleModal("settings");
    sessionStore.setInputResolver(resolve);
    sessionStore.setInputRejecter(vi.fn());
    sessionStore.setInputModal("confirm");
    sessionStore.setInputData({ name: ["确定要清空所有座位吗？"] });
    appStore.toggleModal("input");

    const wrapper = mountDialog();
    await nextTick();
    expect(wrapper.findComponent(ModalStub).props("closeOnBackdrop")).toBe(true);
    await wrapper.get("form").trigger("submit");

    expect(resolve).toHaveBeenCalledWith(true);
    expect(appStore.modals.input).toBe(false);
    expect(appStore.modals.settings).toBe(true);
    expect(sessionStore.inputResolver).toBeNull();
  });

  it("validates and resolves legacy text inputs", async () => {
    const appStore = useAppStore();
    const sessionStore = useSessionStore();
    const resolve = vi.fn();

    sessionStore.setInputResolver(resolve);
    sessionStore.setInputRejecter(vi.fn());
    sessionStore.setInputModal("input");
    sessionStore.setInputData({ name: ["玩家昵称"], length: 1, placeholder: [""] });
    appStore.toggleModal("input");

    const wrapper = mountDialog();
    await nextTick();
    expect(wrapper.findComponent(ModalStub).props("closeOnBackdrop")).toBe(true);
    await wrapper.get("form").trigger("submit");

    expect(wrapper.text()).toContain("请完成所有必填项");
    expect(resolve).not.toHaveBeenCalled();

    await wrapper.get("input").setValue("旅人");
    await wrapper.get("form").trigger("submit");

    expect(resolve).toHaveBeenCalledWith(["旅人"]);
    expect(appStore.modals.input).toBe(false);
  });
});

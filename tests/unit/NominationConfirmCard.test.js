import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import NominationConfirmCard from "@/components/NominationConfirmCard.vue";

const baseProps = {
  open: true,
  nominatorSeat: 3,
  nominatorName: "本地玩家 甲",
  nomineeSeat: 1,
  nomineeName: "本地玩家 乙",
};

describe("NominationConfirmCard", () => {
  afterEach(() => vi.useRealTimers());
  test('privacy selection explains its visibility and is locked while starting', async () => {
    const wrapper = mount(NominationConfirmCard, { props: baseProps });
    await wrapper.find('input[type="checkbox"]').setValue(true);
    expect(wrapper.emitted('update:privateVote')).toEqual([[true]]);
    await wrapper.setProps({ privateVote: true, pending: true });
    expect(wrapper.text()).toContain('最终票数仅说书人可见');
    expect(wrapper.find('input').attributes('disabled')).toBeDefined();
  });
  test("renders both sides of the nomination with their seats", () => {
    const wrapper = mount(NominationConfirmCard, { props: baseProps });
    const text = wrapper.text();
    expect(text).toContain("提名者 · 第 3 席");
    expect(text).toContain("本地玩家 甲");
    expect(text).toContain("被提名者 · 第 1 席");
    expect(text).toContain("本地玩家 乙");
  });

  test("renders nothing while closed", () => {
    const wrapper = mount(NominationConfirmCard, {
      props: { ...baseProps, open: false },
    });
    expect(wrapper.find(".nomination-confirm-card").exists()).toBe(false);
  });

  test("confirm and cancel buttons emit their events", async () => {
    const wrapper = mount(NominationConfirmCard, { props: baseProps });
    const confirm = wrapper
      .findAll("button")
      .find((button) => button.attributes('aria-label') === "确认并开始投票");
    const cancel = wrapper
      .findAll("button")
      .find((button) => button.text() === "关闭");
    await confirm.trigger("click");
    await cancel.trigger("click");
    expect(wrapper.emitted("confirm")).toHaveLength(1);
    expect(wrapper.emitted("cancel")).toHaveLength(1);
  });

  test("pending disables both buttons and swaps the confirm label", () => {
    const wrapper = mount(NominationConfirmCard, {
      props: { ...baseProps, pending: true },
    });
    const buttons = wrapper.findAll("button");
    expect(buttons).toHaveLength(4);
    for (const button of buttons) {
      expect(button.attributes("disabled")).toBeDefined();
    }
    expect(wrapper.text()).toContain("正在开始…");
  });

  test('countdown starts once after three seconds and preserves privacy until confirmation', async () => {
    vi.useFakeTimers();
    const wrapper = mount(NominationConfirmCard, { props: { ...baseProps, privateVote: true, requiredVotes: 4 } });
    const countdown = wrapper.findAll('button').find(button => button.text() === '倒计时');
    await countdown.trigger('click');
    await countdown.trigger('click');
    expect(wrapper.find('input').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('多数需要达到 4 票');
    await vi.advanceTimersByTimeAsync(2999);
    expect(wrapper.emitted('confirm')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.emitted('confirm')).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    wrapper.unmount();
  });

  test('closing, changing seats and unmounting cancel a pending countdown', async () => {
    vi.useFakeTimers();
    for (const action of ['close', 'seat', 'unmount']) {
      const wrapper = mount(NominationConfirmCard, { props: baseProps });
      await wrapper.findAll('button').find(button => button.text() === '倒计时').trigger('click');
      if (action === 'close') await wrapper.findAll('button').find(button => button.text() === '关闭').trigger('click');
      else if (action === 'seat') await wrapper.setProps({ nomineeSeat: 2 });
      else wrapper.unmount();
      await vi.advanceTimersByTimeAsync(4000);
      expect(wrapper.emitted('confirm')).toBeUndefined();
      expect(vi.getTimerCount()).toBe(0);
      if (action !== 'unmount') wrapper.unmount();
    }
  });

  test("escape emits cancel unless a confirm is pending", async () => {
    const wrapper = mount(NominationConfirmCard, { props: baseProps });
    await wrapper.find(".nomination-confirm-card").trigger("keydown", { key: "Escape" });
    expect(wrapper.emitted("cancel")).toHaveLength(1);

    const pendingWrapper = mount(NominationConfirmCard, {
      props: { ...baseProps, pending: true },
    });
    await pendingWrapper
      .find(".nomination-confirm-card")
      .trigger("keydown", { key: "Escape" });
    expect(pendingWrapper.emitted("cancel")).toBeUndefined();
  });

  test("status text is announced through a live region", () => {
    const wrapper = mount(NominationConfirmCard, {
      props: { ...baseProps, statusText: "房间正在重连。" },
    });
    const status = wrapper.find('[role="status"]');
    expect(status.exists()).toBe(true);
    expect(status.text()).toBe("房间正在重连。");
  });
});

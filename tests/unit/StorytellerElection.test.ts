// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import StorytellerElection from '@/components/StorytellerElection.vue';
import { useGameStore } from '@/stores/game';
import { useUserStore } from '@/stores/user';
import { useGameController } from '@/controllers/GameController';
import { SocketClientEvent } from '@/types/socket';

let wrapper: ReturnType<typeof mount>;
beforeEach(() => {
  setActivePinia(createPinia());
  useUserStore().setCurrentUser({ id: 'voter', displayName: '投票人', avatarUrl: '', level: 1, storytellerLevel: 1, lastSeenAt: 0 });
  const game = useGameStore();
  game.dmElection = { electionId: 'election-1', applicantUserId: 'candidate', voteCount: 0, requiredVoteCount: 2, hasVoted: false };
  game.updateRoomUser({ userId: 'candidate', displayName: '候选人' });
  vi.spyOn(useGameController(), 'refreshGameState').mockResolvedValue(undefined as never);
});
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); document.body.innerHTML = ''; });
const render = () => { wrapper = mount(StorytellerElection, { attachTo: document.body }); };
const buttons = () => [...document.body.querySelectorAll('button')];

test('other members see consent and progress; submitting includes the exact application and blocks double clicks', async () => {
  let resolve!: () => void;
  const request = vi.spyOn(useGameController(), 'request').mockImplementation(() => new Promise<void>(r => { resolve = r; }) as never);
  render();
  expect(document.body.textContent).toContain('候选人 申请成为说书人');
  expect(document.body.textContent).toContain('0 / 2');
  buttons()[0].click(); buttons()[0].click();
  await flushPromises();
  expect(request).toHaveBeenCalledTimes(1);
  expect(request).toHaveBeenCalledWith(SocketClientEvent.VoteDM, { accept: true, applicantUserId: 'candidate', electionId: 'election-1' });
  expect(buttons()[0].disabled).toBe(true);
  resolve(); await flushPromises();
  useGameStore().dmElection!.hasVoted = true;
  await flushPromises();
  expect(document.body.textContent).toContain('你已同意');
  expect(buttons()).toHaveLength(0);
});

test('the applicant can cancel but cannot approve themselves', async () => {
  useUserStore().setCurrentUser({ id: 'candidate', displayName: '候选人', avatarUrl: '', level: 1, storytellerLevel: 1, lastSeenAt: 0 });
  const request = vi.spyOn(useGameController(), 'request').mockResolvedValue({ status: 200 } as never);
  render();
  expect(buttons()).toHaveLength(1);
  expect(buttons()[0].textContent).toContain('取消申请');
  buttons()[0].click(); await flushPromises();
  expect(request).toHaveBeenCalledWith(SocketClientEvent.CancelApplyDM);
});

test('errors keep the consent action available for retry and ended applications disappear', async () => {
  vi.spyOn(useGameController(), 'request').mockRejectedValue(new Error('连接失败'));
  render(); buttons()[0].click(); await flushPromises();
  expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('连接失败');
  expect(buttons()[0].disabled).toBe(false);
  useGameStore().dmElection = null; await flushPromises();
  expect(document.body.querySelector('.storyteller-election')).toBeNull();
});

import { test, expect, type Page } from '@playwright/test';

async function request(page: Page, event: string, data?: unknown) {
  return page.evaluate(async ({ event, data }) => {
    const path = '/src/controllers/GameController.ts';
    return (await import(/* @vite-ignore */ path)).useGameController().request(event, data);
  }, { event, data });
}

async function voteState(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/stores/realtimeVote.ts';
    return JSON.parse(JSON.stringify((await import(/* @vite-ignore */ path)).useRealtimeVoteStore().$state));
  });
}

test('empty-seat nominations use the public room vote for players and observers', async ({ browser }, info) => {
  test.skip(process.env.E2E_LOCAL_VOICE !== 'true' || info.project.name !== 'desktop-1440x900', 'Requires local development stack');
  test.setTimeout(60000);
  const contexts = await Promise.all(Array.from({ length: 3 }, () => browser.newContext({ viewport: { width: 1440, height: 900 } })));
  try {
    const [host, player, observer] = await Promise.all(contexts.map(context => context.newPage()));
    await host.goto('http://127.0.0.1:8081/rooms?devLogin=1');
    await host.getByRole('button', { name: '创建房间', exact: true }).first().click();
    await host.getByLabel(/房间名称/).fill(`空席提名验收 ${Date.now()}`);
    await host.getByRole('button', { name: '创建并进入' }).click();
    await expect(host.locator('.game-connection')).toContainText('已连接', { timeout: 20000 });
    const roomId = new URL(host.url()).pathname.split('/').at(-1)!;
    await request(host, 'dmSetSeatCount', { seatCount: 3 });
    await host.getByRole('button', { name: '选择剧本', exact: true }).click();
    await host.locator('.edition-card').filter({ hasText: '暗流涌动' }).first().click();
    for (const page of [player, observer]) {
      await page.goto(`http://127.0.0.1:8081/game/${roomId}?devLogin=1&devIdentity=player`);
      await expect(page.locator('.game-connection')).toContainText('已连接', { timeout: 20000 });
    }
    await request(player, 'enterSit', { seat: 3 });
    await host.evaluate(async () => {
      const path = '/src/stores/app.ts';
      (await import(/* @vite-ignore */ path)).useAppStore().grimoire.voteDuration = 10000;
    });
    async function begin(from: number, to: number, privacy: boolean) {
      await host.locator('.reference-token').nth(from - 1).click();
      await host.getByRole('button', { name: `第 ${from} 席提名第 ${to} 席`, exact: true }).click();
      const card = host.getByRole('dialog', { name: '确认本轮提名' });
      await card.getByLabel('隐私投票', { exact: true }).setChecked(privacy);
      await card.getByRole('button', { name: '确认并开始投票' }).click();
    }
    await begin(1, 2, false);
    for (const page of [host, player, observer]) {
      await expect.poll(async () => (await voteState(page)).nomineeUserId).toBe('@seat:2');
      await expect(page.locator('.table-nomination')).toHaveCount(1);
      await expect(page.locator('#realtime-vote-panel')).toHaveCount(0);
      await expect(page.locator('#table-nomination-panel')).toBeVisible();
    }
    await player.getByRole('button', { name: /^赞成/ }).click();
    await expect(host.getByText('第 1 席 · 说书人代投')).toBeVisible();
    await host.getByRole('button', { name: '第 1 席投票', exact: true }).click();
    await expect(observer.locator('[aria-label="第 1 席已举手"]')).toBeVisible();
    await observer.reload();
    await expect(observer.locator('[aria-label="第 1 席已举手"]')).toBeVisible();
    await observer.screenshot({ path: info.outputPath('empty-seat-public-vote.png') });
    await expect(host.getByText('第 2 席 · 说书人代投')).toBeVisible();
    await host.getByRole('button', { name: /^反对/ }).click();
    for (const page of [host, player, observer]) {
      await expect.poll(async () => (await voteState(page)).yesVotes).toBe(2);
    }
    await host.getByRole('button', { name: '关闭', exact: true }).click();
    await begin(2, 1, true);
    for (const page of [host, player, observer]) await expect(page.locator('#townsquare')).toHaveClass(/private-voting/);
    await host.getByRole('button', { name: /^赞成/ }).click();
    await expect(observer.locator('[aria-label="第 2 席已举手"]')).toHaveCount(0);
    expect(Object.keys((await voteState(observer)).results)).toEqual([]);
    await host.getByRole('button', { name: /取消本轮/ }).click();
    for (const page of [host, player, observer]) {
      await expect.poll(async () => (await voteState(page)).phase).toBe('complete');
      await expect(page.locator('#townsquare')).not.toHaveClass(/private-voting/);
    }
    await expect(observer.locator('.table-nomination__tally')).toHaveCount(0);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});

test('private voting conceals ballots and tallies across reconnect and restores daylight on completion', async ({ browser }, info) => {
  test.skip(process.env.E2E_LOCAL_VOICE !== 'true' || info.project.name !== 'desktop-1440x900', 'Requires local development stack');
  test.setTimeout(90000);
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })));
  try {
    const [host, first, second, observer] = await Promise.all(contexts.map(context => context.newPage()));
    const errors: string[] = [];
    for (const page of [host, first, second, observer]) page.on('pageerror', error => errors.push(error.message));
    await host.goto('http://127.0.0.1:8081/rooms?devLogin=1');
    await host.getByRole('button', { name: '创建房间', exact: true }).first().click();
    await host.getByLabel(/房间名称/).fill(`隐私投票验收 ${Date.now()}`);
    await host.getByRole('button', { name: '创建并进入' }).click();
    await expect(host.locator('.game-connection')).toContainText('已连接', { timeout: 20000 });
    const roomId = new URL(host.url()).pathname.split('/').at(-1)!;
    await request(host, 'dmSetSeatCount', { seatCount: 2 });
    await host.getByRole('button', { name: '选择剧本', exact: true }).click();
    await host.locator('.edition-card').filter({ hasText: '暗流涌动' }).first().click();
    for (const page of [first, second, observer]) {
      await page.goto(`http://127.0.0.1:8081/game/${roomId}?devLogin=1&devIdentity=player`);
      await expect(page.locator('.game-connection')).toContainText('已连接', { timeout: 20000 });
    }
    await request(first, 'enterSit', { seat: 1 });
    await request(second, 'enterSit', { seat: 2 });
    const expectedSeatUsers = await Promise.all([first, second].map(page => page.evaluate(async () => {
      const path = '/src/stores/user.ts'; return (await import(/* @vite-ignore */ path)).useUserStore().userId;
    })));
    await request(host, 'dmSetSeatRoles', { assignments: [{ seat: 1, characterId: 'chef' }, { seat: 2, characterId: 'imp' }], expectedSeatUsers });
    await request(host, 'dmChangeLevel', { nextLevel: 'night' });
    await request(host, 'dmChangeLevel', { nextLevel: 'day' });
    await host.evaluate(async () => {
      const path = '/src/stores/app.ts';
      (await import(/* @vite-ignore */ path)).useAppStore().grimoire.voteDuration = 10000;
    });
    const firstId = await first.evaluate(async () => {
      const path = '/src/stores/user.ts'; return (await import(/* @vite-ignore */ path)).useUserStore().userId;
    });
    const secondId = await second.evaluate(async () => {
      const path = '/src/stores/user.ts'; return (await import(/* @vite-ignore */ path)).useUserStore().userId;
    });
    async function begin(from: number, to: number, privateVote: boolean) {
      await host.locator('.reference-token').nth(from - 1).click();
      await host.getByRole('button', { name: `第 ${from} 席提名第 ${to} 席`, exact: true }).click();
      const card = host.getByRole('dialog', { name: '确认本轮提名' });
      await card.getByLabel('隐私投票', { exact: true }).setChecked(privateVote);
      await card.getByRole('button', { name: '确认并开始投票' }).click();
    }
    await begin(1, 2, true);
    for (const page of [host, first, second, observer]) {
      await expect(page.locator('#townsquare')).toHaveClass(/private-voting/);
      await expect(page.locator('#townsquare')).toHaveClass(/night/);
    }
    await first.getByRole('button', { name: /^赞成/ }).click();
    await expect.poll(async () => Object.keys((await voteState(host)).results).length).toBe(1);
    expect(Object.keys((await voteState(first)).results)).toEqual([firstId]);
    expect(Object.keys((await voteState(second)).results)).toEqual([]);
    expect(Object.keys((await voteState(observer)).results)).toEqual([]);
    await expect(first.locator('.table-nomination__tally')).toHaveCount(0);
    await expect(first.locator('.table-nomination__own-vote')).toHaveText('我的选择：举手');
    await expect(host.locator('[aria-label="第 1 席已举手"]')).toBeVisible();
    await expect(observer.locator('[aria-label="第 1 席已举手"]')).toHaveCount(0);
    await observer.reload();
    await expect(observer.locator('#townsquare')).toHaveClass(/private-voting/);
    expect(Object.keys((await voteState(observer)).results)).toEqual([]);
    await observer.screenshot({ path: info.outputPath('private-player-night.png') });
    await host.screenshot({ path: info.outputPath('private-storyteller-night.png') });
    await second.getByRole('button', { name: /^反对/ }).click();
    for (const page of [host, first, second, observer]) {
      await expect.poll(async () => (await voteState(page)).phase).toBe('complete');
      await expect(page.locator('#townsquare')).not.toHaveClass(/night/);
    }
    expect((await voteState(host)).yesVotes).toBe(1);
    for (const page of [first, second, observer]) {
      await expect(page.locator('.table-nomination__tally')).toHaveCount(0);
      await expect(page.getByText('隐私投票已结束', { exact: true })).toBeVisible();
      const state = await voteState(page);
      expect(state.dayNominationState.nominations[0].yesVotes).toBeUndefined();
      expect(state.dayNominationState.highestYesVotes).toBeUndefined();
    }
    await second.reload();
    await expect(second.getByText('隐私投票已结束', { exact: true })).toBeVisible();
    expect(Object.keys((await voteState(second)).results)).toEqual([secondId]);
    await second.screenshot({ path: info.outputPath('private-player-complete.png') });
    // Normal mode continues to publish every ballot and its final tally.
    await host.getByRole('button', { name: '关闭', exact: true }).click();
    await begin(2, 1, false);
    await second.getByRole('button', { name: /^赞成/ }).click();
    await expect.poll(async () => Object.keys((await voteState(observer)).results).length).toBe(1);
    await first.getByRole('button', { name: /^赞成/ }).click();
    await expect.poll(async () => (await voteState(observer)).yesVotes).toBe(2);
    await expect(observer.locator('.table-nomination__tally')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});

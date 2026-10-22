import { test, expect, type Page } from '@playwright/test';

async function request(page: Page, event: string, data?: unknown) {
  return page.evaluate(async ({ event, data }) => {
    const modulePath = '/src/controllers/GameController.ts';
    return (await import(/* @vite-ignore */ modulePath)).useGameController().request(event, data);
  }, { event, data });
}

async function voteState(page: Page) {
  return page.evaluate(async () => {
    const modulePath = '/src/stores/realtimeVote.ts';
    return JSON.parse(JSON.stringify((await import(/* @vite-ignore */ modulePath)).useRealtimeVoteStore().$state));
  });
}

async function identity(page: Page) {
  return page.evaluate(async () => {
    const modulePath = '/src/stores/user.ts';
    return (await import(/* @vite-ignore */ modulePath)).useUserStore().userId as string;
  });
}

async function roomTimer(page: Page) {
  return page.evaluate(async () => {
    const modulePath = '/src/stores/game.ts';
    return JSON.parse(JSON.stringify((await import(/* @vite-ignore */ modulePath)).useGameStore().roomTimer));
  });
}

test('the same players can nominate repeatedly while history, one active round and execution candidates remain correct', async ({ browser }, info) => {
  test.skip(process.env.E2E_FULL_STACK !== 'true' || info.project.name !== 'desktop-1440x900', 'Requires the isolated full-stack harness; runs once');
  test.setTimeout(90000);
  const origin = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.E2E_FRONTEND_PORT || 18081}`;
  const contexts = await Promise.all(Array.from({ length: 3 }, () => browser.newContext({
    viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce',
  })));
  try {
    const [host, first, second] = await Promise.all(contexts.map(context => context.newPage()));
    const pages = [host, first, second];
    const errors: string[] = [];
    for (const page of pages) {
      page.setDefaultTimeout(10000);
      page.on('pageerror', error => errors.push(error.message));
    }
    await host.goto(`${origin}/rooms?devLogin=1`);
    await host.getByRole('button', { name: '创建房间', exact: true }).first().click();
    await host.getByLabel(/房间名称/).fill(`重复提名验收 ${Date.now()}`);
    await host.getByRole('button', { name: '创建并进入', exact: true }).click();
    await expect(host.locator('.game-connection')).toContainText('已连接', { timeout: 20000 });
    const roomId = new URL(host.url()).pathname.split('/').at(-1)!;
    expect((await request(host, 'dmSetSeatCount', { seatCount: 2 })).status).toBe(200);
    await host.getByRole('button', { name: '选择剧本', exact: true }).click();
    await host.locator('.edition-card').filter({ hasText: '暗流涌动' }).first().click();
    // The isolated stack has one SQLite connection, so development logins are serial.
    for (const page of [first, second]) {
      await page.goto(`${origin}/game/${roomId}?devLogin=1&devIdentity=player`);
      await expect(page.locator('.game-connection')).toContainText('已连接', { timeout: 20000 });
    }
    expect((await request(first, 'enterSit', { seat: 1 })).status).toBe(200);
    expect((await request(second, 'enterSit', { seat: 2 })).status).toBe(200);
    for (const page of pages) await expect(page.locator('.reference-seat.occupied')).toHaveCount(2);
    const [firstId, secondId] = await Promise.all([first, second].map(identity));
    expect((await request(host, 'dmSetSeatRoles', {
      assignments: [{ seat: 1, characterId: 'chef' }, { seat: 2, characterId: 'imp' }],
      expectedSeatUsers: [firstId, secondId],
    })).status).toBe(200);
    expect((await request(host, 'dmChangeLevel', { nextLevel: 'night' })).status).toBe(200);
    expect((await request(host, 'dmChangeLevel', { nextLevel: 'day' })).status).toBe(200);
    await host.evaluate(async () => {
      const modulePath = '/src/stores/app.ts';
      (await import(/* @vite-ignore */ modulePath)).useAppStore().grimoire.voteDuration = 500;
    });

    const roundIds: string[] = [];
    const begin = async (from: number, to: number) => {
      await host.locator('.reference-token').nth(from - 1).click();
      await host.getByRole('button', { name: `第 ${from} 席提名第 ${to} 席`, exact: true }).click();
      for (const page of pages) {
        await expect.poll(async () => (await voteState(page)).stage).toBe('ready');
        await expect.poll(async () => (await voteState(page)).phase).toBe('voting');
        await expect(page.getByRole('dialog', { name: '提名控制', exact: true })).toBeVisible();
        await expect.poll(async () => (await voteState(page)).initiatorUserId).toBe(from === 1 ? firstId : secondId);
        await expect.poll(async () => (await voteState(page)).nomineeUserId).toBe(to === 1 ? firstId : secondId);
      }
      const state = await voteState(host);
      expect(roundIds).not.toContain(state.nominationId);
      roundIds.push(state.nominationId);
      await expect.poll(async () => (await voteState(host)).dayNominationState.nominations.length).toBe(roundIds.length);
      expect(state.dayNominationState.nominations.filter((record: any) => record.status === 'voting')).toHaveLength(1);
      return state.nominationId as string;
    };
    const finishWithBothVotes = async () => {
      for (const page of [first, second]) await page.getByRole('button', { name: /^赞成/ }).click();
      await host.getByRole('dialog', { name: '提名控制', exact: true }).getByRole('button', { name: '开始', exact: true }).click();
      for (const page of pages) {
        await expect.poll(async () => (await voteState(page)).phase).toBe('complete');
        await expect.poll(async () => (await voteState(page)).yesVotes).toBe(2);
      }
      await host.getByRole('dialog', { name: '提名控制', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
      for (const page of pages) await expect(page.locator('#table-nomination-panel')).toHaveCount(0);
    };

    const firstRound = await begin(1, 2);
    const levelDays = (await voteState(host)).dayNominationState.levelDays;
    const concurrent = await host.evaluate(async ({ firstId, secondId }) => {
      const modulePath = '/src/controllers/GameController.ts';
      try {
        await (await import(/* @vite-ignore */ modulePath)).useGameController().request('dmStartVote', {
          nominatorUserId: firstId, nomineeUserId: secondId, sweepVote: true, turnDurationMs: 500,
        });
        return { rejected: false, message: '' };
      } catch (error) {
        return { rejected: true, message: error instanceof Error ? error.message : String(error) };
      }
    }, { firstId, secondId });
    expect(concurrent).toMatchObject({ rejected: true });
    expect(concurrent.message).toContain('当前已有进行中的投票');
    await host.locator('.reference-token').first().click();
    await expect(host.getByRole('menuitem', { name: '提名自己', exact: true })).toHaveCount(0);
    expect((await voteState(host)).nominationId).toBe(firstRound);
    expect((await voteState(host)).dayNominationState.nominations).toHaveLength(1);
    await finishWithBothVotes();

    await begin(1, 2);
    await finishWithBothVotes();
    for (const page of pages) {
      const day = (await voteState(page)).dayNominationState;
      expect(day.levelDays).toBe(levelDays);
      expect(day.nominations).toHaveLength(2);
      expect(day.nominations.every((record: any) => record.nominatorUserId === firstId && record.nomineeUserId === secondId)).toBe(true);
      expect(day.nominations.map((record: any) => record.yesVotes)).toEqual([2, 2]);
      expect(day.executionCandidateUserId).toBe(secondId);
      expect(day.tiedCandidateUserIds).toEqual([]);
    }

    const cancelledRound = await begin(1, 2);
    await host.getByRole('dialog', { name: '提名控制', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
    for (const page of pages) {
      await expect.poll(async () => (await voteState(page)).phase).toBe('complete');
      await expect.poll(async () => (await voteState(page)).dayNominationState.nominations.find((record: any) => record.nominationId === cancelledRound)?.status).toBe('cancelled');
      await expect(page.locator('#table-nomination-panel')).toHaveCount(0);
    }

    await begin(1, 2);
    await finishWithBothVotes();
    await host.locator('.reference-token').first().click();
    await host.getByRole('menuitem', { name: '提名自己', exact: true }).click();
    for (const page of pages) {
      await expect.poll(async () => (await voteState(page)).phase).toBe('voting');
      await expect.poll(async () => (await voteState(page)).initiatorUserId).toBe(firstId);
      await expect.poll(async () => (await voteState(page)).nomineeUserId).toBe(firstId);
    }
    const selfRound = (await voteState(host)).nominationId;
    expect(roundIds).not.toContain(selfRound);
    roundIds.push(selfRound);
    await host.getByRole('dialog', { name: '提名控制', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
    for (const page of pages) {
      await expect.poll(async () => (await voteState(page)).dayNominationState.nominations.at(-1)?.status).toBe('cancelled');
      const day = (await voteState(page)).dayNominationState;
      expect(day.levelDays).toBe(levelDays);
      expect(day.nominations.map((record: any) => record.nominationId)).toEqual(roundIds);
      expect(day.nominations).toHaveLength(5);
      expect(day.executionCandidateUserId).toBe(secondId);
      expect(day.tiedCandidateUserIds).toEqual([]);
    }
    await second.reload();
    await expect(second.locator('.game-connection')).toContainText('已连接', { timeout: 20000 });
    await expect.poll(async () => (await voteState(second)).dayNominationState?.nominations.map((record: any) => record.nominationId)).toEqual(roundIds);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});

test('dead players can nominate and be nominated while voting controls remain available through timer changes', async ({ browser }, info) => {
  test.skip(process.env.E2E_FULL_STACK !== 'true' || info.project.name !== 'desktop-1440x900', 'Requires the isolated full-stack harness; runs once');
  test.setTimeout(90000);
  const origin = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.E2E_FRONTEND_PORT || 18081}`;
  const contexts = await Promise.all(Array.from({ length: 3 }, () => browser.newContext({
    viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce',
  })));
  try {
    const [host, first, second] = await Promise.all(contexts.map(context => context.newPage()));
    const pages = [host, first, second];
    const errors: string[] = [];
    for (const page of pages) {
      page.setDefaultTimeout(10000);
      page.on('pageerror', error => errors.push(error.message));
    }
    await host.goto(`${origin}/rooms?devLogin=1`);
    await host.getByRole('button', { name: '创建房间', exact: true }).first().click();
    await host.getByLabel(/房间名称/).fill(`计时器与死亡提名 ${Date.now()}`);
    await host.getByRole('button', { name: '创建并进入', exact: true }).click();
    await expect(host.locator('.game-connection')).toContainText('已连接', { timeout: 20000 });
    const roomId = new URL(host.url()).pathname.split('/').at(-1)!;
    expect((await request(host, 'dmSetSeatCount', { seatCount: 2 })).status).toBe(200);
    await host.getByRole('button', { name: '选择剧本', exact: true }).click();
    await host.locator('.edition-card').filter({ hasText: '暗流涌动' }).first().click();
    for (const page of [first, second]) {
      await page.goto(`${origin}/game/${roomId}?devLogin=1&devIdentity=player`);
      await expect(page.locator('.game-connection')).toContainText('已连接', { timeout: 20000 });
    }
    expect((await request(first, 'enterSit', { seat: 1 })).status).toBe(200);
    expect((await request(second, 'enterSit', { seat: 2 })).status).toBe(200);
    const [firstId, secondId] = await Promise.all([first, second].map(identity));
    expect((await request(host, 'dmSetSeatRoles', {
      assignments: [{ seat: 1, characterId: 'chef' }, { seat: 2, characterId: 'imp' }],
      expectedSeatUsers: [firstId, secondId],
    })).status).toBe(200);
    expect((await request(host, 'dmChangeLevel', { nextLevel: 'night' })).status).toBe(200);
    expect((await request(host, 'dmChangeLevel', { nextLevel: 'day' })).status).toBe(200);
    await host.evaluate(async () => {
      const modulePath = '/src/stores/app.ts';
      (await import(/* @vite-ignore */ modulePath)).useAppStore().grimoire.voteDuration = 4000;
    });
    await host.locator('.reference-token').first().click();
    await host.getByRole('menuitem', { name: '标记死亡', exact: true }).click();
    for (const page of pages) await expect(page.locator('.reference-seat').first()).toHaveClass(/dead/);

    const timerCommand = async (action: 'start' | 'pause' | 'resume' | 'stop') => {
      expect((await request(host, 'dmTimer', action === 'start'
        ? { action, durationSeconds: 120, title: '讨论照常投票', blockNominations: true }
        : { action })).status).toBe(200);
      const expectedStatus = action === 'pause' ? 'paused' : action === 'stop' ? 'stopped' : 'running';
      for (const page of pages) await expect.poll(async () => (await roomTimer(page))?.status).toBe(expectedStatus);
    };
    await timerCommand('start');
    // A reconnected client may still contain the former blocking flag in its snapshot.
    // Preserve the real running timer and exercise the compatibility path in the UI.
    for (const page of pages) await page.evaluate(async () => {
      const modulePath = '/src/stores/game.ts';
      (await import(/* @vite-ignore */ modulePath)).useGameStore().roomTimer!.blockNominations = true;
    });
    for (const page of pages) expect((await roomTimer(page)).blockNominations).toBe(true);
    const controls = host.getByRole('dialog', { name: '提名控制', exact: true });
    const cancelledNominationIds: string[] = [];
    const expectReady = async (from: string, to: string) => {
      for (const page of pages) {
        await expect.poll(async () => (await voteState(page)).stage).toBe('ready');
        await expect.poll(async () => (await voteState(page)).phase).toBe('voting');
        await expect.poll(async () => (await voteState(page)).initiatorUserId).toBe(from);
        await expect.poll(async () => (await voteState(page)).nomineeUserId).toBe(to);
      }
    };
    const cancelReadyRound = async () => {
      const roundId = (await voteState(host)).nominationId as string;
      expect(cancelledNominationIds).not.toContain(roundId);
      cancelledNominationIds.push(roundId);
      await controls.getByRole('button', { name: '关闭', exact: true }).click();
      for (const page of pages) {
        await expect.poll(async () => (await voteState(page)).dayNominationState.nominations.find((record: any) => record.nominationId === roundId)?.status).toBe('cancelled');
        await expect(page.locator('#table-nomination-panel')).toHaveCount(0);
      }
    };

    // Choosing another role token must allow a living source to target a dead player.
    await host.locator('.reference-token').nth(1).click();
    await host.getByRole('button', { name: '第 2 席提名第 1 席', exact: true }).click();
    await expectReady(secondId, firstId);
    await cancelReadyRound();

    // The role menu also permits a dead player to nominate themself.
    await host.locator('.reference-token').first().click();
    await expect(host.getByRole('menuitem', { name: '提名自己', exact: true })).toBeEnabled();
    await host.getByRole('menuitem', { name: '提名自己', exact: true }).click();
    await expectReady(firstId, firstId);
    await cancelReadyRound();

    // The separate seat-selection entry must apply the same rule to both seats.
    // Room shortcuts intentionally ignore keys while a button retains focus.
    await host.locator('.game-connection strong').click();
    await host.keyboard.press('a');
    await expect(host.locator('.reference-operation-prompt')).toContainText('选择被提名者');
    await expect(host.locator('.reference-token').first()).toHaveAttribute('aria-label', /^选第 1 席 .+ 为被提名者$/);
    await host.locator('.reference-token').first().click();
    await expect(host.locator('.reference-operation-prompt')).toContainText('选择提名者');
    await expect(host.locator('.reference-token').first()).toHaveAttribute('aria-label', /^选第 1 席 .+ 为提名者$/);
    await host.locator('.reference-token').first().click();
    await expectReady(firstId, firstId);
    await cancelReadyRound();

    await host.locator('.reference-token').first().click();
    await host.getByRole('button', { name: '第 1 席提名第 2 席', exact: true }).click();
    await expectReady(firstId, secondId);
    const nominationId = (await voteState(host)).nominationId;
    expect(cancelledNominationIds).not.toContain(nominationId);
    await first.getByRole('button', { name: /^赞成/ }).click();
    await expect.poll(async () => (await voteState(host)).choices[firstId]?.vote).toBe('yes');
    await timerCommand('pause');
    await second.getByRole('button', { name: /^赞成/ }).click();
    await expect.poll(async () => (await voteState(host)).choices[secondId]?.vote).toBe('yes');
    await timerCommand('resume');
    await controls.getByRole('button', { name: '开始', exact: true }).click();
    await expect.poll(async () => (await voteState(host)).stage).toBe('voting');
    await expect.poll(async () => (await voteState(host)).paused).toBe(false);

    await controls.getByRole('button', { name: '暂停', exact: true }).click();
    await expect.poll(async () => (await voteState(host)).paused).toBe(true);
    await timerCommand('start');
    await timerCommand('pause');
    await timerCommand('resume');
    expect((await voteState(host)).paused).toBe(true);
    await controls.getByRole('button', { name: '继续', exact: true }).click();
    await expect.poll(async () => (await voteState(host)).paused).toBe(false);
    await controls.getByRole('button', { name: '重置', exact: true }).click();
    for (const page of pages) {
      await expect.poll(async () => (await voteState(page)).stage).toBe('ready');
      expect((await voteState(page)).nominationId).toBe(nominationId);
      expect((await voteState(page)).results).toEqual({});
      expect((await voteState(page)).choices).toEqual({});
      expect((await roomTimer(page)).status).toBe('running');
    }
    for (const page of [first, second]) await page.getByRole('button', { name: /^赞成/ }).click();
    await controls.getByRole('button', { name: '开始', exact: true }).click();
    await expect.poll(async () => (await voteState(host)).stage).toBe('voting');
    await timerCommand('start');
    await timerCommand('pause');
    await timerCommand('resume');
    for (const page of pages) expect((await voteState(page)).paused).toBe(false);
    // Advancing and completing without another vote control proves timer commands
    // did not stop or silently pause the sweep's own clock.
    await expect.poll(async () => (await voteState(host)).turnIndex, { timeout: 10000 }).toBe(2);
    for (const page of pages) {
      await expect.poll(async () => (await voteState(page)).phase, { timeout: 10000 }).toBe('complete');
      expect((await voteState(page)).yesVotes).toBe(2);
      expect((await roomTimer(page)).status).toBe('running');
      const nominations = (await voteState(page)).dayNominationState.nominations;
      expect(nominations.map((record: any) => record.nominationId)).toEqual([...cancelledNominationIds, nominationId]);
      expect(nominations.slice(0, -1).every((record: any) => record.status === 'cancelled')).toBe(true);
      await expect(page.locator('.table-nomination__error')).toHaveCount(0);
    }
    await controls.getByRole('button', { name: '关闭', exact: true }).click();
    const expectSpentGhostVote = async () => {
      for (const page of pages) await expect.poll(async () => page.evaluate(async userId => {
        const modulePath = '/src/stores/game.ts';
        return (await import(/* @vite-ignore */ modulePath)).useGameStore().players[userId]?.ghostVoteUsed;
      }, firstId)).toBe(true);
    };
    await expectSpentGhostVote();
    await host.evaluate(async () => {
      const modulePath = '/src/stores/app.ts';
      (await import(/* @vite-ignore */ modulePath)).useAppStore().grimoire.voteDuration = 500;
    });
    await host.locator('.reference-token').first().click();
    await host.getByRole('menuitem', { name: '提名自己', exact: true }).click();
    await expectReady(firstId, firstId);
    await expectSpentGhostVote();
    expect((await voteState(first)).canVote).toBe(false);
    await expect(first.getByRole('button', { name: /^赞成/ })).toHaveCount(0);
    await second.getByRole('button', { name: /^赞成/ }).click();
    await controls.getByRole('button', { name: '开始', exact: true }).click();
    for (const page of pages) {
      await expect.poll(async () => (await voteState(page)).phase).toBe('complete');
      expect((await voteState(page)).yesVotes).toBe(1);
      expect((await voteState(page)).nomineeUserId).toBe(firstId);
    }
    await expectSpentGhostVote();
    await controls.getByRole('button', { name: '关闭', exact: true }).click();
    await timerCommand('stop');
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});

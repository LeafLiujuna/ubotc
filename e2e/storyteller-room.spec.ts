import { test, expect, type Page } from '@playwright/test';

// Setup uses the same controller requests as the UI; assertions inspect the
// clients' received state, so unrevealed secrets cannot hide behind the DOM.
async function request(page: Page, event: string, data?: unknown) {
  return page.evaluate(async ({ event, data }) => {
    const modulePath = '/src/controllers/GameController.ts';
    const { useGameController } = await import(/* @vite-ignore */ modulePath);
    return useGameController().request(event, data);
  }, { event, data });
}
async function state(page: Page) {
  return page.evaluate(async () => {
    const modulePath = '/src/stores/game.ts';
    const { useGameStore } = await import(/* @vite-ignore */ modulePath);
    return JSON.parse(JSON.stringify(useGameStore().$state));
  });
}
async function menu(page: Page, command: RegExp) {
  await page.getByRole('button', { name: '房间命令', exact: true }).click();
  await page.getByRole('button', { name: command }).click();
}
test('host, two players and observer synchronize timer, private hints and staged reveal across reconnect', async ({ browser }, info) => {
  test.skip(process.env.E2E_FULL_STACK !== 'true' || info.project.name !== 'desktop-1440x900', 'Requires full-stack harness, runs once');
  test.setTimeout(120000);
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })));
  try {
    const [host, first, second, observer] = await Promise.all(contexts.map(c => c.newPage()));
    const errors: string[] = [];
    for (const page of [host, first, second, observer]) page.on('pageerror', error => errors.push(error.message));
    await host.goto(process.env.E2E_ROOM_URL!);
    await host.getByRole('button', { name: '创建房间', exact: true }).first().click();
    await host.getByLabel(/房间名称/).fill(`说书人验收 ${Date.now()}`);
    await host.getByRole('button', { name: '创建并进入' }).click();
    await expect(host.locator('.game-connection')).toContainText('已连接', { timeout: 20000 });
    const roomId = new URL(host.url()).pathname.split('/').at(-1)!;
    const origin = new URL(host.url()).origin;
    await expect(host.locator('.reference-seat')).toHaveCount(0);
    await expect(host.locator('.stage-welcome')).toContainText('欢迎来到');
    await host.screenshot({ path: info.outputPath('room-welcome.png') });
    await host.getByRole('button', { name: '召集玩家' }).click();
    await expect(host.getByRole('region', { name: '集合玩家' })).toBeVisible();
    await expect(host.locator('.stage-welcome')).toHaveCount(0);
    await host.screenshot({ path: info.outputPath('room-gather-players.png') });
    await host.getByRole('button', { name: '添加座位', exact: true }).click();
    await expect(host.locator('.reference-seat')).toHaveCount(1);
    await host.getByRole('button', { name: '关闭座位编辑' }).click();
    await host.getByRole('button', { name: '选择剧本', exact: true }).click();
    await host.locator('.edition-card').filter({ hasText: '暗流涌动' }).first().click();
    expect((await request(host, 'dmSetSeatCount', { seatCount: 2 })).status).toBe(200);
    for (const page of [first, second, observer]) {
      await page.goto(`${origin}/game/${roomId}?devLogin=1&devIdentity=player`);
      await expect(page.locator('.game-connection')).toContainText('已连接', { timeout: 20000 });
    }
    expect((await request(first, 'enterSit', { seat: 1 })).status).toBe(200);
    expect((await request(second, 'enterSit', { seat: 2 })).status).toBe(200);
    await expect.poll(async () => Object.values((await state(host)).players).filter((p: any) => p.seat > 0).length).toBe(2);
    const seated = Object.values((await state(host)).players).filter((p: any) => p.seat > 0).sort((a: any, b: any) => a.seat - b.seat) as any[];
    const [a, b] = seated.map(p => p.userId);
    expect((await request(host, 'dmUpdatePlayer', { userId: a, characterId: 'chef' })).status).toBe(200);
    expect((await request(host, 'dmUpdatePlayer', { userId: b, characterId: 'imp' })).status).toBe(200);
    expect((await request(host, 'dmChangeLevel', { nextLevel: 'night' })).status).toBe(200);
    const hint = `私密首夜 ${Date.now()}`;
    expect((await request(host, 'sendDMMessage', { playerUserId: a, channel: 'skill', content: [{ type: 'text', text: hint }], context: { kind: 'night-info', levelDays: 1, actionId: 'seat:1', section: 'first' } })).status).toBe(200);
    await expect(first.getByText(hint, { exact: true }).first()).toBeVisible();
    await expect(second.getByText(hint, { exact: true })).toHaveCount(0);
    await expect(observer.getByText(hint, { exact: true })).toHaveCount(0);
    await request(host, 'dmChangeLevel', { nextLevel: 'day' });
    await menu(host, /^设定计时器/);
    const timer = host.getByRole('dialog', { name: '设定计时器' });
    await timer.getByLabel('时长（分钟）').fill('2'); await timer.getByLabel('计时器标题（可选）').fill('同步讨论');
    await timer.getByRole('button', { name: '开始', exact: true }).click();
    for (const page of [host, first, second, observer]) await expect(page.getByRole('timer')).toContainText('同步讨论');
    const expectedTimer = (await state(host)).roomTimer;
    for (const page of [first, second, observer]) expect((await state(page)).roomTimer.endsAt).toBe(expectedTimer.endsAt);
    await observer.reload(); await expect(observer.getByRole('timer')).toContainText('同步讨论');
    await host.getByRole('timer').getByRole('button', { name: '暂停', exact: true }).click();
    await expect(first.getByRole('timer')).toContainText('已暂停');
    await host.getByRole('timer').getByRole('button', { name: '继续', exact: true }).click();
    await expect(first.getByRole('timer')).not.toContainText('已暂停');
    await menu(host, /^揭晓魔典/);
    await host.getByRole('dialog', { name: '揭晓魔典', exact: true }).getByRole('button', { name: '邪恶阵营获胜', exact: true }).click();
    await expect(host.locator('.reference-token .icon')).toHaveCount(0);
    for (const page of [first, second, observer]) {
      await expect.poll(async () => (await state(page)).level).toBe('end');
      expect((await state(page)).gameEnd).toBeNull();
    }
    expect((await state(observer)).players[a].characterId).toBeUndefined();
    expect((await state(first)).players[b].characterId).toBeUndefined();
    await host.getByRole('button', { name: '揭晓第 1 席角色', exact: true }).click();
    await expect.poll(async () => (await state(observer)).players[a].characterId).toBe('chef');
    expect((await state(observer)).players[b].characterId).toBeUndefined();
    await observer.reload(); await expect(observer.locator('.reference-token .icon')).toHaveCount(1);
    expect((await state(observer)).gameEnd).toBeNull();
    await host.getByRole('button', { name: '揭示游戏结果', exact: true }).click();
    for (const page of [first, second, observer]) await expect.poll(async () => (await state(page)).gameEnd?.winningTeam).toBe('evil');
    await expect(observer.locator('.storyteller-victory')).toContainText('邪恶');
    expect((await state(observer)).players[b].characterId).toBeUndefined();
    await host.getByRole('button', { name: '揭晓剩余玩家', exact: true }).click();
    await expect.poll(async () => (await state(observer)).players[b].characterId).toBe('imp');
    await observer.reload(); await expect(observer.locator('.reference-token .icon')).toHaveCount(2);
    await expect(observer.getByRole('button', { name: /终局结果/ })).toHaveCount(0);
    expect((await state(observer)).gameEnd.winningTeam).toBe('evil');
    expect(errors).toEqual([]);
    await host.screenshot({ path: info.outputPath('room-staged-reveal.png') });
  } finally { await Promise.all(contexts.map(c => c.close())); }
});

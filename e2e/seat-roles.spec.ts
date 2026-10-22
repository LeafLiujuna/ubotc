import { test, expect, type Page } from '@playwright/test';

async function request(page: Page, event: string, data?: unknown) {
  return page.evaluate(async ({ event, data }) => {
    const path = '/src/controllers/GameController.ts';
    return (await import(/* @vite-ignore */ path)).useGameController().request(event, data);
  }, { event, data });
}
async function state(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/stores/game.ts';
    const game = (await import(/* @vite-ignore */ path)).useGameStore();
    return { seatRoles: game.seatRoles, players: game.players, currentPlayer: game.currentPlayer };
  });
}

test('seven empty seats receive the correct distribution and privately deliver reserved roles on entry', async ({ browser }, info) => {
  test.skip(process.env.E2E_LOCAL_VOICE !== 'true' || info.project.name !== 'desktop-1440x900', 'Requires local development stack');
  test.setTimeout(60000);
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  try {
    const [host, player, observer] = await Promise.all(contexts.map(context => context.newPage()));
    const errors: string[] = [];
    for (const page of [host, player, observer]) page.on('pageerror', error => errors.push(error.message));
    await host.goto('http://127.0.0.1:8081/rooms?devLogin=1');
    await host.getByRole('button', { name: '创建房间', exact: true }).first().click();
    await host.getByLabel(/房间名称/).fill(`七座位配角验收 ${Date.now()}`);
    await host.getByRole('button', { name: '创建并进入' }).click();
    await expect(host.locator('.game-connection')).toContainText('已连接', { timeout: 20000 });
    const roomId = new URL(host.url()).pathname.split('/').at(-1)!;
    await request(host, 'dmSetSeatCount', { seatCount: 7 });
    await host.getByRole('button', { name: '选择剧本', exact: true }).click();
    await host.locator('.edition-card').filter({ hasText: '暗流涌动' }).first().click();
    await host.getByRole('button', { name: '选择角色', exact: true }).click();
    const roles = host.getByRole('dialog', { name: '选择角色', exact: true });
    await expect(roles.locator('.team-count')).toHaveText(['0 / 5', '0 / 0', '0 / 1', '0 / 1']);
    for (const [team, count] of [['townsfolk', 5], ['minion', 1], ['demon', 1]] as const) {
      for (let i = 0; i < count; i++) await roles.locator(`.selection-team--${team} .role-toggle`).nth(i).click();
    }
    await expect(roles.locator('.team-count')).toHaveText(['5 / 5', '0 / 0', '1 / 1', '1 / 1']);
    await expect(roles.getByRole('button', { name: '配置 7 个角色' })).toBeEnabled();
    await host.screenshot({ path: info.outputPath('seven-seat-distribution.png') });
    await roles.getByRole('button', { name: '配置 7 个角色' }).click();
    const confirm = host.getByRole('dialog', { name: '请确认' });
    await expect(confirm).toContainText('玩家暂时看不到新身份');
    await confirm.getByRole('button', { name: '确认', exact: true }).click();
    await expect(roles).toBeHidden();
    await expect.poll(async () => Object.keys((await state(host)).seatRoles).length).toBe(7);
    await expect(host.locator('.reference-token .token .icon')).toHaveCount(7);
    await host.reload();
    await expect(host.locator('.game-connection')).toContainText('已连接');
    await expect(host.locator('.reference-token .token .icon')).toHaveCount(7);
    const reserved = (await state(host)).seatRoles;
    await Promise.all([player, observer].map(page => page.goto(`http://127.0.0.1:8081/game/${roomId}?devLogin=1&devIdentity=player`)));
    for (const page of [player, observer]) {
      await expect(page.locator('.game-connection')).toContainText('已连接');
      expect((await state(page)).seatRoles).toEqual({});
      await expect(page.locator('.reference-token .token .icon')).toHaveCount(0);
    }
    await request(player, 'enterSit', { seat: 1 });
    await expect.poll(async () => (await state(player)).currentPlayer?.seat).toBe(1);
    expect((await state(player)).currentPlayer?.characterId).toBe('');
    await player.reload();
    await expect(player.locator('.game-connection')).toContainText('已连接');
    expect((await state(player)).currentPlayer?.characterId).toBe('');
    await host.getByRole('button', { name: '发送角色', exact: true }).click();
    await expect.poll(async () => (await state(player)).currentPlayer?.characterId).toBe(reserved[1].characterId);
    await expect.poll(async () => Object.keys((await state(host)).seatRoles).length).toBe(6);
    const playerId = (await state(player)).currentPlayer!.userId;
    await expect.poll(async () => Boolean((await state(observer)).players[playerId])).toBe(true);
    expect((await state(observer)).players[playerId].characterId).toBeUndefined();
    await player.reload();
    await expect.poll(async () => (await state(player)).currentPlayer?.characterId).toBe(reserved[1].characterId);
    await request(host, 'dmSetSeatCount', { seatCount: 7, seatOrder: [1, 0, 2, 3, 4, 5, 6], expectedSeatUsers: [playerId, '', '', '', '', '', ''] });
    await expect.poll(async () => (await state(host)).seatRoles[1]?.characterId).toBe(reserved[2].characterId);
    await request(observer, 'enterSit', { seat: 1 });
    await expect.poll(async () => (await state(observer)).currentPlayer?.characterId).toBe(reserved[2].characterId);
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

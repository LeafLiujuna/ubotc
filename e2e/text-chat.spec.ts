import { test, expect, type Page } from '@playwright/test';

async function request(page: Page, event: string, data?: unknown) {
  return page.evaluate(async ({ event, data }) => {
    const modulePath = '/src/controllers/GameController.ts';
    return (await import(/* @vite-ignore */ modulePath)).useGameController().request(event, data);
  }, { event, data });
}

async function identity(page: Page) {
  return page.evaluate(async () => {
    const modulePath = '/src/stores/user.ts';
    const user = (await import(/* @vite-ignore */ modulePath)).useUserStore();
    return { userId: user.userId as string, name: user.current.displayName as string };
  });
}

async function receivedPrivateText(page: Page) {
  return page.evaluate(async () => {
    const modulePath = '/src/stores/roomChat.ts';
    const chat = (await import(/* @vite-ignore */ modulePath)).useRoomChatStore();
    return Object.values(chat.messagesByConversation).flat().flatMap((message: any) =>
      message.content.filter((item: any) => item.type === 'text').map((item: any) => item.text),
    ) as string[];
  });
}

async function openTextPanel(page: Page) {
  const tab = page.locator('.reference-edge-tab[aria-controls="left-text-panel"]');
  if (await tab.getAttribute('aria-expanded') !== 'true') await tab.click();
  await expect(page.locator('#left-text-panel')).toBeVisible();
}

async function publicChat(page: Page) {
  await openTextPanel(page);
  const panel = page.locator('#left-text-panel');
  const shortcut = panel.getByRole('button', { name: '切换到公聊', exact: true });
  if (await shortcut.isVisible()) await shortcut.click();
  else await panel.locator('.chat-channel-tabs').getByRole('button', { name: '公聊', exact: true }).click();
}

async function sendText(page: Page, text: string) {
  const panel = page.locator('#left-text-panel');
  await panel.locator('#message').fill(text);
  await panel.getByRole('button', { name: '发送', exact: true }).click();
  await expect(panel.locator('.public-chat-message p').filter({ hasText: text })).toHaveText(text);
  await expect(panel.locator('#message')).toHaveValue('');
  await expect(panel.locator('.chat-error')).toHaveCount(0);
}

async function expectPrivateComposer(page: Page) {
  const panel = page.locator('#left-text-panel');
  await expect(panel.locator('.chatbox svg.chat-recipient-icon.fa-envelope')).toBeVisible();
  await expect(panel.locator('.chatbox svg.chat-recipient-icon.fa-envelope + #message')).toBeVisible();
  const input = await panel.locator('#message').boundingBox();
  const send = await panel.getByRole('button', { name: '发送', exact: true }).boundingBox();
  expect(input).not.toBeNull();
  expect(send).not.toBeNull();
  expect(input!.width).toBeGreaterThan(send!.width);
}

async function trackEnvelopeAnimations(page: Page) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(() => {
    const records: unknown[] = [];
    (window as any).__envelopeAnimations = records;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      if (this.classList.contains('ts-whisper-envelope')) {
        const style = getComputedStyle(this);
        records.push({ frames, width: style.width, height: style.height });
      }
      return animate.call(this, frames, options);
    };
  });
}

async function envelopeAnimations(page: Page) {
  return page.evaluate(() => (window as any).__envelopeAnimations as Array<{ frames: Keyframe[]; width: string; height: string }>);
}

async function openSeatText(page: Page, seat: number, name: string) {
  const token = page.locator(`.reference-seat-group[data-seat-index="${seat - 1}"] .reference-token-stack`);
  await token.hover();
  const envelope = token.getByRole('button', { name: `向 ${name} 发送文本信息`, exact: true });
  await expect(envelope.locator('svg.fa-envelope')).toBeVisible();
  await envelope.click();
  const panel = page.locator('#left-text-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.chat-title-copy')).toContainText(name);
  await expect(panel.locator('#message')).toHaveAttribute('placeholder', `向 ${name}…`);
  await expectPrivateComposer(page);
}

test('table envelopes open private text conversations with unread replies, public chat and storyteller chat', async ({ browser }, info) => {
  test.skip(process.env.E2E_FULL_STACK !== 'true' || info.project.name !== 'desktop-1440x900', 'Requires the isolated full-stack harness; runs once');
  test.setTimeout(120000);
  const contexts = await Promise.all(Array.from({ length: 4 }, () => browser.newContext({
    viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce',
  })));
  try {
    const [host, first, second, observer] = await Promise.all(contexts.map(context => context.newPage()));
    const pages = [host, first, second, observer];
    const errors: string[] = [];
    for (const page of pages) {
      page.setDefaultTimeout(10000);
      page.on('pageerror', error => errors.push(error.message));
    }
    const origin = process.env.E2E_BASE_URL || 'http://127.0.0.1:8081';
    await host.goto(process.env.E2E_ROOM_URL || `${origin}/rooms?devLogin=1`);
    await host.getByRole('button', { name: '创建房间', exact: true }).first().click();
    await host.getByLabel(/房间名称/).fill(`文字会话验收 ${Date.now()}`);
    await host.getByRole('button', { name: '创建并进入', exact: true }).click();
    await expect(host.locator('.game-connection')).toContainText('已连接', { timeout: 20000 });
    const roomId = new URL(host.url()).pathname.split('/').at(-1)!;
    expect((await request(host, 'dmSetSeatCount', { seatCount: 4 })).status).toBe(200);
    // The isolated harness uses one SQLite connection; create development users serially.
    for (const page of [first, second, observer]) {
      await page.goto(`${origin}/game/${roomId}?devLogin=1&devIdentity=player`);
      await expect(page.locator('.game-connection')).toContainText('已连接', { timeout: 20000 });
    }
    for (const [index, page] of [first, second, observer].entries()) {
      expect((await request(page, 'enterSit', { seat: index + 1 })).status).toBe(200);
    }
    for (const page of pages) await expect(page.locator('.reference-seat.occupied')).toHaveCount(3);
    const [firstUser, secondUser, observerUser] = await Promise.all([first, second, observer].map(identity));

    // Four physical seats make 1 and 2 neighbors, while 1 and 3 are not.
    await first.locator('.reference-seat-group[data-seat-index="2"] .reference-token-stack').hover();
    await expect(first.getByRole('button', { name: `向 ${observerUser.name} 发送文本信息`, exact: true })).toHaveCount(0);
    await expect(first.locator('.reference-seat-group[data-seat-index="0"] .table-chat-action')).toHaveCount(0);
    await openSeatText(first, 2, secondUser.name);
    await trackEnvelopeAnimations(first);
    await trackEnvelopeAnimations(second);
    const whisper = `仅邻座可见 ${Date.now()}`;
    await sendText(first, whisper);
    for (const page of [first, second]) {
      await expect.poll(async () => (await envelopeAnimations(page)).length).toBe(1);
      const [envelope] = await envelopeAnimations(page);
      expect(envelope.width).toBe('30px');
      expect(envelope.height).toBe('21px');
    }
    await expect(first.locator('[role="dialog"]')).toHaveCount(0);
    await expect.poll(() => receivedPrivateText(second)).toContain(whisper);
    expect(await receivedPrivateText(host)).not.toContain(whisper);
    expect(await receivedPrivateText(observer)).not.toContain(whisper);

    // The recipient can discover a new conversation without finding its sender on the table.
    await openTextPanel(second);
    await expect(second.locator('#left-text-panel .chat-unread-badge').first()).toContainText('1');
    await second.getByRole('button', { name: '选择文字会话', exact: true }).click();
    const incoming = second.locator(`.chat-conversation-list button[data-channel="whisper"][data-target-user-id="${firstUser.userId}"]`);
    await expect(incoming).toContainText(firstUser.name);
    await incoming.click();
    await expect(second.locator('#message')).toHaveAttribute('placeholder', `向 ${firstUser.name}…`);
    await expect(second.locator('#left-text-panel .public-chat-message p').filter({ hasText: whisper })).toHaveText(whisper);
    const reply = `邻座已收到 ${Date.now()}`;
    await sendText(second, reply);
    for (const page of [first, second]) await expect.poll(async () => (await envelopeAnimations(page)).length).toBe(2);
    await expect(first.locator('#left-text-panel .public-chat-message p').filter({ hasText: reply })).toHaveText(reply);

    // Collapsing/reopening keeps the recipient and its messages, as in the video.
    await first.getByRole('button', { name: '收起聊天', exact: true }).click();
    await expect(first.locator('#left-text-panel')).not.toBeVisible();
    await openTextPanel(first);
    await expect(first.locator('#message')).toHaveAttribute('placeholder', `向 ${secondUser.name}…`);
    await expect(first.locator('#left-text-panel .public-chat-message p').filter({ hasText: reply })).toHaveText(reply);
    await first.screenshot({ path: info.outputPath('text-whisper-desktop.png') });

    await publicChat(first);
    const publicMessage = `全房间公聊 ${Date.now()}`;
    await sendText(first, publicMessage);
    for (const page of [host, second, observer]) {
      await publicChat(page);
      await expect(page.locator('#left-text-panel .public-chat-message p').filter({ hasText: publicMessage })).toHaveText(publicMessage);
    }

    // The same envelope UI starts a storyteller/player conversation, with no voice consent step.
    await host.getByRole('button', { name: '收起聊天', exact: true }).click();
    await openSeatText(host, 1, firstUser.name);
    await trackEnvelopeAnimations(host);
    const dmMessage = `说书人单独告知 ${Date.now()}`;
    await sendText(host, dmMessage);
    await expect.poll(() => receivedPrivateText(first)).toContain(dmMessage);
    expect(await envelopeAnimations(host)).toHaveLength(0);
    expect(await envelopeAnimations(first)).toHaveLength(2);
    expect(await receivedPrivateText(second)).not.toContain(dmMessage);
    expect(await receivedPrivateText(observer)).not.toContain(dmMessage);
    await first.getByRole('button', { name: '收起聊天', exact: true }).click();
    const storyteller = first.locator('.storyteller-profile').first();
    await storyteller.hover();
    const storytellerEnvelope = storyteller.getByRole('button', { name: '向说书人发送文本信息', exact: true });
    await expect(storytellerEnvelope.locator('svg.fa-envelope')).toBeVisible();
    await storytellerEnvelope.click();
    await expect(first.locator('#left-text-panel .chat-title-copy')).toContainText('说书人');
    await expect(first.locator('#message')).toHaveAttribute('placeholder', '向 说书人…');
    await expectPrivateComposer(first);
    await expect(first.locator('#left-text-panel .public-chat-message p').filter({ hasText: dmMessage })).toHaveText(dmMessage);
    await expect(first.locator('#left-text-panel .public-chat-message p').filter({ hasText: whisper })).toHaveCount(0);
    const dmReply = `向说书人回复 ${Date.now()}`;
    await sendText(first, dmReply);
    await expect(host.locator('#left-text-panel .public-chat-message p').filter({ hasText: dmReply })).toHaveText(dmReply);
    expect(await envelopeAnimations(host)).toHaveLength(0);
    expect(await envelopeAnimations(first)).toHaveLength(2);

    // Returning to neighbors after storyteller chat must restore the neighbor target, not self.
    await first.locator('.chat-channel-tabs').getByRole('button', { name: '邻座', exact: true }).click();
    await expect(first.locator('#message')).toHaveAttribute('placeholder', `向 ${secondUser.name}…`);
    await expect(first.locator('#left-text-panel .public-chat-message p').filter({ hasText: reply })).toHaveText(reply);
    await expect(first.locator('#left-text-panel .public-chat-message p').filter({ hasText: dmReply })).toHaveCount(0);

    await first.setViewportSize({ width: 390, height: 844 });
    await expectPrivateComposer(first);
    await expect(first.locator('#message')).toBeInViewport();
    await expect(first.locator('#left-text-panel').getByRole('button', { name: '发送', exact: true })).toBeInViewport();
    await first.getByRole('button', { name: '选择文字会话', exact: true }).click();
    await expect(first.locator('.chat-conversation-list')).toBeInViewport();
    await first.screenshot({ path: info.outputPath('text-conversations-mobile.png') });
    const unrelatedText = await receivedPrivateText(observer);
    for (const privateText of [whisper, reply, dmMessage, dmReply]) expect(unrelatedText).not.toContain(privateText);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});

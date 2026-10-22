import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("public beta shell renders without accessibility violations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const response = await page.goto("/");
  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator("body")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("帽帽钟楼");
  await page.evaluate(() => document.fonts.ready);

  const accessibilityScan = await new AxeBuilder({ page })
    .exclude(".modal-backdrop")
    .analyze();
  expect(accessibilityScan.violations).toEqual([]);
  await expect(page).toHaveScreenshot("public-beta-home.png", {
    animations: "disabled",
    caret: "hide",
    fullPage: true,
    maxDiffPixelRatio: 0.08,
  });
});

test.describe("configured multi-context room smoke", () => {
  test.skip(!process.env.E2E_ROOM_URL, "Set E2E_ROOM_URL to run the multi-context room smoke flow");

  test("host and player contexts can open the configured smoke room", async ({ browser }) => {
    const roomUrl = process.env.E2E_ROOM_URL!;
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();
    const host = await hostContext.newPage();
    const player = await playerContext.newPage();
    await Promise.all([host.goto(roomUrl), player.goto(roomUrl)]);
    await expect(host.locator("body")).toBeVisible();
    await expect(player.locator("body")).toBeVisible();
    await hostContext.close();
    await playerContext.close();
  });
});

test.describe("full-stack host and player flow", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(process.env.E2E_FULL_STACK !== "true", "Set E2E_FULL_STACK=true to run the full-stack room flow");

  test("room state converges through seating, chat reload, an interrupted vote and game end", async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-1440x900", "The business flow runs once; viewport coverage is handled by the visual smoke test");
    test.setTimeout(240_000);

    const lobbyUrl = process.env.E2E_ROOM_URL!;
    const lobbyOrigin = new URL(lobbyUrl).origin;
    const roomName = `Beta E2E ${Date.now().toString(36)}`;
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();
    const secondPlayerContext = await browser.newContext();
    const invitedPlayerContext = await browser.newContext();

    try {
      const host = await hostContext.newPage();
      const hostRuntimeErrors: string[] = [];
      host.on("console", (message) => {
        if (message.type() === "error") {
          hostRuntimeErrors.push(`${message.text()} @ ${message.location().url}`);
        }
      });
      host.on("pageerror", (error) => hostRuntimeErrors.push(error.message));
      await host.emulateMedia({ reducedMotion: "reduce" });
      await host.goto(lobbyUrl);
      await expect(host.getByRole("heading", { name: "钟楼议事厅" })).toBeVisible();
      await host.getByRole("button", { name: "创建房间" }).first().click();
      await expect(host.getByRole("heading", { name: "创建房间" })).toBeVisible();
      await host.getByLabel(/房间名称/).fill(roomName);
      await host.getByRole("button", { name: "创建并进入" }).click();
      await expect(host).toHaveURL(/\/game\/[A-Za-z0-9_-]+/, { timeout: 20_000 });
      await expect(host.locator(".game-connection")).toContainText("已连接", { timeout: 20_000 });

      await host.getByRole("button", { name: "设置", exact: true }).click();
      const settingsDialog = host.getByRole("dialog", { name: "房间设置" });
      await expect(settingsDialog).toBeVisible();
      await settingsDialog.getByRole("tab", { name: "游戏" }).click();
      await settingsDialog.getByRole("button", { name: /选择剧本/ }).click();
      await expect(settingsDialog).not.toBeVisible();
      const troubleBrewingCard = host.locator(".edition-card").filter({ hasText: "暗流涌动" }).first();
      await expect(troubleBrewingCard).toBeVisible();
      await troubleBrewingCard.click();
      await expect(troubleBrewingCard).not.toBeVisible({ timeout: 20_000 });
      await expect(host.locator(".reference-side-panel")).toContainText("暗流涌动", { timeout: 20_000 });

      const roomId = new URL(host.url()).pathname.split("/").filter(Boolean).at(-1);
      expect(roomId).toBeTruthy();

      const player = await playerContext.newPage();
      await player.goto(`${lobbyOrigin}/rooms?devLogin=1&devIdentity=player&room=${encodeURIComponent(roomId!)}`);
      await expect(player.getByRole("heading", { name: "钟楼议事厅" })).toBeVisible();
      const roomRow = player.locator('[role="row"]').filter({ hasText: roomName });
      await expect(roomRow).toBeVisible({ timeout: 20_000 });
      await roomRow.getByRole("button", { name: "加入" }).click();
      await expect(player).toHaveURL(new RegExp(`/game/${roomId}$`), { timeout: 20_000 });
      await expect(player.locator(".game-connection")).toContainText("已连接", { timeout: 20_000 });

      const hostSeats = host.locator(".reference-seat");
      const playerSeats = player.locator(".reference-seat");
      const initialSeatCount = await hostSeats.count();
      expect(initialSeatCount).toBeGreaterThanOrEqual(2);
      await expect(playerSeats).toHaveCount(initialSeatCount);

      await host.getByRole("button", { name: "房间命令" }).click();
      const addSeatButton = host.getByRole("button", { name: "添加座位" });
      await expect(addSeatButton).toBeEnabled();
      await addSeatButton.click();
      await expect(hostSeats).toHaveCount(initialSeatCount + 1, { timeout: 10_000 });
      await expect(playerSeats).toHaveCount(initialSeatCount + 1, { timeout: 10_000 });

      const firstEmptySeat = player.getByRole("button", { name: "第 1 席为空，点击坐下" });
      await expect(firstEmptySeat).toBeEnabled();
      await firstEmptySeat.click();
      await expect(player.getByText("玩家席位 1", { exact: true })).toBeVisible({ timeout: 10_000 });
      await expect(player.getByRole("button", { name: /第 1 席，.+，存活，打开玩家操作/ })).toBeVisible();
      await expect(host.getByRole("button", { name: /第 1 席，.+，存活，打开玩家操作/ })).toBeVisible();

      const hostFirstSeat = host.getByRole("button", { name: /第 1 席，.+，存活，打开玩家操作/ });
      await hostFirstSeat.click();
      const hostPlayerActions = host.getByRole("dialog", { name: /第 1 席/ });
      await expect(hostPlayerActions.getByRole("button", { name: /与该玩家私聊/ })).toBeEnabled();
      await hostPlayerActions.getByRole("button", { name: /与该玩家私聊/ }).click();
      const hostPrivateChat = host.getByRole("region", { name: /说书人私聊/ });
      const dmMessage = `E2E 私聊 ${Date.now().toString(36)}`;
      await hostPrivateChat.getByLabel("输入房间消息").fill(dmMessage);
      await hostPrivateChat.getByRole("button", { name: "发送" }).click();

      const playerFirstSeat = player.getByRole("button", { name: /第 1 席，.+，存活，打开玩家操作/ });
      await playerFirstSeat.click();
      const playerActions = player.getByRole("dialog", { name: /第 1 席/ });
      await expect(playerActions.getByRole("button", { name: /联系说书人/ })).toBeEnabled();
      await playerActions.getByRole("button", { name: /联系说书人/ }).click();
      const playerPrivateChat = player.getByRole("region", { name: /说书人私聊/ });
      await expect(playerPrivateChat.getByText(dmMessage, { exact: true })).toBeVisible({ timeout: 10_000 });
      const playerReply = `E2E 回复 ${Date.now().toString(36)}`;
      await playerPrivateChat.getByLabel("输入房间消息").fill(playerReply);
      await playerPrivateChat.getByRole("button", { name: "发送" }).click();
      await expect(hostPrivateChat.getByText(playerReply, { exact: true })).toBeVisible({ timeout: 10_000 });

      await hostPrivateChat.getByRole("button", { name: "收起聊天" }).click();
      await hostFirstSeat.click();
      await host.getByRole("dialog", { name: /第 1 席/ })
        .getByRole("button", { name: /私人笔记/ }).click();
      const notesDialog = host.getByRole("dialog", { name: /私人笔记/ });
      await notesDialog.getByLabel("判断与行动记录").fill("E2E：第一夜已核对");
      await notesDialog.getByLabel("提醒标记").fill("已核对");
      await notesDialog.getByRole("button", { name: "添加" }).click();
      await notesDialog.getByRole("button", { name: "保存笔记" }).click();
      await expect(notesDialog).not.toBeVisible();

      await hostFirstSeat.click();
      await host.getByRole("dialog", { name: /第 1 席/ })
        .getByRole("button", { name: /私人笔记/ }).click();
      const reloadedNotesDialog = host.getByRole("dialog", { name: /私人笔记/ });
      await expect(reloadedNotesDialog.getByLabel("判断与行动记录"))
        .toHaveValue("E2E：第一夜已核对");
      await expect(reloadedNotesDialog.getByText("已核对", { exact: true })).toBeVisible();
      await reloadedNotesDialog.getByRole("button", { name: "取消" }).click();

      await host.getByRole("button", { name: "房间命令" }).click();
      await Promise.all([
        host.getByRole("button", { name: "打开文本聊天" }).click(),
        player.getByRole("button", { name: "打开文本聊天" }).click(),
      ]);
      const chatMessage = `E2E 公聊 ${Date.now().toString(36)}`;
      const playerChat = player.getByRole("region", { name: "房间公聊" });
      const hostChat = host.getByRole("region", { name: "房间公聊" });
      await expect(playerChat).toBeVisible();
      await expect(hostChat).toBeVisible();
      await playerChat.getByLabel("输入房间消息").fill(chatMessage);
      await playerChat.getByRole("button", { name: "发送" }).click();
      await expect(playerChat.getByText(chatMessage, { exact: true })).toBeVisible({ timeout: 10_000 });
      await expect(hostChat.getByText(chatMessage, { exact: true })).toBeVisible({ timeout: 10_000 });

      await player.reload();
      await expect(player.locator(".game-connection")).toContainText("已连接", { timeout: 20_000 });
      await expect(player.getByText("玩家席位 1", { exact: true })).toBeVisible({ timeout: 10_000 });
      await player.getByRole("button", { name: "打开文本聊天" }).click();
      const recoveredChat = player.getByRole("region", { name: "房间公聊" });
      await expect(recoveredChat).toBeVisible();
      await expect(recoveredChat.getByText(chatMessage, { exact: true })).toHaveCount(1, { timeout: 10_000 });

      const secondPlayer = await secondPlayerContext.newPage();
      await secondPlayer.goto(`${lobbyOrigin}/rooms?devLogin=1&devIdentity=player&room=${encodeURIComponent(roomId!)}`);
      await expect(secondPlayer.getByRole("heading", { name: "钟楼议事厅" })).toBeVisible();
      const secondPlayerRoomRow = secondPlayer.locator('[role="row"]').filter({ hasText: roomName });
      await expect(secondPlayerRoomRow).toBeVisible({ timeout: 20_000 });
      await secondPlayerRoomRow.getByRole("button", { name: "加入" }).click();
      await expect(secondPlayer).toHaveURL(new RegExp(`/game/${roomId}$`), { timeout: 20_000 });
      await expect(secondPlayer.locator(".game-connection")).toContainText("已连接", { timeout: 20_000 });
      await secondPlayer.getByRole("button", { name: "第 2 席为空，点击坐下" }).click();
      await expect(secondPlayer.getByText("玩家席位 2", { exact: true })).toBeVisible({ timeout: 10_000 });

      await recoveredChat.getByRole("button", { name: "收起聊天" }).click();
      await player.getByRole("button", { name: /第 2 席，.+，存活，打开玩家操作/ }).click();
      const firstPlayerWhisperAction = player.getByRole("dialog", { name: /第 2 席/ });
      await expect(firstPlayerWhisperAction.getByRole("button", { name: /发送悄悄话/ })).toBeEnabled();
      await firstPlayerWhisperAction.getByRole("button", { name: /发送悄悄话/ }).click();
      const firstPlayerWhisper = player.getByRole("region", { name: /悄悄话/ });
      const whisperMessage = `E2E 悄悄话 ${Date.now().toString(36)}`;
      await firstPlayerWhisper.getByLabel("输入房间消息").fill(whisperMessage);
      await firstPlayerWhisper.getByRole("button", { name: "发送" }).click();

      await secondPlayer.getByRole("button", { name: /第 1 席，.+，存活，打开玩家操作/ }).click();
      const secondPlayerWhisperAction = secondPlayer.getByRole("dialog", { name: /第 1 席/ });
      await secondPlayerWhisperAction.getByRole("button", { name: /发送悄悄话/ }).click();
      const secondPlayerWhisper = secondPlayer.getByRole("region", { name: /悄悄话/ });
      await expect(secondPlayerWhisper.getByText(whisperMessage, { exact: true }))
        .toBeVisible({ timeout: 10_000 });

      await host.getByRole("button", { name: "房间命令" }).click();
      const roomConsole = host.getByRole("region", { name: "房间控制台" });
      await expect(roomConsole).toBeVisible();
      await roomConsole.getByRole("button", { name: /随机分配角色/ }).click();
      const assignmentDialog = host.getByRole("dialog", { name: "确认随机分配角色" });
      await expect(assignmentDialog).toContainText("当前 2 名玩家已入座");
      await assignmentDialog.getByRole("button", { name: "确认覆盖并分配" }).click();
      await expect(assignmentDialog).not.toBeVisible({ timeout: 10_000 });

      await host.getByRole("button", { name: "打开阶段与夜晚顺序" }).click();
      const nightOrderDialog = host.getByRole("dialog", { name: "阶段与夜间顺序" });
      await expect(nightOrderDialog).toBeVisible();
      await nightOrderDialog.getByRole("button", { name: "开启游戏并进入第一夜" }).click();
      await expect(host.getByRole("dialog", { name: "请确认" })).not.toBeVisible();
      await expect(host.locator(".reference-center > strong")).toHaveText("第 1 夜", { timeout: 10_000 });

      const nightResult = `E2E 首夜结果 ${Date.now().toString(36)}`;
      await expect(nightOrderDialog).toBeVisible();
      await nightOrderDialog.getByTestId("night-record-edit-character:washerwoman").click();
      const washerwomanTargets = nightOrderDialog.locator(
        '[data-testid^="night-target-character:washerwoman-"]',
      );
      await expect(washerwomanTargets).toHaveCount(2);
      await washerwomanTargets.nth(0).click();
      await washerwomanTargets.nth(1).click();
      await nightOrderDialog.getByTestId("night-result-character:washerwoman").fill(nightResult);
      await nightOrderDialog.getByTestId("night-record-save-character:washerwoman").click();
      await expect(nightOrderDialog.getByText(nightResult, { exact: true })).toBeVisible({ timeout: 10_000 });
      const washerwomanComplete = nightOrderDialog.getByTestId("night-action-character:washerwoman");
      await washerwomanComplete.click();
      await expect(washerwomanComplete).toHaveAttribute("aria-pressed", "true");

      await nightOrderDialog.getByTestId("night-record-edit-character:poisoner").click();
      const poisonerTargets = nightOrderDialog.locator(
        '[data-testid^="night-target-character:poisoner-"]',
      );
      await expect(poisonerTargets).toHaveCount(2);
      await poisonerTargets.nth(0).click();
      await nightOrderDialog.getByTestId("night-record-save-character:poisoner").click();
      await nightOrderDialog.getByTestId("night-resolution-open-character:poisoner").click();
      await expect(nightOrderDialog).toContainText("仅记录为说书人可见的裁定");
      await nightOrderDialog.getByTestId("night-resolution-confirm-character:poisoner").click();
      const poisonerResolution = nightOrderDialog
        .getByTestId("night-resolution-status-character:poisoner");
      await expect(poisonerResolution).toContainText("中毒影响", { timeout: 10_000 });

      await player.getByRole("button", { name: "打开阶段与夜晚顺序" }).click();
      const playerNightOrderDialog = player.getByRole("dialog", { name: "阶段与夜间顺序" });
      await expect(playerNightOrderDialog).toBeVisible();
      await expect(playerNightOrderDialog.getByText(nightResult, { exact: true })).toHaveCount(0);
      await expect(playerNightOrderDialog
        .getByTestId("night-resolution-status-character:poisoner")).toHaveCount(0);
      await playerNightOrderDialog.getByRole("button", { name: "关闭阶段与夜间顺序" }).click();

      await host.reload();
      await expect(host.locator(".game-connection")).toContainText("已连接", { timeout: 20_000 });
      await expect(host.locator(".reference-center > strong")).toHaveText("第 1 夜", { timeout: 10_000 });
      await host.getByRole("button", { name: "打开阶段与夜晚顺序" }).click();
      const recoveredNightOrderDialog = host.getByRole("dialog", { name: "阶段与夜间顺序" });
      await expect(recoveredNightOrderDialog.getByText(nightResult, { exact: true })).toBeVisible({ timeout: 10_000 });
      await expect(recoveredNightOrderDialog.getByTestId("night-action-character:washerwoman"))
        .toHaveAttribute("aria-pressed", "true");
      await expect(recoveredNightOrderDialog
        .getByTestId("night-resolution-status-character:poisoner"))
        .toContainText("中毒影响", { timeout: 10_000 });
      await recoveredNightOrderDialog.getByRole("button", { name: "关闭阶段与夜间顺序" }).click();

      await host.getByRole("button", { name: "打开阶段与夜晚顺序" }).click();
      const dayPhaseDialog = host.getByRole("dialog", { name: "阶段与夜间顺序" });
      await dayPhaseDialog.getByRole("button", { name: "切换到第 1 天" }).click();
      await expect(host.getByRole("dialog", { name: "请确认" })).not.toBeVisible();
      await expect(host.locator(".reference-center > strong")).toHaveText("第 1 天", { timeout: 10_000 });
      await expect(player.locator(".reference-center > strong")).toHaveText("第 1 天", { timeout: 10_000 });
      await expect(secondPlayer.locator(".reference-center > strong")).toHaveText("第 1 天", { timeout: 10_000 });
      await dayPhaseDialog.getByRole("button", { name: "关闭阶段与夜间顺序" }).click();

      const invitedPlayer = await invitedPlayerContext.newPage();
      await invitedPlayer.goto(`${lobbyOrigin}/rooms?devLogin=1&devIdentity=player&room=${encodeURIComponent(roomId!)}`);
      await expect(invitedPlayer.getByRole("heading", { name: "钟楼议事厅" })).toBeVisible();
      const invitedRoomRow = invitedPlayer.locator('[role="row"]').filter({ hasText: roomName });
      await expect(invitedRoomRow).toBeVisible({ timeout: 20_000 });
      await invitedRoomRow.getByRole("button", { name: "加入" }).click();
      await expect(invitedPlayer).toHaveURL(new RegExp(`/game/${roomId}$`), { timeout: 20_000 });
      await expect(invitedPlayer.locator(".game-connection")).toContainText("已连接", { timeout: 20_000 });

      await host.getByRole("button", { name: "房间命令" }).click();
      const dayRoomConsole = host.getByRole("region", { name: "房间控制台" });
      await dayRoomConsole.getByRole("button", { name: "邀请与分享" }).click();
      const inviteDialog = host.getByRole("dialog", { name: "邀请与分享" });
      await expect(inviteDialog.getByRole("radio")).toHaveCount(1);
      await expect(inviteDialog.getByRole("radio")).toBeChecked();
      await inviteDialog.getByRole("button", { name: "发送入座邀请" }).click();

      const invitedApplyDialog = invitedPlayer.getByRole("dialog", { name: "说书人邀请你加入游戏" });
      await expect(invitedApplyDialog).toBeVisible({ timeout: 10_000 });
      await invitedApplyDialog.getByRole("button", { name: "同意并加入" }).click();
      await expect(invitedPlayer.getByText(`玩家席位 ${initialSeatCount + 2}`, { exact: true }))
        .toBeVisible({ timeout: 10_000 });
      await expect(inviteDialog).not.toBeVisible({ timeout: 10_000 });

      // The vote shortcut selects seats on the table and opens the central dialog.
      await host.keyboard.press('v');
      const hostVotePanel = host.locator("#table-nomination-panel");
      const targetingPrompt = host.locator(".reference-operation-prompt");
      await expect(hostVotePanel).not.toBeVisible();
      await expect(targetingPrompt).toContainText("选择被提名者");
      // Nominee is seat 1 (player). Turn order opens on the seat after the nominee,
      // so seat 2 (secondPlayer) votes first and seat 1 votes last — which is what
      // puts the reloaded page in the middle of an unfinished vote.
      await host.getByRole("button", { name: /^选第 1 席 .+ 为被提名者$/ }).click();
      await expect(targetingPrompt).toContainText("选择提名者");
      // Nominator is invitedPlayer, the last seat to fill.
      await host
        .getByRole("button", { name: new RegExp(`^选第 ${initialSeatCount + 2} 席 .+ 为提名者$`) })
        .click();
      const nominationConfirmCard = host.getByRole("dialog", { name: "确认本轮提名" });
      await expect(nominationConfirmCard).toBeVisible();
      await testInfo.attach("day-nomination-desktop", {
        body: await host.screenshot(),
        contentType: "image/png",
      });
      await host.setViewportSize({ width: 375, height: 667 });
      const nominationAccessibility = await new AxeBuilder({ page: host })
        .include(".nomination-confirm-card")
        .analyze();
      expect(nominationAccessibility.violations).toEqual([]);
      await testInfo.attach("day-nomination-phone", {
        body: await host.screenshot(),
        contentType: "image/png",
      });
      await nominationConfirmCard.getByRole("button", { name: "确认并开始投票" }).click();
      const playerVotePanel = player.locator("#table-nomination-panel");
      const secondPlayerVotePanel = secondPlayer.locator("#table-nomination-panel");
      const invitedPlayerVotePanel = invitedPlayer.locator("#table-nomination-panel");
      await expect(secondPlayerVotePanel).toContainText("现在轮到你投票。", { timeout: 10_000 });
      await expect(playerVotePanel).toContainText("现在轮到第 2 席投票。", { timeout: 10_000 });
      await expect(invitedPlayerVotePanel).toContainText("现在轮到第 2 席投票。", { timeout: 10_000 });

      await player.reload();
      await expect(player.locator(".game-connection")).toContainText("已连接", { timeout: 20_000 });
      await expect(player.getByText("玩家席位 1", { exact: true })).toBeVisible({ timeout: 10_000 });
      const recoveredVotePanel = player.locator("#table-nomination-panel");
      // Seats 2 and 10 vote, then the turn wraps to the nominee at seat 1 — the page
      // that just reloaded. Casting that last vote is what proves the reconnect
      // restored a live, actionable vote rather than a read-only replay.
      await expect(secondPlayerVotePanel).toContainText("现在轮到你投票。", { timeout: 10_000 });
      await secondPlayerVotePanel.getByRole("button", { name: /^赞成/ }).click();
      await expect(invitedPlayerVotePanel).toContainText("现在轮到你投票。", { timeout: 10_000 });
      await invitedPlayerVotePanel.getByRole("button", { name: /^赞成/ }).click();
      await expect(recoveredVotePanel).toContainText("现在轮到你投票。", { timeout: 10_000 });
      await recoveredVotePanel.getByRole("button", { name: /^赞成/ }).click();
      await expect(secondPlayerVotePanel).toContainText("投票通过", { timeout: 10_000 });
      await expect(recoveredVotePanel).toContainText("投票通过", { timeout: 10_000 });
      await expect(invitedPlayerVotePanel).toContainText("投票通过", { timeout: 10_000 });
      await expect(host.locator("#table-nomination-panel")).toContainText("投票通过", { timeout: 10_000 });
      await host.setViewportSize({ width: 844, height: 390 });
      const votingAccessibility = await new AxeBuilder({ page: host })
        .include("#table-nomination-panel")
        .analyze();
      expect(votingAccessibility.violations).toEqual([]);
      const tableBox = await host.locator('.reference-table').boundingBox();
      const voteBox = await hostVotePanel.boundingBox();
      expect(Math.abs(voteBox!.x + voteBox!.width / 2 - tableBox!.x - tableBox!.width / 2)).toBeLessThan(2);
      await expect(host.locator('#realtime-vote-panel')).toHaveCount(0);
      await hostVotePanel.getByRole('button', { name: '关闭', exact: true }).click();
      await host.setViewportSize({ width: 1440, height: 900 });

      const endRoomConsole = host.getByRole("region", { name: "房间控制台" });
      if (!(await endRoomConsole.isVisible())) {
        await host.getByRole("button", { name: "房间命令" }).click();
      }
      await expect(endRoomConsole).toBeVisible();
      const endGameButton = host.getByRole("button", { name: "结束游戏", exact: true });
      await endGameButton.click();
      const endGameDialog = host.getByRole("dialog", { name: "确认结束本局游戏" });
      await expect(endGameDialog).toBeVisible();
      await expect(endGameDialog).toContainText("无法撤销");
      await endGameDialog.getByRole("radio", { name: "阵营胜利" }).check();
      await endGameDialog.getByLabel("胜利阵营").selectOption("townsfolk");
      await endGameDialog.getByRole("button", { name: "确认结束并公开角色" }).click();

      await expect(host.locator(".storyteller-feedback")).toHaveText(
        "结束游戏并公布结果成功，等待服务器最终确认。",
        { timeout: 10_000 },
      );
      await expect(endGameButton).toBeDisabled();
      await expect(host.locator(".reference-center > strong")).toHaveText("终局盘点", { timeout: 10_000 });
      await expect(player.locator(".reference-center > strong")).toHaveText("终局盘点", { timeout: 10_000 });
      await expect(secondPlayer.locator(".reference-center > strong")).toHaveText("终局盘点", { timeout: 10_000 });

      for (const page of [host, player, secondPlayer, invitedPlayer]) {
        await expect(page.getByRole("dialog", { name: "镇民阵营胜利" })).toHaveCount(0);
        await expect(page.getByRole("button", { name: /终局结果/ })).toHaveCount(0);
      }

      const lobbyObserver = await hostContext.newPage();
      await lobbyObserver.goto(lobbyUrl);
      await expect(lobbyObserver.getByRole("heading", { name: "钟楼议事厅" })).toBeVisible();
      const endedRoomRow = lobbyObserver.locator('[role="row"]').filter({ hasText: roomName });
      await expect(endedRoomRow).toHaveCount(0, { timeout: 20_000 });
      await expect(lobbyObserver.getByRole("heading", { name: "房间名册" })).toBeVisible();
      expect(hostRuntimeErrors).toEqual([]);
    } finally {
      await hostContext.close();
      await playerContext.close();
      await secondPlayerContext.close();
      await invitedPlayerContext.close();
    }
  });

  test("night workbench remains usable on phone and landscape viewports", async ({ browser }, testInfo) => {
    test.skip(
      !["phone-375x667", "landscape-844x390"].includes(testInfo.project.name),
      "The focused night workbench pass runs on the smallest phone and landscape projects",
    );
    test.setTimeout(90_000);

    const lobbyUrl = process.env.E2E_ROOM_URL!;
    const lobbyOrigin = new URL(lobbyUrl).origin;
    const roomName = `Night UI ${testInfo.project.name} ${Date.now().toString(36)}`;
    const hostContext = await browser.newContext();
    const firstPlayerContext = await browser.newContext();
    const secondPlayerContext = await browser.newContext();

    try {
      const host = await hostContext.newPage();
      await host.emulateMedia({ reducedMotion: "reduce" });
      await host.goto(lobbyUrl);
      await host.getByRole("button", { name: "创建房间" }).first().click();
      await host.getByLabel(/房间名称/).fill(roomName);
      await host.getByRole("button", { name: "创建并进入" }).click();
      await expect(host.locator(".game-connection")).toContainText("已连接", { timeout: 20_000 });

      await host.getByRole("button", { name: "设置", exact: true }).click();
      const settingsDialog = host.getByRole("dialog", { name: "房间设置" });
      await settingsDialog.getByRole("tab", { name: "游戏" }).click();
      await settingsDialog.getByRole("button", { name: /选择剧本/ }).click();
      const troubleBrewingCard = host.locator(".edition-card").filter({ hasText: "暗流涌动" }).first();
      await troubleBrewingCard.click();
      await expect(host.locator(".reference-side-panel")).toContainText("暗流涌动", { timeout: 20_000 });

      const roomId = new URL(host.url()).pathname.split("/").filter(Boolean).at(-1);
      expect(roomId).toBeTruthy();
      const playerRoomUrl = `${lobbyOrigin}/rooms?devLogin=1&devIdentity=player&room=${encodeURIComponent(roomId!)}`;

      const firstPlayer = await firstPlayerContext.newPage();
      await firstPlayer.goto(playerRoomUrl);
      await firstPlayer.getByRole("button", { name: "加入这间房" }).click();
      await expect(firstPlayer.locator(".game-connection")).toContainText("已连接", { timeout: 20_000 });
      await firstPlayer.getByRole("button", { name: "第 1 席为空，点击坐下" }).click();

      const secondPlayer = await secondPlayerContext.newPage();
      await secondPlayer.goto(playerRoomUrl);
      await secondPlayer.getByRole("button", { name: "加入这间房" }).click();
      await expect(secondPlayer.locator(".game-connection")).toContainText("已连接", { timeout: 20_000 });
      await secondPlayer.getByRole("button", { name: "第 2 席为空，点击坐下" }).click();

      await host.getByRole("button", { name: "房间命令" }).click();
      const roomConsole = host.getByRole("region", { name: "房间控制台" });
      await roomConsole.getByRole("button", { name: /随机分配角色/ }).click();
      const assignmentDialog = host.getByRole("dialog", { name: "确认随机分配角色" });
      await assignmentDialog.getByRole("button", { name: "确认覆盖并分配" }).click();
      await host.getByRole("button", { name: "房间命令" }).click();
      await expect(roomConsole).not.toBeVisible();

      await host.getByRole("button", { name: "打开阶段与夜晚顺序" }).click();
      const nightOrderDialog = host.getByRole("dialog", { name: "阶段与夜间顺序" });
      await nightOrderDialog.getByRole("button", { name: "开启游戏并进入第一夜" }).click();
      await expect(host.getByRole("dialog", { name: "请确认" })).not.toBeVisible();
      await expect(host.locator(".reference-center > strong")).toHaveText("第 1 夜", { timeout: 10_000 });

      await nightOrderDialog.getByTestId("night-record-edit-character:washerwoman").click();
      const targets = nightOrderDialog.locator('[data-testid^="night-target-character:washerwoman-"]');
      await expect(targets).toHaveCount(2);
      const layout = await host.evaluate(() => {
        const rect = (selector: string) => document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
        const targetRects = [...document.querySelectorAll<HTMLElement>(
          '[data-testid^="night-target-character:washerwoman-"]',
        )].map((element) => element.getBoundingClientRect());
        const editorRect = rect("#night-action-editor-character-washerwoman");
        return {
          horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          editorInsideViewport: Boolean(editorRect)
            && editorRect!.left >= -1
            && editorRect!.right <= document.documentElement.clientWidth + 1,
          editorWidth: editorRect?.width ?? 0,
          editHeight: rect('[data-testid="night-record-edit-character:washerwoman"]')?.height ?? 0,
          saveHeight: rect('[data-testid="night-record-save-character:washerwoman"]')?.height ?? 0,
          targetHeights: targetRects.map((target) => target.height),
        };
      });
      expect(layout.horizontalOverflow).toBeLessThanOrEqual(1);
      expect(layout.editorInsideViewport).toBe(true);
      expect(layout.editHeight).toBeGreaterThanOrEqual(44);
      expect(layout.saveHeight).toBeGreaterThanOrEqual(44);
      expect(layout.targetHeights.every((height) => height >= 48)).toBe(true);
      if (testInfo.project.name === "landscape-844x390") {
        expect(layout.editorWidth).toBeGreaterThanOrEqual(300);
      }
      await host.screenshot({
        path: testInfo.outputPath(`night-workbench-${testInfo.project.name}.png`),
        fullPage: false,
      });

      await targets.nth(0).click();
      await targets.nth(1).click();
      const nightResult = `响应式结果 ${testInfo.project.name}`;
      await nightOrderDialog.getByTestId("night-result-character:washerwoman").fill(nightResult);
      await nightOrderDialog.getByTestId("night-record-save-character:washerwoman").click();
      await nightOrderDialog.getByTestId("night-action-character:washerwoman").click();
      await expect(nightOrderDialog.getByTestId("night-action-character:washerwoman"))
        .toHaveAttribute("aria-pressed", "true");

      await nightOrderDialog.getByTestId("night-record-edit-character:poisoner").click();
      const poisonerTargets = nightOrderDialog.locator(
        '[data-testid^="night-target-character:poisoner-"]',
      );
      await expect(poisonerTargets).toHaveCount(2);
      await poisonerTargets.nth(0).click();
      await nightOrderDialog.getByTestId("night-record-save-character:poisoner").click();
      const resolutionOpen = nightOrderDialog
        .getByTestId("night-resolution-open-character:poisoner");
      await resolutionOpen.click();
      const resolutionLayout = await host.evaluate(() => {
        const rect = (selector: string) => document.querySelector<HTMLElement>(selector)
          ?.getBoundingClientRect();
        return {
          horizontalOverflow: document.documentElement.scrollWidth
            - document.documentElement.clientWidth,
          openHeight: rect('[data-testid="night-resolution-open-character:poisoner"]')?.height ?? 0,
          cancelHeight: rect('[data-testid="night-resolution-cancel-character:poisoner"]')?.height ?? 0,
          confirmHeight: rect('[data-testid="night-resolution-confirm-character:poisoner"]')?.height ?? 0,
        };
      });
      expect(resolutionLayout.horizontalOverflow).toBeLessThanOrEqual(1);
      expect(resolutionLayout.openHeight).toBeGreaterThanOrEqual(44);
      expect(resolutionLayout.cancelHeight).toBeGreaterThanOrEqual(44);
      expect(resolutionLayout.confirmHeight).toBeGreaterThanOrEqual(44);
      const resolutionAccessibility = await new AxeBuilder({ page: host })
        .include(".night-action-editor__resolution-confirm")
        .analyze();
      expect(resolutionAccessibility.violations).toEqual([]);
      await host.screenshot({
        path: testInfo.outputPath(`night-resolution-${testInfo.project.name}.png`),
        fullPage: false,
      });
      await nightOrderDialog.getByTestId("night-resolution-confirm-character:poisoner").click();
      await expect(nightOrderDialog.getByTestId("night-resolution-status-character:poisoner"))
        .toContainText("中毒影响", { timeout: 10_000 });

      await firstPlayer.getByRole("button", { name: "打开阶段与夜晚顺序" }).click();
      await expect(firstPlayer.getByRole("dialog", { name: "阶段与夜间顺序" })
        .getByText(nightResult, { exact: true })).toHaveCount(0);
      await expect(firstPlayer.getByRole("dialog", { name: "阶段与夜间顺序" })
        .getByTestId("night-resolution-status-character:poisoner")).toHaveCount(0);

      await host.reload();
      await expect(host.locator(".game-connection")).toContainText("已连接", { timeout: 20_000 });
      await host.getByRole("button", { name: "打开阶段与夜晚顺序" }).click();
      const recoveredDialog = host.getByRole("dialog", { name: "阶段与夜间顺序" });
      await expect(recoveredDialog.getByText(nightResult, { exact: true })).toBeVisible({ timeout: 10_000 });
      await expect(recoveredDialog.getByTestId("night-action-character:washerwoman"))
        .toHaveAttribute("aria-pressed", "true");
      await expect(recoveredDialog.getByTestId("night-resolution-status-character:poisoner"))
        .toContainText("中毒影响", { timeout: 10_000 });
    } finally {
      await Promise.all([
        hostContext.close(),
        firstPlayerContext.close(),
        secondPlayerContext.close(),
      ]);
    }
  });

  test("host and player return to the lobby after a Game Server restart", async ({ browser, request }) => {
    test.skip(test.info().project.name !== "desktop-1440x900", "The restart flow runs once on the desktop project");
    test.skip(!process.env.E2E_CONTROL_URL, "Run through scripts/run-full-stack-e2e.mjs to control the Game Server process");
    test.setTimeout(60_000);

    const lobbyUrl = process.env.E2E_ROOM_URL!;
    const lobbyOrigin = new URL(lobbyUrl).origin;
    const roomName = `Restart E2E ${Date.now().toString(36)}`;
    const hostContext = await browser.newContext();
    const playerContext = await browser.newContext();

    try {
      const host = await hostContext.newPage();
      await host.goto(lobbyUrl);
      await expect(host.getByRole("heading", { name: "钟楼议事厅" })).toBeVisible();
      await host.getByRole("button", { name: "创建房间" }).first().click();
      await host.getByLabel(/房间名称/).fill(roomName);
      await host.getByRole("button", { name: "创建并进入" }).click();
      await expect(host).toHaveURL(/\/game\/[A-Za-z0-9_-]+/, { timeout: 20_000 });
      await expect(host.locator(".game-connection")).toContainText("已连接", { timeout: 20_000 });

      const roomId = new URL(host.url()).pathname.split("/").filter(Boolean).at(-1);
      expect(roomId).toBeTruthy();

      const player = await playerContext.newPage();
      await player.goto(`${lobbyOrigin}/rooms?devLogin=1&devIdentity=player&room=${encodeURIComponent(roomId!)}`);
      const roomRow = player.locator('[role="row"]').filter({ hasText: roomName });
      await expect(roomRow).toBeVisible({ timeout: 20_000 });
      await roomRow.getByRole("button", { name: "加入" }).click();
      await expect(player).toHaveURL(new RegExp(`/game/${roomId}$`), { timeout: 20_000 });
      await expect(player.locator(".game-connection")).toContainText("已连接", { timeout: 20_000 });

      const restartResponse = await request.post(`${process.env.E2E_CONTROL_URL}/restart-game`, {
        headers: { "x-e2e-control-token": process.env.E2E_CONTROL_TOKEN || "" },
      });
      const restartBody = await restartResponse.text();
      expect(restartResponse.status(), restartBody).toBe(200);

      await expect(host).toHaveURL(/\/rooms(?:\?.*)?$/, { timeout: 30_000 });
      await expect(player).toHaveURL(/\/rooms(?:\?.*)?$/, { timeout: 30_000 });
      await expect(host.getByRole("heading", { name: "钟楼议事厅" })).toBeVisible();
      await expect(player.getByRole("heading", { name: "钟楼议事厅" })).toBeVisible();
      const restartMessage = "房间因服务重启或服务器离线已结束";
      await expect(host.locator(".notyf__message").filter({ hasText: restartMessage })).toBeVisible();
      await expect(player.locator(".notyf__message").filter({ hasText: restartMessage })).toBeVisible();
      await expect(host.locator('[role="row"]').filter({ hasText: roomName })).toHaveCount(0, { timeout: 20_000 });
      await expect(player.locator('[role="row"]').filter({ hasText: roomName })).toHaveCount(0, { timeout: 20_000 });
    } finally {
      await Promise.all([hostContext.close(), playerContext.close()]);
    }
  });
});

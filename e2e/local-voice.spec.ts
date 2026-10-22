import { test, expect, chromium, type Page } from "@playwright/test";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

async function voice(page: Page, method: string, argument?: unknown) {
  return page.evaluate(async ({ method, argument }) => {
    const path = "/src/controllers/VoiceController.ts";
    const controller = (await import(/* @vite-ignore */ path)).useVoiceController();
    return controller[method](argument);
  }, { method, argument });
}
async function request(page: Page, event: string, data?: unknown) {
  return page.evaluate(async ({ event, data }) => {
    const path = "/src/controllers/GameController.ts";
    return (await import(/* @vite-ignore */ path)).useGameController().request(event, data);
  }, { event, data });
}
async function diagnostic(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/controllers/VoiceController.ts";
    const controller = (await import(/* @vite-ignore */ path)).useVoiceController();
    const current = controller.service?.activeConnection?.adapter;
    const broadcast = controller.service?.broadcastConnection?.adapter;
    let level = 0;
    let energy = 0;
    let packets = 0;
    const inputLevels: number[] = [];
    const rtcStats: unknown[] = [];
    for (const adapter of [current, broadcast]) {
      if (!adapter) continue;
      if (adapter.inputAnalyser) {
        const data = new Uint8Array(adapter.inputAnalyser.fftSize); adapter.inputAnalyser.getByteTimeDomainData(data);
        inputLevels.push(Math.sqrt(data.reduce((sum, x) => sum + ((x - 128) / 128) ** 2, 0) / data.length));
      }
      for (const peer of adapter.peers.values()) {
        if (peer.analyser) {
          const values = new Uint8Array(peer.analyser.fftSize);
          peer.analyser.getByteTimeDomainData(values);
          level = Math.max(level, Math.sqrt(values.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / values.length));
        }
        for (const stat of (await peer.pc.getStats()).values()) {
          if (stat.type === "inbound-rtp" && stat.kind === "audio") {
            energy += stat.totalAudioEnergy ?? 0;
            packets += stat.packetsReceived ?? 0;
          }
          if (["inbound-rtp", "outbound-rtp", "media-source"].includes(stat.type)) rtcStats.push({type:stat.type, packetsSent:stat.packetsSent, packetsReceived:stat.packetsReceived, totalAudioEnergy:stat.totalAudioEnergy, audioLevel:stat.audioLevel});
        }
      }
    }
    return { level, energy, packets, inputLevels, rtcStats, status: controller.connectionStatus, roomId: controller.currentActiveRoomId,
      peers: [current, broadcast].map(adapter => adapter ? ({ self: adapter.self, context: adapter.context?.state,
        mic: adapter.micEnabled, input: adapter.input?.getAudioTracks().map((t: MediaStreamTrack) => ({ enabled: t.enabled, state: t.readyState })),
        output: adapter.output?.getAudioTracks().map((t: MediaStreamTrack) => ({ enabled: t.enabled, state: t.readyState })),
        peers: [...adapter.peers.values()].map((p: any) => ({ userId: p.userId, connection: p.pc.connectionState,
          signaling: p.pc.signalingState, direction: p.pc.getTransceivers().map((t: RTCRtpTransceiver) => t.currentDirection), source: Boolean(p.source), muted: p.muted })) }) : null),
      provider: current?.adapterType, muted: current ? !current.micEnabled : true,
      micCalls: (window as any).__micCalls, liveTracks: (window as any).__streams.flatMap((stream: MediaStream) => stream.getTracks()).filter((track: MediaStreamTrack) => track.readyState === "live").length };
  });
}

test("local voice carries audio in both directions, gates PTT, isolates places, broadcasts and releases capture", async ({}, info) => {
  test.skip(process.env.E2E_LOCAL_VOICE !== "true" || info.project.name !== "desktop-1440x900", "Requires local development voice stack");
  test.setTimeout(120000);
  // Deterministic audio passes through getUserMedia, Opus, DTLS/SRTP and remote decoding.
  const wav = join(tmpdir(), `ubotc-voice-tone-${process.pid}-${Date.now()}.wav`);
  const samples = 48000;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(48000, 24); buffer.writeUInt32LE(96000, 28); buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34); buffer.write("data", 36); buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buffer.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * 440 / 48000) * 8000), 44 + i * 2);
  writeFileSync(wav, buffer);
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-audio-capture=${wav}`, "--autoplay-policy=no-user-gesture-required"],
  });
  try {
    const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
    for (const context of contexts) await context.addInitScript(() => {
      (window as any).__micCalls = 0; (window as any).__streams = [];
      const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async constraints => {
        (window as any).__micCalls++;
        const stream = await capture(constraints); (window as any).__streams.push(stream); return stream;
      };
    });
    const [host, player] = await Promise.all(contexts.map(context => context.newPage()));
    const errors: string[] = [];
    for (const page of [host, player]) page.on("pageerror", error => errors.push(error.message));
    const origin = process.env.E2E_BASE_URL || 'http://127.0.0.1:8081';
    await host.goto(`${origin}/rooms?devLogin=1`);
    await host.getByRole("button", { name: "创建房间", exact: true }).first().click();
    await host.getByLabel(/房间名称/).fill(`本机语音验收 ${Date.now()}`);
    await host.getByRole("button", { name: "创建并进入" }).click();
    await expect(host.locator(".game-connection")).toContainText("已连接", { timeout: 20000 });
    const roomId = new URL(host.url()).pathname.split("/").at(-1)!;
    await request(host, "dmSetSeatCount", { seatCount: 2 });
    await player.goto(`${origin}/game/${roomId}?devLogin=1&devIdentity=player`);
    await expect(player.locator(".game-connection")).toContainText("已连接", { timeout: 20000 });
    expect((await request(player, "enterSit", { seat: 1 })).status).toBe(200);
    await voice(host, "ensureConnected"); await voice(player, "ensureConnected");
    expect((await diagnostic(host)).provider).toBe("local-webrtc");
    expect((await diagnostic(host)).micCalls).toBe(0);
    expect((await diagnostic(player)).micCalls).toBe(0);
    for (const page of [host, player]) {
      await voice(page, "setAudioOptions", { autoGainControl: false, noiseSuppression: false, echoCancellation: false });
      await voice(page, "setSpeakingMode", "open-mic");
      await voice(page, "setMicrophoneMuted", false);
    }
    for (const page of [host, player]) {
      await expect.poll(async () => (await diagnostic(page)).level, { timeout: 15000 }).toBeGreaterThan(0.03).catch(async error => {
        console.log("Voice diagnostic", JSON.stringify({ host: await diagnostic(host), player: await diagnostic(player) })); throw error;
      });
      await expect.poll(async () => (await diagnostic(page)).packets).toBeGreaterThan(0);
      await expect(page.locator(".reference-seat .voice-speaking-ring")).toHaveCount(1);
      await expect(page.locator(".storyteller-profile__portrait .voice-speaking-ring")).toHaveCount(1);
    }
    const portraitRing = player.locator(".storyteller-profile__portrait .voice-speaking-ring");
    await expect(portraitRing).toHaveCSS("animation-name", /^voice-speaking-pulse/);
    await player.emulateMedia({ reducedMotion: "reduce" });
    await expect(portraitRing).toHaveCSS("animation-name", "none");
    await player.emulateMedia({ reducedMotion: "no-preference" });
    await host.screenshot({ path: info.outputPath("local-voice-connected.png") });
    await voice(host, "setSpeakingMode", "push-to-talk");
    await expect.poll(async () => (await diagnostic(player)).level).toBeLessThan(0.01);
    await expect(portraitRing).toHaveCount(0);
    await expect(host.locator(".storyteller-profile__portrait .voice-speaking-ring")).toHaveCount(0);
    await voice(host, "pttPress");
    await expect.poll(async () => (await diagnostic(player)).level).toBeGreaterThan(0.03);
    await expect(portraitRing).toHaveCount(1);
    await voice(host, "pttRelease");
    await expect.poll(async () => (await diagnostic(player)).level).toBeLessThan(0.01);
    await expect(portraitRing).toHaveCount(0);
    await voice(host, "setSpeakingMode", "open-mic");
    const oldConnection = (await diagnostic(host)).peers[0]!.self.id;
    await host.evaluate(async () => {
      const path = "/src/controllers/VoiceController.ts";
      (await import(/* @vite-ignore */ path)).useVoiceController().service.activeConnection.adapter.socket.io.engine.close();
    });
    await expect.poll(async () => (await diagnostic(host)).peers[0]?.self?.id, { timeout: 15000 }).not.toBe(oldConnection);
    await expect.poll(async () => (await diagnostic(player)).level, { timeout: 15000 }).toBeGreaterThan(0.03);
    await voice(host, "setMicrophoneVolume", 50);
    await expect.poll(async () => (await diagnostic(player)).level).toBeLessThan(0.13);
    await voice(host, "setMicrophoneVolume", 100);
    await expect.poll(async () => (await diagnostic(player)).level).toBeGreaterThan(0.13);
    await voice(host, "joinPlace", "potion-shop");
    await expect.poll(async () => (await diagnostic(host)).roomId).toContain("place_potion-shop");
    await expect.poll(async () => (await diagnostic(player)).level).toBeLessThan(0.01);
    await voice(player, "joinPlace", "potion-shop");
    await expect.poll(async () => (await diagnostic(player)).roomId).toContain("place_potion-shop");
    await expect.poll(async () => (await diagnostic(player)).level, { timeout: 15000 }).toBeGreaterThan(0.03);
    await expect(player.locator(".voice-member-card .voice-speaking-ring")).toHaveCount(2);
    await player.screenshot({ path: info.outputPath("local-voice-conversation-speaking.png") });
    await voice(player, "joinPlace", "tower");
    await expect.poll(async () => (await diagnostic(player)).roomId).toContain("place_tower");
    await expect.poll(async () => (await diagnostic(player)).level).toBeLessThan(0.01);
    await voice(host, "setSpeakingChannel", "broadcast");
    await expect.poll(async () => (await diagnostic(player)).level, { timeout: 15000 }).toBeGreaterThan(0.03);
    await expect(portraitRing).toHaveCount(1);
    // Private conversations keep both users in place until consent.
    for (const page of [host, player]) await voice(page, "backToPublicRoom");
    await host.getByRole('button', { name: '语音', exact: true }).click();
    await host.locator('.request-chat').click();
    await host.locator('.reference-seat.occupied').click();
    await expect(player.locator('.voice-request--incoming')).toBeVisible();
    await expect(player.locator('[role="dialog"]')).toHaveCount(0);
    expect((await diagnostic(host)).roomId).toContain('_townsquare');
    expect((await diagnostic(player)).roomId).toContain('_townsquare');
    await player.getByRole('button', { name: /^拒绝 .* 的私聊请求$/ }).click();
    await expect(host.getByLabel('私聊邀请状态')).toContainText('已拒绝');
    expect((await diagnostic(host)).roomId).toContain('_townsquare');
    await host.locator('.request-chat').click();
    await host.locator('.reference-seat.occupied').click();
    await expect(player.locator('.voice-request--incoming')).toBeVisible();
    await host.getByRole('button', { name: /^取消向 .* 的私聊请求$/ }).click();
    await expect(player.locator('.voice-request--incoming')).toHaveCount(0);
    for (const page of [host, player]) expect((await diagnostic(page)).roomId).toContain('_townsquare');
    // The other direction uses the storyteller portrait, as in the reference video.
    await player.locator('.request-chat').click();
    await player.locator('.storyteller-profile__portrait').click();
    await expect(host.locator('.voice-request--incoming')).toBeVisible();
    for (const page of [host, player]) await expect(page.locator('.request-chat')).toBeInViewport();
    await player.screenshot({ path: info.outputPath('voice-outgoing-request.png') });
    await host.screenshot({ path: info.outputPath('voice-incoming-request.png') });
    await host.getByRole('button', { name: /^同意 .* 的私聊请求$/ }).click();
    await expect.poll(async () => (await diagnostic(player)).roomId).toMatch(/_p\d{4}$/);
    await expect.poll(async () => (await diagnostic(host)).roomId).toBe((await diagnostic(player)).roomId);
    const portrait = player.locator('.voice-member-portrait').first();
    await portrait.click();
    await expect(player.locator('.voice-member-card.is-expanded')).toHaveCount(1);
    await expect(player.locator('[role="dialog"]')).toHaveCount(0);
    const badge = player.locator('.voice-member-role:not(:disabled)').first();
    await badge.click();
    await expect(player.getByLabel('搜索角色')).toBeVisible();
    await player.getByLabel('搜索角色').fill('厨师');
    await player.locator('.role-option').filter({ hasText: '厨师' }).click();
    await expect(badge).toHaveAttribute('aria-label', /厨师/);
    await expect(badge.locator('.token')).not.toHaveClass(/is-revealing/);
    await expect(player.locator('.voice-conversation')).toBeVisible();
    await player.screenshot({ path: info.outputPath('voice-consented-grimoire.png') });
    await player.getByRole('button', { name: '收起卡片，操作魔典', exact: true }).click();
    await expect(player.locator('.voice-conversation')).toHaveClass(/is-collapsed/);
    for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await player.setViewportSize(size);
      await expect(player.getByRole('button', { name: '放大语音卡片', exact: true })).toBeInViewport();
    }
    await player.setViewportSize({ width: 1440, height: 900 });
    await voice(player, 'backToPublicRoom');
    await expect(player.locator('.voice-conversation')).toHaveCount(0);
    for (const page of [host, player]) {
      await voice(page, "disconnect");
      expect((await diagnostic(page)).liveTracks).toBe(0);
      await expect(page.locator(".voice-speaking-ring")).toHaveCount(0);
    }
    expect(errors).toEqual([]);
    console.log(`Local voice verified in room ${roomId}: bidirectional PCM, PTT, reconnect, input gain, place isolation, broadcast and capture cleanup.`);
  } finally { await browser.close(); unlinkSync(wav); }
});

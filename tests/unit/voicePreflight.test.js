// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";
import { checkVoicePreflight } from "@/services/voice/preflight";

function installVoiceApis({ permission = "prompt", devices = [{ kind: "audioinput" }] } = {}) {
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(window, "RTCPeerConnection", { configurable: true, value: class {} });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(),
      enumerateDevices: vi.fn().mockResolvedValue(devices),
    },
  });
  Object.defineProperty(navigator, "permissions", {
    configurable: true,
    value: { query: vi.fn().mockResolvedValue({ state: permission }) },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("voice preflight", () => {
  test("listening does not require microphone access and rejects non-WebSocket URLs", async () => {
    installVoiceApis({ permission: 'denied', devices: [] });
    await expect(checkVoicePreflight('wss://voice.test', { requireMicrophone: false })).resolves.toMatchObject({ ok: true });
    expect(navigator.permissions.query).not.toHaveBeenCalled();
    await expect(checkVoicePreflight('https://voice.test', { requireMicrophone: false })).resolves.toMatchObject({ ok: false, code: 'ERR_VOICE_ENDPOINT_REQUIRED' });
  });
  test("requires a secure page outside local development", async () => {
    vi.stubGlobal("location", { hostname: "game.example.test", protocol: "http:" });
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
    Object.defineProperty(window, "RTCPeerConnection", { configurable: true, value: class {} });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(), enumerateDevices: vi.fn() },
    });

    const result = await checkVoicePreflight("wss://voice.example.test");
    expect(result.code).toBe("ERR_VOICE_HTTPS_REQUIRED");
    expect(result.ok).toBe(false);
  });

  test("accepts a promptable microphone with a secure LiveKit endpoint", async () => {
    installVoiceApis();
    const result = await checkVoicePreflight("wss://voice.example.test");
    expect(result).toEqual({ ok: true, code: "OK", message: "语音前置检查通过。" });
  });

  test("rejects denied permission and insecure endpoint", async () => {
    installVoiceApis({ permission: "denied" });
    await expect(checkVoicePreflight("wss://voice.example.test")).resolves.toMatchObject({
      ok: false,
      code: "ERR_VOICE_PERMISSION_DENIED",
    });
    vi.stubGlobal("location", { hostname: "game.example.test", protocol: "https:" });
    installVoiceApis();
    await expect(checkVoicePreflight("ws://voice.example.test")).resolves.toMatchObject({
      ok: false,
      code: "ERR_VOICE_ENDPOINT_INSECURE",
    });
  });
});

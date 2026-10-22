// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { VoiceService } from "@/services/voice/VoiceService";
import { VoiceConnection } from "@/services/voice/VoiceConnection";
import { InputGainProcessor } from "@/services/voice/plugins/InputGainProcessor";
import type { IVoiceAdapter, AdapterEventMap } from "@/services/voice/adapters/IVoiceAdapter";

function adapter() {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  return {
    adapterType: "test", roomId: null,
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => { handlers.get("connection:changed")?.("idle"); }),
    setMicEnabled: vi.fn(async () => {}), setSpeakerEnabled: vi.fn(),
    setRemoteParticipantMuted: vi.fn(), setRemoteParticipantVolume: vi.fn(),
    setAudioInputDevice: vi.fn(async () => {}), setAudioPlugins: vi.fn(async () => {}),
    configureAudio: vi.fn(async () => {}),
    getParticipants: vi.fn(() => []),
    on: (event: string, handler: (...args: unknown[]) => void) => { handlers.set(event, handler); },
    off: vi.fn(),
    emit: (event: keyof AdapterEventMap, ...args: unknown[]) => handlers.get(event)?.(...args),
  };
}
const audio = { deviceId: "mic-2", volume: 150, autoGainControl: false, noiseSuppression: true, echoCancellation: false };
const connection = { liveKitEndpoint: "wss://voice.test", publicRoomId: "public", publicRoomToken: "public-token", broadcastRoomId: "broadcast", broadcastRoomToken: "broadcast-token", role: "dm" as const };
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("settings media preferences", () => {
  test('input gain survives LiveKit restarting a capture track without passing its audio context again', async () => {
    vi.stubGlobal('MediaStream', class { constructor(public tracks: unknown[]) {} });
    const outputTracks: { stop: ReturnType<typeof vi.fn> }[] = [];
    const context = {
      createMediaStreamSource: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
      createGain: vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() })),
      createMediaStreamDestination: vi.fn(() => {
        const track = { stop: vi.fn() }; outputTracks.push(track);
        return { stream: { getAudioTracks: () => [track] } };
      }),
    };
    const gain = new InputGainProcessor();
    gain.setVolume(150);
    await gain.init({ audioContext: context, track: {} } as never);
    await gain.restart({ track: {} } as never);
    expect(context.createMediaStreamSource).toHaveBeenCalledTimes(2);
    expect(context.createGain.mock.results[1].value.gain.value).toBe(1.5);
    expect(outputTracks[0].stop).toHaveBeenCalledOnce();
    await gain.destroy();
    expect(outputTracks[1].stop).toHaveBeenCalledOnce();
  });
  test('push-to-talk release wins over a slow microphone activation; broadcast closes private audio first', async () => {
    const adapters: ReturnType<typeof adapter>[] = [];
    const service = new VoiceService({ adapterFactory: { create: () => {
      const next = adapter(); adapters.push(next); return next as unknown as IVoiceAdapter;
    } } });
    await service.connect(connection);
    await service.setSpeakMode('ptt');
    await service.setMicMuted(false);
    let finish!: () => void;
    const blocked = new Promise<void>(resolve => { finish = resolve; });
    const started = new Promise<void>(resolve => {
      adapters[1].setMicEnabled.mockImplementationOnce(async () => { resolve(); await blocked; });
    });
    const press = service.pttPress();
    await started;
    const release = service.pttRelease();
    finish();
    await Promise.all([press, release]);
    expect(adapters[1].setMicEnabled).toHaveBeenLastCalledWith(false);
    await service.setSpeakMode('open');
    adapters.forEach(item => item.setMicEnabled.mockClear());
    await service.setActiveSpeakingRoom('broadcast');
    expect(adapters[1].setMicEnabled).toHaveBeenLastCalledWith(false);
    expect(adapters[0].setMicEnabled).toHaveBeenLastCalledWith(true);
    expect(adapters[1].setMicEnabled.mock.invocationCallOrder[0]).toBeLessThan(adapters[0].setMicEnabled.mock.invocationCallOrder[0]);
    await service.disconnect();
  });

  test('disconnect cancels a pending initial connection and never opens the second channel', async () => {
    const first = adapter(); const second = adapter();
    let finish!: () => void;
    first.connect.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    const service = new VoiceService({ adapterFactory: { create: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second) } });
    const pending = service.connect(connection);
    await service.disconnect();
    finish();
    await pending;
    expect(second.connect).not.toHaveBeenCalled();
    expect(service.getRoomState('active').status).toBe('idle');
    expect(first.disconnect).toHaveBeenCalled();
    expect(first.setMicEnabled).not.toHaveBeenCalledWith(true);
  });

  test('a late reconnect cannot reopen the mic after leaving, and reconnect restores per-user volume and mute', async () => {
    vi.useFakeTimers();
    const first = adapter(); const second = adapter(); const third = adapter();
    const voice = new VoiceConnection('active', { create: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second).mockReturnValueOnce(third) });
    await voice.connect({ serverUrl: 'wss://voice.test', roomId: 'public', token: 'token', listenOnly: true, plugins: [] });
    voice.setRemoteParticipantMuted('a', true);
    voice.setRemoteParticipantVolume('b', 0.4);
    first.emit('disconnected', 'networkError');
    await vi.advanceTimersByTimeAsync(1000);
    expect(second.setRemoteParticipantMuted).toHaveBeenCalledWith('a', true);
    expect(second.setRemoteParticipantVolume).toHaveBeenCalledWith('b', 0.4);
    let finish!: () => void;
    third.connect.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    await voice.setMicEnabled(true);
    second.emit('disconnected', 'networkError');
    await vi.advanceTimersByTimeAsync(1000);
    await voice.disconnect();
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(third.disconnect).toHaveBeenCalled();
    expect(third.setMicEnabled).not.toHaveBeenCalledWith(true);
  });

  test('removal from a private room never triggers automatic rejoining', async () => {
    vi.useFakeTimers();
    const first = adapter();
    const factory = { create: vi.fn(() => first as unknown as IVoiceAdapter) };
    const voice = new VoiceConnection('active', factory);
    await voice.connect({ serverUrl: 'wss://voice.test', roomId: 'private', token: 'token', listenOnly: true, plugins: [] });
    first.emit('disconnected', 'kicked');
    await vi.advanceTimersByTimeAsync(40000);
    expect(factory.create).toHaveBeenCalledOnce();
    await voice.disconnect();
  });

  test('releasing PTT during reconnect microphone restoration leaves the new adapter muted', async () => {
    vi.useFakeTimers();
    const first = adapter(); const second = adapter();
    const voice = new VoiceConnection('active', { create: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second) });
    await voice.connect({ serverUrl: 'wss://voice.test', roomId: 'public', token: 'token', listenOnly: true, plugins: [] });
    await voice.setMicEnabled(true);
    let finish!: () => void;
    second.setMicEnabled.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    first.emit('disconnected', 'networkError');
    await vi.advanceTimersByTimeAsync(1000);
    const release = voice.setMicEnabled(false);
    finish();
    await release;
    expect(second.setMicEnabled).toHaveBeenLastCalledWith(false);
    await voice.disconnect();
  });

  test('listen-only guests never request a microphone and losing a seat stops an open microphone', async () => {
    const adapters: ReturnType<typeof adapter>[] = [];
    const service = new VoiceService({ adapterFactory: { create: () => {
      const next = adapter(); adapters.push(next); return next as unknown as IVoiceAdapter;
    } } });
    await service.setMicMuted(true);
    await service.connect({ ...connection, role: 'guest' });
    await service.setSpeakMode('vad');
    await expect(service.setMicMuted(false)).rejects.toThrow('旁观者');
    expect(adapters.every(item => item.setMicEnabled.mock.calls.every(([enabled]) => !enabled))).toBe(true);
    await service.setRole('player');
    await service.setSpeakMode('open');
    await service.setMicMuted(false);
    expect(adapters[1].setMicEnabled).toHaveBeenLastCalledWith(true);
    await service.setRole('guest');
    expect(adapters[1].setMicEnabled).toHaveBeenLastCalledWith(false);
    expect(service.getState().isMicMuted).toBe(true);
    await service.pttPress();
    expect(adapters[1].setMicEnabled).toHaveBeenLastCalledWith(false);
    await service.disconnect();
  });
  test("keeps device processing and playback settings when switching rooms", async () => {
    const adapters: ReturnType<typeof adapter>[] = [];
    const service = new VoiceService({ adapterFactory: { create: () => {
      const next = adapter(); adapters.push(next); return next as unknown as IVoiceAdapter;
    } } });
    await service.connect(connection);
    await service.configureAudio(audio);
    service.setSpeakerMuted(true);
    await service.connectToPrivateRoom({ roomId: "private", token: "private-token" });
    expect(adapters[2].configureAudio).toHaveBeenCalledWith(audio);
    expect(adapters[2].setSpeakerEnabled).toHaveBeenLastCalledWith(false);
    expect(service.getRoomState("active").status).toBe("connected");
    await service.backToPublicRoom();
    expect(adapters[3].configureAudio).toHaveBeenCalledWith(audio);
    expect(service.getRoomState("active").status).toBe("connected");
    await service.disconnect();
  });

  test("restores microphone mute and processing after reconnect and ignores obsolete adapter events", async () => {
    vi.useFakeTimers();
    const first = adapter(); const second = adapter();
    const factory = { create: vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second) };
    const voice = new VoiceConnection("active", factory);
    const statuses: string[] = [];
    voice.on("connection:changed", status => statuses.push(status));
    await voice.connect({ serverUrl: "wss://voice.test", roomId: "public", token: "token", listenOnly: false, plugins: [] });
    await voice.configureAudio(audio);
    await voice.setMicEnabled(false);
    voice.setSpeakerEnabled(false);
    first.emit("disconnected", "networkError");
    await vi.advanceTimersByTimeAsync(1000);
    expect(second.configureAudio).toHaveBeenCalledWith(audio);
    expect(second.setMicEnabled).toHaveBeenLastCalledWith(false);
    expect(second.setSpeakerEnabled).toHaveBeenLastCalledWith(false);
    first.emit("connection:changed", "failed");
    expect(statuses.at(-1)).toBe("connected");
    await voice.disconnect();
  });
});

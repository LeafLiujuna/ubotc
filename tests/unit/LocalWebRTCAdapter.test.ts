import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { LocalWebRTCAdapter } from "@/services/voice/adapters/LocalWebRTCAdapter";

const { sockets, pcs } = vi.hoisted(() => ({ sockets: [] as any[], pcs: [] as any[] }));
vi.mock("socket.io-client", async () => {
  const { EventEmitter } = await import("eventemitter3");
  return { io: vi.fn(() => {
    const socket = Object.assign(new EventEmitter(), {
      canPublish: true,
      connect() { queueMicrotask(() => socket.emit("welcome", { self: { id: "self-id", userId: "self", muted: true }, peers: [], canPublish: socket.canPublish })); },
      disconnect: vi.fn(),
    });
    sockets.push(socket); return socket;
  }) };
});
const track = () => ({ enabled: true, kind: "audio", readyState: "live", stop: vi.fn() });
class Stream {
  constructor(private tracks: any[]) {}
  getTracks() { return this.tracks; }
  getAudioTracks() { return this.tracks; }
}
const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 }, fftSize: 512,
  getByteTimeDomainData: (values: Uint8Array) => values.fill(128) });
class Context {
  state = "running";
  destination = node();
  resume = vi.fn(async () => {});
  close = vi.fn(async () => { this.state = "closed"; });
  createGain = node;
  createAnalyser = node;
  createMediaStreamSource = node;
  createMediaStreamDestination = () => ({ ...node(), stream: new Stream([track()]) });
}
class PeerConnection {
  remoteDescription: unknown = null;
  localDescription: unknown = null;
  transceivers: any[] = [];
  addTransceiver = vi.fn(() => {
    const result = { direction: "sendrecv", sender: { replaceTrack: vi.fn(async () => {}) } };
    this.transceivers.push(result); return result;
  });
  getTransceivers = () => this.transceivers;
  setRemoteDescription = vi.fn(async (description: any) => {
    this.remoteDescription = description;
    if (description.type === "offer" && !this.transceivers.length) this.transceivers.push({ direction: "recvonly", sender: { replaceTrack: vi.fn(async () => {}) } });
  });
  setLocalDescription = vi.fn(async (description: any) => { this.localDescription = { toJSON: () => description }; });
  createAnswer = vi.fn(async () => ({ type: "answer", sdp: "answer" }));
  createOffer = vi.fn(async () => ({ type: "offer", sdp: "offer" }));
  addIceCandidate = vi.fn(async () => {});
  close = vi.fn();
  constructor() { pcs.push(this); }
}
let capture: ReturnType<typeof vi.fn>;
let adapter: LocalWebRTCAdapter;
beforeEach(() => {
  sockets.length = 0; pcs.length = 0;
  vi.stubGlobal("MediaStream", Stream);
  vi.stubGlobal("AudioContext", Context);
  vi.stubGlobal("RTCPeerConnection", PeerConnection);
  capture = vi.fn(async () => new Stream([track()]));
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: capture } });
  adapter = new LocalWebRTCAdapter();
});
afterEach(async () => { await adapter.disconnect(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const connect = () => adapter.connect("ws://127.0.0.1:8086/local-voice", { roomId: "square", token: "token", listenOnly: true });

test("listening never captures the microphone; PTT reuses capture and disconnect releases it", async () => {
  await connect(); expect(capture).not.toHaveBeenCalled();
  await adapter.setMicEnabled(true);
  const input = (adapter as any).input.getAudioTracks()[0];
  const output = (adapter as any).output.getAudioTracks()[0];
  expect(input.enabled).toBe(true); expect(output.enabled).toBe(true);
  await adapter.setMicEnabled(false);
  expect(input.enabled).toBe(false); expect(output.enabled).toBe(false);
  await adapter.setMicEnabled(true); expect(capture).toHaveBeenCalledTimes(1);
  await adapter.disconnect(); expect(input.stop).toHaveBeenCalled(); expect(output.stop).toHaveBeenCalled();
});

test("capture completed after leaving is stopped without reopening media", async () => {
  await connect();
  let resolve!: (stream: Stream) => void;
  capture.mockImplementationOnce(() => new Promise<Stream>(done => { resolve = done; }));
  const pending = adapter.setMicEnabled(true);
  await vi.waitFor(() => expect(capture).toHaveBeenCalled());
  await adapter.disconnect();
  const input = track(); resolve(new Stream([input])); await pending;
  expect(input.stop).toHaveBeenCalled(); expect((adapter as any).context).toBeNull();
});

test("a receive-only credential cannot enable capture", async () => {
  const pending = connect(); await Promise.resolve(); sockets[0].canPublish = false;
  await pending;
  await expect(adapter.setMicEnabled(true)).rejects.toThrow("旁观者");
  expect(capture).not.toHaveBeenCalled();
});

test("answering reuses the offered audio transceiver, so a late microphone can send both ways", async () => {
  await connect();
  sockets[0].emit("peerJoined", { id: "other", userId: "other", muted: true });
  expect(pcs[0].addTransceiver).not.toHaveBeenCalled();
  sockets[0].emit("signal", { from: "other", description: { type: "offer", sdp: "offer" } });
  await vi.waitFor(() => expect(pcs[0].createAnswer).toHaveBeenCalled());
  expect(pcs[0].transceivers).toHaveLength(1);
  expect(pcs[0].transceivers[0].direction).toBe("sendrecv");
  await adapter.setMicEnabled(true);
  expect(pcs[0].transceivers[0].sender.replaceTrack).toHaveBeenCalled();
});

test("server revocation closes peers and reports a terminal disconnect reason", async () => {
  await connect();
  const disconnected = vi.fn(); adapter.on("disconnected", disconnected);
  sockets[0].emit("peerJoined", { id: "other", userId: "other", muted: true });
  sockets[0].emit("closed", { reason: "kicked" }); sockets[0].emit("disconnect");
  await vi.waitFor(() => expect(disconnected).toHaveBeenCalledWith("kicked"));
  expect(pcs[0].close).toHaveBeenCalled();
  expect(adapter.getParticipants()).toEqual([]);
});

test("remote audio starts the Chromium decoder and removes its media element on leave", async () => {
  await connect();
  sockets[0].emit("peerJoined", { id: "other", userId: "other", muted: false });
  pcs[0].ontrack({ track: track() });
  expect(document.querySelectorAll("audio[data-ts-voice-audio]")).toHaveLength(1);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  adapter.setRemoteParticipantVolume("other", 2);
  expect((adapter as any).peers.get("other").gain.gain.value).toBe(2);
  adapter.setSpeakerEnabled(false);
  expect((adapter as any).peers.get("other").gain.gain.value).toBe(0);
  await adapter.disconnect();
  expect(document.querySelectorAll("audio[data-ts-voice-audio]")).toHaveLength(0);
});

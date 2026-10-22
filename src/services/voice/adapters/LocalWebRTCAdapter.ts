import { io, type Socket } from "socket.io-client";
import type { AdapterConnectOptions, AdapterEventMap, IVoiceAdapter } from "./IVoiceAdapter";
import type { AudioInputSettings } from "../mediaSettings";
import type { IAudioPlugin } from "../plugins/IAudioPlugin";
import type { DisconnectReason, ParticipantInfo } from "../types";

type PeerInfo = { id: string; userId: string; muted: boolean };
type Peer = PeerInfo & {
  pc: RTCPeerConnection;
  sender: RTCRtpSender | null;
  pending: RTCIceCandidateInit[];
  serial: Promise<void>;
  source?: MediaStreamAudioSourceNode;
  gain?: GainNode;
  analyser?: AnalyserNode;
  audio?: HTMLAudioElement;
  speaking: boolean;
};
type Signal = { from: string; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
type Handlers = { [K in keyof AdapterEventMap]: Set<(...args: AdapterEventMap[K]) => void> };

/** Small local rooms use host ICE candidates and audio-only browser mesh links. */
export class LocalWebRTCAdapter implements IVoiceAdapter {
  readonly adapterType = "local-webrtc";
  roomId: string | null = null;
  private socket: Socket | null = null;
  private self: PeerInfo | null = null;
  private canPublish = false;
  private peers = new Map<string, Peer>();
  private context: AudioContext | null = null;
  private input: MediaStream | null = null;
  private output: MediaStream | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private inputGain: GainNode | null = null;
  private inputAnalyser: AnalyserNode | null = null;
  private pluginTrack: MediaStreamTrack | null = null;
  private plugins: IAudioPlugin[] = [];
  private micEnabled = false;
  private localSpeaking = false;
  private speakerEnabled = true;
  private remoteMuted = new Map<string, boolean>();
  private remoteVolumes = new Map<string, number>();
  private settings: AudioInputSettings = {
    deviceId: "", volume: 100, autoGainControl: true, noiseSuppression: true, echoCancellation: true,
  };
  private generation = 0;
  private micUpdate: Promise<void> = Promise.resolve();
  private gesture: AbortController | null = null;
  private activityTimer: ReturnType<typeof setInterval> | null = null;
  private cancelConnect: (() => void) | null = null;
  private handlers: Handlers = {
    "participants:changed": new Set(), "speaking:changed": new Set(),
    "connection:changed": new Set(), disconnected: new Set(),
  };

  async connect(serverUrl: string, options: AdapterConnectOptions): Promise<void> {
    await this.disconnect();
    const generation = this.generation;
    this.roomId = options.roomId;
    this.plugins = options.audioPlugins ?? [];
    const socket = io(serverUrl.replace(/^ws/, "http"), {
      auth: { token: options.token }, autoConnect: false, reconnection: false,
      transports: ["websocket"], forceNew: true,
    });
    this.socket = socket;
    this.emit("connection:changed", "connecting");
    let closedReason: DisconnectReason = "networkError";
    socket.on("closed", ({ reason }: { reason: DisconnectReason }) => { closedReason = reason; });
    socket.on("peerJoined", (info: PeerInfo) => {
      if (generation === this.generation) this.addPeer(info, false);
    });
    socket.on("peerLeft", ({ id }: { id: string }) => this.removePeer(id));
    socket.on("peerState", (info: PeerInfo) => {
      const peer = this.peers.get(info.id);
      if (peer) peer.muted = info.muted;
      this.emit("participants:changed", this.getParticipants());
    });
    socket.on("signal", (signal: Signal) => {
      const peer = this.peers.get(signal.from);
      if (!peer || generation !== this.generation) return;
      peer.serial = peer.serial.then(async () => {
        if (signal.description) {
          await peer.pc.setRemoteDescription(signal.description);
          for (const candidate of peer.pending.splice(0)) await peer.pc.addIceCandidate(candidate);
          if (signal.description.type === "offer") {
            // Reuse the transceiver created by the remote offer. Pre-adding one
            // on the answering side would leave our sender outside the SDP.
            const transceiver = peer.pc.getTransceivers()[0];
            if (!transceiver) throw new Error("Missing audio transceiver");
            transceiver.direction = this.canPublish ? "sendrecv" : "recvonly";
            peer.sender = transceiver.sender;
            const track = this.output?.getAudioTracks()[0];
            if (track && this.canPublish) await peer.sender.replaceTrack(track);
            await peer.pc.setLocalDescription(await peer.pc.createAnswer());
            socket.emit("signal", { target: peer.id, description: peer.pc.localDescription?.toJSON() });
          }
        } else if (signal.candidate) {
          if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(signal.candidate);
          else peer.pending.push(signal.candidate);
        }
      }).catch(() => {
        if (this.peers.get(peer.id) === peer) this.emit("connection:changed", "failed");
      });
    });
    socket.on("disconnect", () => {
      if (this.socket !== socket) return;
      void this.disconnect().then(() => {
        this.emit("connection:changed", "failed");
        this.emit("disconnected", closedReason);
      });
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error("本机语音连接超时。")), 10000);
        const onError = (error: Error) => finish(error);
        const finish = (error?: Error) => {
          clearTimeout(timer);
          socket.off("connect_error", onError);
          this.cancelConnect = null;
          if (error) reject(error); else resolve();
        };
        this.cancelConnect = () => finish(new Error("语音连接已取消。"));
        socket.once("connect_error", onError);
        socket.once("welcome", (welcome: { self: PeerInfo; peers: PeerInfo[]; canPublish: boolean }) => {
          if (generation !== this.generation) return finish(new Error("语音连接已取消。"));
          this.self = welcome.self;
          this.canPublish = welcome.canPublish;
          for (const peer of welcome.peers) this.addPeer(peer, true);
          finish();
        });
        socket.connect();
      });
      if (generation !== this.generation) return;
      this.gesture = new AbortController();
      const resume = () => {
        void this.context?.resume().catch(() => {});
        for (const peer of this.peers.values()) void peer.audio?.play().catch(() => {});
      };
      document.addEventListener("pointerdown", resume, { signal: this.gesture.signal });
      document.addEventListener("keydown", resume, { signal: this.gesture.signal });
      this.activityTimer = setInterval(() => this.measureActivity(), 100);
      this.emit("participants:changed", this.getParticipants());
      this.emit("connection:changed", "connected");
      if (!options.listenOnly) await this.setMicEnabled(true);
    } catch (error) {
      if (generation === this.generation) await this.disconnect();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.generation++;
    this.cancelConnect?.(); this.cancelConnect = null;
    const socket = this.socket; this.socket = null;
    socket?.removeAllListeners(); socket?.disconnect();
    this.gesture?.abort(); this.gesture = null;
    if (this.activityTimer) clearInterval(this.activityTimer);
    this.activityTimer = null;
    for (const id of this.peers.keys()) this.removePeer(id);
    this.micEnabled = false;
    this.input?.getTracks().forEach(track => track.stop()); this.input = null;
    this.clearInputGraph();
    const context = this.context; this.context = null;
    if (context && context.state !== "closed") await context.close();
    for (const plugin of this.plugins) plugin.dispose();
    this.plugins = [];
    this.self = null; this.roomId = null; this.canPublish = false; this.localSpeaking = false;
    this.emit("participants:changed", []);
    this.emit("connection:changed", "idle");
  }

  async setMicEnabled(enabled: boolean): Promise<void> {
    const generation = this.generation;
    this.micUpdate = this.micUpdate.catch(() => {}).then(async () => {
      if (generation !== this.generation || !this.socket || !this.self) return;
      if (enabled && !this.canPublish) throw new Error("旁观者只能收听，不能开麦。");
      if (enabled && !this.input) await this.capture(generation);
      if (generation !== this.generation) return;
      this.micEnabled = enabled;
      if (this.input) for (const track of this.input.getAudioTracks()) track.enabled = enabled;
      if (this.output) for (const track of this.output.getAudioTracks()) track.enabled = enabled;
      this.self.muted = !enabled;
      this.socket?.emit("mute", !enabled);
      this.emit("participants:changed", this.getParticipants());
    });
    await this.micUpdate;
  }

  setSpeakerEnabled(enabled: boolean): void {
    this.speakerEnabled = enabled;
    for (const peer of this.peers.values()) this.applyVolume(peer);
    if (enabled) void this.context?.resume().catch(() => {});
  }
  setRemoteParticipantMuted(userId: string, muted: boolean): void {
    this.remoteMuted.set(userId, muted);
    for (const peer of this.peers.values()) if (peer.userId === userId) this.applyVolume(peer);
  }
  setRemoteParticipantVolume(userId: string, volume: number): void {
    this.remoteVolumes.set(userId, Math.max(0, Math.min(2, volume)));
    for (const peer of this.peers.values()) if (peer.userId === userId) this.applyVolume(peer);
  }
  async setAudioInputDevice(deviceId: string): Promise<void> {
    await this.configureAudio({ ...this.settings, deviceId });
  }
  async setAudioPlugins(plugins: IAudioPlugin[]): Promise<void> {
    for (const plugin of this.plugins) if (!plugins.includes(plugin)) plugin.dispose();
    this.plugins = plugins;
    if (this.input) await this.buildInputGraph(this.generation);
  }
  async configureAudio(settings: AudioInputSettings): Promise<void> {
    const previous = this.settings;
    this.settings = { ...settings };
    if (this.inputGain) this.inputGain.gain.value = Math.max(0, Math.min(2, settings.volume / 100));
    if (this.input && ["deviceId", "autoGainControl", "noiseSuppression", "echoCancellation"].some(key =>
      previous[key as keyof AudioInputSettings] !== settings[key as keyof AudioInputSettings])) {
      await this.capture(this.generation);
    }
  }
  getParticipants(): ParticipantInfo[] {
    const participants: ParticipantInfo[] = this.self ? [{
      userId: this.self.userId, isLocal: true, isMicMuted: !this.micEnabled, isSpeaking: this.localSpeaking,
    }] : [];
    for (const peer of this.peers.values()) participants.push({
      userId: peer.userId, isLocal: false, isMicMuted: peer.muted, isSpeaking: peer.speaking,
    });
    return participants;
  }
  on<K extends keyof AdapterEventMap>(event: K, handler: (...args: AdapterEventMap[K]) => void): void {
    this.handlers[event].add(handler);
  }
  off<K extends keyof AdapterEventMap>(event: K, handler: (...args: AdapterEventMap[K]) => void): void {
    this.handlers[event].delete(handler);
  }
  private emit<K extends keyof AdapterEventMap>(event: K, ...args: AdapterEventMap[K]): void {
    for (const handler of this.handlers[event]) handler(...args);
  }

  private audioContext(): AudioContext {
    if (!this.context) this.context = new AudioContext();
    void this.context.resume().catch(() => {});
    return this.context;
  }
  private addPeer(info: PeerInfo, offer: boolean): void {
    if (!this.self || info.userId === this.self.userId || this.peers.has(info.id)) return;
    const pc = new RTCPeerConnection({ iceServers: [] });
    const transceiver = offer ? pc.addTransceiver("audio", { direction: this.canPublish ? "sendrecv" : "recvonly" }) : null;
    const peer: Peer = { ...info, pc, sender: transceiver?.sender ?? null, pending: [], serial: Promise.resolve(), speaking: false };
    this.peers.set(info.id, peer);
    pc.onicecandidate = event => {
      if (event.candidate) this.socket?.emit("signal", { target: peer.id, candidate: event.candidate.toJSON() });
    };
    pc.ontrack = event => {
      if (this.peers.get(peer.id) !== peer) return;
      peer.source?.disconnect(); peer.gain?.disconnect(); peer.analyser?.disconnect();
      peer.audio?.pause(); peer.audio?.remove();
      const context = this.audioContext();
      const stream = new MediaStream([event.track]);
      // Chromium starts remote WebRTC audio decoding through a media element,
      // even when the audible output is mixed through Web Audio for gain control.
      peer.audio = document.createElement("audio");
      peer.audio.autoplay = true; peer.audio.muted = true;
      peer.audio.dataset.tsVoiceAudio = "true"; peer.audio.srcObject = stream;
      document.body.appendChild(peer.audio);
      void peer.audio.play().catch(() => {});
      peer.source = context.createMediaStreamSource(stream);
      peer.gain = context.createGain();
      peer.analyser = context.createAnalyser(); peer.analyser.fftSize = 512;
      peer.source.connect(peer.analyser);
      peer.source.connect(peer.gain); peer.gain.connect(context.destination);
      this.applyVolume(peer);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" && this.peers.get(peer.id) === peer) {
        this.emit("connection:changed", "failed");
      }
    };
    peer.serial = peer.serial.then(async () => {
      const track = this.output?.getAudioTracks()[0];
      if (track && this.canPublish) await peer.sender?.replaceTrack(track);
      if (offer) {
        await pc.setLocalDescription(await pc.createOffer());
        this.socket?.emit("signal", { target: peer.id, description: pc.localDescription?.toJSON() });
      }
    }).catch(() => { if (this.peers.get(peer.id) === peer) this.emit("connection:changed", "failed"); });
    this.emit("participants:changed", this.getParticipants());
  }
  private removePeer(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    peer.pc.onicecandidate = null; peer.pc.ontrack = null; peer.pc.onconnectionstatechange = null;
    peer.pc.close(); peer.source?.disconnect(); peer.gain?.disconnect(); peer.analyser?.disconnect();
    if (peer.audio) { peer.audio.pause(); peer.audio.srcObject = null; peer.audio.remove(); }
    if (peer.speaking) this.emit("speaking:changed", peer.userId, false);
    this.emit("participants:changed", this.getParticipants());
  }
  private applyVolume(peer: Peer): void {
    if (peer.gain) peer.gain.gain.value = this.speakerEnabled && !this.remoteMuted.get(peer.userId)
      ? this.remoteVolumes.get(peer.userId) ?? 1 : 0;
  }
  private async capture(generation: number): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: {
      deviceId: this.settings.deviceId ? { exact: this.settings.deviceId } : undefined,
      autoGainControl: this.settings.autoGainControl, noiseSuppression: this.settings.noiseSuppression,
      echoCancellation: this.settings.echoCancellation,
    } });
    if (generation !== this.generation) { stream.getTracks().forEach(track => track.stop()); return; }
    const oldInput = this.input;
    this.input = stream;
    try { await this.buildInputGraph(generation); }
    finally { oldInput?.getTracks().forEach(track => track.stop()); }
    for (const track of stream.getAudioTracks()) track.enabled = this.micEnabled;
  }
  private clearInputGraph(): void {
    this.inputSource?.disconnect(); this.inputSource = null;
    this.inputGain?.disconnect(); this.inputGain = null;
    this.inputAnalyser?.disconnect(); this.inputAnalyser = null;
    this.output?.getTracks().forEach(track => track.stop()); this.output = null;
    if (this.pluginTrack && this.pluginTrack !== this.input?.getAudioTracks()[0]) this.pluginTrack.stop();
    this.pluginTrack = null;
  }
  private async buildInputGraph(generation: number): Promise<void> {
    let track = this.input?.getAudioTracks()[0];
    if (!track) return;
    for (const plugin of this.plugins) track = await plugin.process(track);
    if (generation !== this.generation) { track.stop(); return; }
    this.clearInputGraph();
    this.pluginTrack = track;
    const context = this.audioContext();
    this.inputSource = context.createMediaStreamSource(new MediaStream([track]));
    this.inputGain = context.createGain();
    this.inputGain.gain.value = Math.max(0, Math.min(2, this.settings.volume / 100));
    this.inputAnalyser = context.createAnalyser(); this.inputAnalyser.fftSize = 512;
    const destination = context.createMediaStreamDestination();
    this.inputSource.connect(this.inputGain); this.inputGain.connect(destination);
    this.inputGain.connect(this.inputAnalyser);
    this.output = destination.stream;
    const outputTrack = this.output.getAudioTracks()[0];
    outputTrack.enabled = this.micEnabled;
    await Promise.all([...this.peers.values()].map(peer => peer.sender?.replaceTrack(outputTrack)));
  }
  private measureActivity(): void {
    const active = (analyser?: AnalyserNode | null) => {
      if (!analyser || this.context?.state !== "running") return false;
      const values = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(values);
      return Math.sqrt(values.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / values.length) > 0.015;
    };
    const local = this.micEnabled && active(this.inputAnalyser);
    if (local !== this.localSpeaking && this.self) {
      this.localSpeaking = local; this.emit("speaking:changed", this.self.userId, local);
    }
    for (const peer of this.peers.values()) {
      const speaking = !peer.muted && active(peer.analyser);
      if (speaking !== peer.speaking) { peer.speaking = speaking; this.emit("speaking:changed", peer.userId, speaking); }
    }
  }
}

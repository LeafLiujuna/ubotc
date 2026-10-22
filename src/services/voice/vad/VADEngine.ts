type VADEvent = "speaking" | "silence";

type VADEventHandler = () => void;

export type VADEngineOptions = {
  threshold?: number;
  hangoverMs?: number;
};

export class VADEngine {
  private readonly threshold: number;
  private readonly hangoverMs: number;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private rafId: number | null = null;
  private lastSpeakingAt = 0;
  private speaking = false;
  private handlers: Record<VADEvent, Set<VADEventHandler>> = {
    speaking: new Set(),
    silence: new Set(),
  };

  constructor(options: VADEngineOptions = {}) {
    this.threshold = options.threshold ?? 0.04;
    this.hangoverMs = options.hangoverMs ?? 250;
  }

  on(event: VADEvent, handler: VADEventHandler): void {
    this.handlers[event].add(handler);
  }

  off(event: VADEvent, handler: VADEventHandler): void {
    this.handlers[event].delete(handler);
  }

  async attach(stream: MediaStream): Promise<void> {
    await this.detach();

    if (typeof window === "undefined" || typeof AudioContext === "undefined") {
      return;
    }

    this.audioContext = new AudioContext();
    this.source = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 512;
    this.source.connect(this.analyser);

    this.loop();
  }

  async detach(): Promise<void> {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }

    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    this.speaking = false;
    this.lastSpeakingAt = 0;
  }

  private emit(event: VADEvent): void {
    for (const handler of this.handlers[event]) {
      handler();
    }
  }

  private loop(): void {
    if (!this.analyser) {
      return;
    }

    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(data);

    let sum = 0;
    for (const value of data) {
      const normalized = (value - 128) / 128;
      sum += normalized * normalized;
    }

    const rms = Math.sqrt(sum / data.length);
    const now = Date.now();

    if (rms > this.threshold) {
      this.lastSpeakingAt = now;
      if (!this.speaking) {
        this.speaking = true;
        this.emit("speaking");
      }
    } else if (this.speaking && now - this.lastSpeakingAt > this.hangoverMs) {
      this.speaking = false;
      this.emit("silence");
    }

    this.rafId = requestAnimationFrame(() => this.loop());
  }
}

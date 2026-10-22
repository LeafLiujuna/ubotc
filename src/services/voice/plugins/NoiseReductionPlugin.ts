import type { IAudioPlugin } from "./IAudioPlugin";

export class NoiseReductionPlugin implements IAudioPlugin {
  public readonly id = "noise-reduction";
  public readonly name = "Noise Reduction (Placeholder)";

  private audioContext: AudioContext | null = null;

  async process(track: MediaStreamTrack): Promise<MediaStreamTrack> {
    if (typeof window === "undefined" || typeof AudioContext === "undefined") {
      return track;
    }

    this.dispose();
    this.audioContext = new AudioContext();

    const stream = new MediaStream([track]);
    const source = this.audioContext.createMediaStreamSource(stream);
    const compressor = this.audioContext.createDynamicsCompressor();
    compressor.threshold.value = -40;
    compressor.knee.value = 20;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.2;

    const destination = this.audioContext.createMediaStreamDestination();
    source.connect(compressor);
    compressor.connect(destination);

    const processed = destination.stream.getAudioTracks()[0];
    return processed ?? track;
  }

  dispose(): void {
    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }
  }
}

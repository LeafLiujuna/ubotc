import { Track, type AudioProcessorOptions, type TrackProcessor } from "livekit-client";

/** One processor per capture track, so broadcast and private audio never share nodes. */
export class InputGainProcessor implements TrackProcessor<Track.Kind.Audio, AudioProcessorOptions> {
  name = "microphone-gain";
  processedTrack?: MediaStreamTrack;
  private source?: MediaStreamAudioSourceNode;
  private gain?: GainNode;
  private output?: MediaStreamAudioDestinationNode;
  private volume = 1;
  private audioContext?: AudioContext;
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(2, volume / 100));
    if (this.gain) this.gain.gain.value = this.volume;
  }
  async init({ audioContext, track }: AudioProcessorOptions): Promise<void> {
    await this.destroy();
    this.audioContext = audioContext;
    this.source = audioContext.createMediaStreamSource(new MediaStream([track]));
    this.gain = audioContext.createGain();
    this.gain.gain.value = this.volume;
    this.output = audioContext.createMediaStreamDestination();
    this.source.connect(this.gain); this.gain.connect(this.output);
    this.processedTrack = this.output.stream.getAudioTracks()[0];
  }
  async restart(options: AudioProcessorOptions): Promise<void> {
    // LiveKit's LocalTrack restarts supply the new track but omit audioContext.
    await this.init({ ...options, audioContext: options.audioContext ?? this.audioContext! });
  }
  async destroy(): Promise<void> {
    this.source?.disconnect(); this.gain?.disconnect();
    this.processedTrack?.stop(); this.processedTrack = undefined;
    this.source = undefined; this.gain = undefined; this.output = undefined;
  }
}

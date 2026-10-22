export interface IAudioPlugin {
  readonly id: string;
  readonly name: string;
  process(track: MediaStreamTrack): Promise<MediaStreamTrack>;
  dispose(): void;
}

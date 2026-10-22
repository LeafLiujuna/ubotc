import {
  DisconnectReason as LKDisconnectReason,
  ParticipantEvent,
  Room,
  RoomEvent,
  Track,
  LocalAudioTrack,
} from "livekit-client";
import { InputGainProcessor } from "../plugins/InputGainProcessor";
import type { AudioInputSettings } from "../mediaSettings";
import type { IAudioPlugin } from "../plugins/IAudioPlugin";
import type {
  DisconnectReason,
  ParticipantInfo,
} from "../types";
import type { AdapterConnectOptions, AdapterEventMap, IVoiceAdapter } from "./IVoiceAdapter";

type HandlerMap = {
  [K in keyof AdapterEventMap]: Set<(...args: AdapterEventMap[K]) => void>;
};

export class LiveKitAdapter implements IVoiceAdapter {
  public readonly adapterType = "livekit";
  public roomId: string | null = null;

  private room: Room | null = null;
  private audioPlugins: IAudioPlugin[] = [];
  private speakerEnabled = true;
  private remoteParticipantMuted = new Map<string, boolean>();
  private remoteParticipantVolume = new Map<string, number>();
  private gainProcessor = new InputGainProcessor();
  private audioSettings: AudioInputSettings | null = null;
  private playbackGestures: AbortController | null = null;
  private boundParticipants = new WeakSet<object>();

  private handlers: HandlerMap = {
    "participants:changed": new Set(),
    "speaking:changed": new Set(),
    "connection:changed": new Set(),
    disconnected: new Set(),
  };

  async connect(serverUrl: string, options: AdapterConnectOptions): Promise<void> {
    await this.disconnect();

    this.roomId = options.roomId;
    this.audioPlugins = options.audioPlugins ?? [];

    const room = new Room({ webAudioMix: true });

    this.room = room;
    this.bindRoomEvents(room);

    this.emit("connection:changed", "connecting");
    await room.connect(serverUrl, options.token, { autoSubscribe: false });
    if (this.room !== room) { await room.disconnect(); return; }
    for (const participant of room.remoteParticipants.values()) {
      this.bindParticipantEvents(participant.identity, participant as unknown as Record<string, unknown>);
      for (const publication of participant.audioTrackPublications.values()) {
        publication.setSubscribed(true);
      }
    }

    this.resumePlaybackOnGesture(room);
    void room.startAudio().catch(() => {});

    if (options.listenOnly) {
      await room.localParticipant.setMicrophoneEnabled(false);
    } else {
      await room.localParticipant.setMicrophoneEnabled(true);
      await this.applyPlugins();
    }

    this.emit("participants:changed", this.collectParticipants());
    this.emit("connection:changed", "connected");
  }

  async disconnect(): Promise<void> {
    if (!this.room) {
      return;
    }

    const room = this.room;
    this.room = null;
    this.playbackGestures?.abort();
    this.playbackGestures = null;
    for (const participant of room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        publication.track?.detach().forEach(element => element.remove());
      }
    }
    this.remoteParticipantMuted.clear();
    this.remoteParticipantVolume.clear();
    await room.disconnect();
    await this.gainProcessor.destroy();
    this.audioSettings = null;
    this.roomId = null;
    this.emit("participants:changed", []);
    this.emit("connection:changed", "idle");
  }

  async setMicEnabled(enabled: boolean): Promise<void> {
    if (!this.room) {
      return;
    }
    const settings = this.audioSettings;
    await this.room.localParticipant.setMicrophoneEnabled(enabled, settings ? {
      deviceId: settings.deviceId || undefined,
      autoGainControl: settings.autoGainControl,
      noiseSuppression: settings.noiseSuppression,
      echoCancellation: settings.echoCancellation,
    } : undefined);
    if (enabled) {
      await this.applyPlugins();
      await this.applyInputGain();
    }
  }

  setSpeakerEnabled(enabled: boolean): void {
    this.speakerEnabled = enabled;
    if (!this.room) {
      return;
    }

    for (const participant of this.room.remoteParticipants.values()) {
      this.applyRemoteParticipantAudio(participant.identity, participant as unknown as Record<string, unknown>);
    }
  }

  setRemoteParticipantMuted(userId: string, muted: boolean): void {
    this.remoteParticipantMuted.set(userId, muted);
    this.applyRemoteParticipantAudioByUserId(userId);
  }

  setRemoteParticipantVolume(userId: string, volume: number): void {
    const clamped = Math.max(0, Math.min(2, volume));
    this.remoteParticipantVolume.set(userId, clamped);
    this.applyRemoteParticipantAudioByUserId(userId);
  }

  async setAudioInputDevice(deviceId: string): Promise<void> {
    if (!this.room) {
      return;
    }

    await this.room.switchActiveDevice("audioinput", deviceId);
    await this.applyPlugins();
  }

  async setAudioPlugins(plugins: IAudioPlugin[]): Promise<void> {
    this.audioPlugins = plugins;
    await this.applyPlugins();
  }

  getParticipants(): ParticipantInfo[] {
    return this.collectParticipants();
  }

  async configureAudio(settings: AudioInputSettings): Promise<void> {
    const previous = this.audioSettings;
    this.audioSettings = { ...settings };
    this.gainProcessor.setVolume(settings.volume);
    if (!this.room) return;
    if (previous && settings.deviceId !== previous.deviceId) await this.setAudioInputDevice(settings.deviceId || "default");
    const publication = this.room.localParticipant.getTrackPublication(Track.Source.Microphone);
    const track = publication?.track;
    if (track instanceof LocalAudioTrack) {
      if (!previous || ["autoGainControl", "noiseSuppression", "echoCancellation", "deviceId"].some(key => previous[key as keyof AudioInputSettings] !== settings[key as keyof AudioInputSettings])) {
        await track.restartTrack({ deviceId: settings.deviceId || undefined, autoGainControl: settings.autoGainControl, noiseSuppression: settings.noiseSuppression, echoCancellation: settings.echoCancellation });
      }
      await this.applyInputGain();
    }
  }

  private async applyInputGain(): Promise<void> {
    const track = this.room?.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
    if (!(track instanceof LocalAudioTrack)) return;
    this.gainProcessor.setVolume(this.audioSettings?.volume ?? 100);
    if (track.getProcessor() !== this.gainProcessor) await track.setProcessor(this.gainProcessor);
  }

  on<K extends keyof AdapterEventMap>(
    event: K,
    handler: (...args: AdapterEventMap[K]) => void,
  ): void {
    this.handlers[event].add(handler);
  }

  off<K extends keyof AdapterEventMap>(
    event: K,
    handler: (...args: AdapterEventMap[K]) => void,
  ): void {
    this.handlers[event].delete(handler);
  }

  private emit<K extends keyof AdapterEventMap>(
    event: K,
    ...args: AdapterEventMap[K]
  ): void {
    for (const handler of this.handlers[event]) {
      handler(...args);
    }
  }

  private bindRoomEvents(room: Room): void {
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      if (!room.canPlaybackAudio) this.resumePlaybackOnGesture(room);
    });
    room.on(RoomEvent.TrackPublished, publication => {
      if (publication.kind === Track.Kind.Audio) publication.setSubscribed(true);
    });
    room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
      if (track.kind === Track.Kind.Audio) {
        if (this.room !== room) return;
        const element = track.attach();
        element.dataset.tsVoiceAudio = "true";
        document.body.appendChild(element);
        this.applyRemoteParticipantAudio(participant.identity, participant as unknown as Record<string, unknown>);
      }
      this.emit("participants:changed", this.collectParticipants());
    });
    room.on(RoomEvent.TrackUnsubscribed, track => {
      track.detach().forEach(element => element.remove());
      this.emit("participants:changed", this.collectParticipants());
    });
    room.on(RoomEvent.TrackMuted, () => this.emit("participants:changed", this.collectParticipants()));
    room.on(RoomEvent.TrackUnmuted, () => this.emit("participants:changed", this.collectParticipants()));
    room.on(RoomEvent.LocalTrackPublished, () => this.emit("participants:changed", this.collectParticipants()));
    room.on(RoomEvent.LocalTrackUnpublished, () => this.emit("participants:changed", this.collectParticipants()));
    room.on(RoomEvent.ParticipantConnected, participant => {
      this.bindParticipantEvents(participant.identity, participant as unknown as Record<string, unknown>);
      this.applyRemoteParticipantAudio(participant.identity, participant as unknown as Record<string, unknown>);
      this.emit("participants:changed", this.collectParticipants());
    });

    room.on(RoomEvent.ParticipantDisconnected, () => {
      this.emit("participants:changed", this.collectParticipants());
    });

    room.on(RoomEvent.Reconnecting, () => {
      this.emit("connection:changed", "reconnecting");
    });

    room.on(RoomEvent.Reconnected, () => {
      this.emit("connection:changed", "connected");
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.audioTrackPublications.values()) {
          publication.setSubscribed(true);
        }
        this.applyRemoteParticipantAudio(participant.identity, participant as unknown as Record<string, unknown>);
      }
      this.emit("participants:changed", this.collectParticipants());
    });

    room.on(RoomEvent.Disconnected, reason => {
      if (this.room !== room) return;
      this.emit("connection:changed", "failed");
      this.emit("disconnected", this.mapDisconnectReason(reason));
    });

    this.bindParticipantEvents(
      room.localParticipant.identity,
      room.localParticipant as unknown as Record<string, unknown>,
      true,
    );
  }

  private bindParticipantEvents(
    userId: string,
    participant: Record<string, unknown>,
    isLocal = false,
  ): void {
    if (this.boundParticipants.has(participant)) return;
    this.boundParticipants.add(participant);
    const typedParticipant = participant as {
      identity?: string;
      on?: (event: ParticipantEvent, listener: (value: boolean) => void) => void;
      isSpeaking?: boolean;
    };

    typedParticipant.on?.(ParticipantEvent.IsSpeakingChanged, speaking => {
      this.emit("speaking:changed", typedParticipant.identity || userId, speaking);
      if (isLocal) {
        this.emit("participants:changed", this.collectParticipants());
      }
    });
  }

  private collectParticipants(): ParticipantInfo[] {
    if (!this.room) {
      return [];
    }

    const participants: ParticipantInfo[] = [];

    participants.push({
      userId: this.room.localParticipant.identity,
      isSpeaking: this.room.localParticipant.isSpeaking,
      isMicMuted: !this.room.localParticipant.isMicrophoneEnabled,
      isLocal: true,
    });

    for (const participant of this.room.remoteParticipants.values()) {
      const hasAudioTrack = Array.from(participant.audioTrackPublications.values()).some(
        publication => publication.track?.kind === Track.Kind.Audio && !publication.isMuted,
      );

      participants.push({
        userId: participant.identity,
        isSpeaking: participant.isSpeaking,
        isMicMuted: !hasAudioTrack,
        isLocal: false,
      });
    }

    return participants;
  }

  private async applyPlugins(): Promise<void> {
    if (!this.room) {
      return;
    }

    const publication = this.room.localParticipant.getTrackPublication(Track.Source.Microphone);
    const track = publication?.track;

    if (!track || track.kind !== Track.Kind.Audio) {
      return;
    }

    const localAudioTrack = track as unknown as {
      mediaStreamTrack?: MediaStreamTrack;
      replaceTrack?: (track: MediaStreamTrack) => Promise<unknown>;
    };

    let nextTrack = localAudioTrack.mediaStreamTrack;
    if (!nextTrack) {
      return;
    }

    for (const plugin of this.audioPlugins) {
      nextTrack = await plugin.process(nextTrack);
    }

    if (localAudioTrack.replaceTrack && nextTrack !== localAudioTrack.mediaStreamTrack) {
      await localAudioTrack.replaceTrack(nextTrack);
    }
  }

  private applyRemoteParticipantAudioByUserId(userId: string): void {
    if (!this.room) {
      return;
    }

    const participant = this.room.remoteParticipants.get(userId);
    if (!participant) {
      return;
    }

    this.applyRemoteParticipantAudio(userId, participant as unknown as Record<string, unknown>);
  }

  private applyRemoteParticipantAudio(userId: string, participant: Record<string, unknown>): void {
    const typedParticipant = participant as {
      audioTrackPublications?: Map<string, { track?: { setVolume?: (volume: number) => void } | null }>;
    };
    const participantMuted = this.remoteParticipantMuted.get(userId) ?? false;
    const participantVolume = this.remoteParticipantVolume.get(userId) ?? 1;
    const effectiveVolume = this.speakerEnabled && !participantMuted ? participantVolume : 0;

    for (const publication of typedParticipant.audioTrackPublications?.values() ?? []) {
      publication.track?.setVolume?.(effectiveVolume);
    }
  }

  private mapDisconnectReason(reason?: LKDisconnectReason): DisconnectReason {
    if (String(reason) === "TOKEN_EXPIRED") {
      return "tokenExpired";
    }

    switch (reason) {
      case LKDisconnectReason.DUPLICATE_IDENTITY:
      case LKDisconnectReason.JOIN_FAILURE:
      case LKDisconnectReason.CLIENT_INITIATED:
        return "unknown";
      case LKDisconnectReason.PARTICIPANT_REMOVED:
        return "kicked";
      case LKDisconnectReason.ROOM_DELETED:
        return "serverClosed";
      case LKDisconnectReason.STATE_MISMATCH:
      case LKDisconnectReason.SERVER_SHUTDOWN:
        return "networkError";
      case LKDisconnectReason.SIGNAL_CLOSE:
      case LKDisconnectReason.UNKNOWN_REASON:
        return "unknown";
      default:
        return "unknown";
    }
  }

  private resumePlaybackOnGesture(room: Room): void {
    if (this.room !== room || this.playbackGestures) return;
    const gestures = new AbortController();
    this.playbackGestures = gestures;
    const resume = () => {
      if (this.room !== room) return;
      // Invoke synchronously in the gesture handler for Safari/mobile autoplay rules.
      void room.startAudio().then(() => {
        if (room.canPlaybackAudio) {
          gestures.abort();
          if (this.playbackGestures === gestures) this.playbackGestures = null;
        }
      }).catch(() => {});
    };
    document.addEventListener("pointerdown", resume, { signal: gestures.signal });
    document.addEventListener("keydown", resume, { signal: gestures.signal });
  }
}

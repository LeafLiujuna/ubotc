import { beforeEach, expect, test, vi } from 'vitest';
import { EventEmitter } from 'eventemitter3';
import { LiveKitAdapter } from '@/services/voice/adapters/LiveKitAdapter';
import { ParticipantEvent, RoomEvent, Track } from 'livekit-client';

const { rooms } = vi.hoisted(() => ({ rooms: [] as any[] }));
vi.mock('livekit-client', async importOriginal => {
  const actual = await importOriginal<typeof import('livekit-client')>();
  const { EventEmitter } = await import('eventemitter3');
  class Room extends EventEmitter {
    remoteParticipants = new Map();
    canPlaybackAudio = false;
    localParticipant = Object.assign(new EventEmitter(), {
      identity: '', isSpeaking: false, isMicrophoneEnabled: false,
      setMicrophoneEnabled: vi.fn(async () => {}), getTrackPublication: vi.fn(),
    });
    connect = vi.fn(async () => { this.localParticipant.identity = 'self'; });
    disconnect = vi.fn(async () => {});
    startAudio = vi.fn(async () => { this.canPlaybackAudio = true; });
    constructor(public options: unknown) { super(); rooms.push(this); }
  }
  return { ...actual, Room };
});

beforeEach(() => { rooms.length = 0; });

test('subscribes to audio, reports actual mute state and cleans up audio elements and autoplay listeners', async () => {
  const adapter = new LiveKitAdapter();
  const pending = adapter.connect('wss://voice.test', { roomId: 'public', token: 'token', listenOnly: true });
  // connect() first awaits disconnect(), so allow the new Room to be created.
  await Promise.resolve();
  const room = rooms[0];
  const element = document.createElement('audio');
  const track = { kind: Track.Kind.Audio, attach: vi.fn(() => element), detach: vi.fn(() => [element]), setVolume: vi.fn() };
  const publication = { kind: Track.Kind.Audio, isMuted: true, track, setSubscribed: vi.fn() };
  const participant = Object.assign(new EventEmitter(), {
    identity: 'remote', isSpeaking: false,
    audioTrackPublications: new Map([['audio', publication]]),
    trackPublications: new Map([['audio', publication]]),
  });
  room.remoteParticipants.set('remote', participant);
  await pending;
  expect(room.options).toEqual({ webAudioMix: true });
  expect(publication.setSubscribed).toHaveBeenCalledWith(true);
  expect(room.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(false);
  expect(adapter.getParticipants().find(user => user.userId === 'remote')?.isMicMuted).toBe(true);
  room.emit(RoomEvent.TrackSubscribed, track, publication, participant);
  expect(document.body.contains(element)).toBe(true);
  adapter.setRemoteParticipantVolume('remote', 1.5);
  expect(track.setVolume).toHaveBeenLastCalledWith(1.5);
  adapter.setRemoteParticipantMuted('remote', true);
  expect(track.setVolume).toHaveBeenLastCalledWith(0);
  publication.isMuted = false;
  expect(adapter.getParticipants().find(user => user.userId === 'remote')?.isMicMuted).toBe(false);
  await adapter.disconnect();
  expect(document.body.contains(element)).toBe(false);
  const starts = room.startAudio.mock.calls.length;
  document.dispatchEvent(new Event('pointerdown'));
  expect(room.startAudio).toHaveBeenCalledTimes(starts);
});

test('local speaking uses the identity assigned at connect time and existing remote participants emit activity', async () => {
  const adapter = new LiveKitAdapter();
  const speaking = vi.fn(); adapter.on('speaking:changed', speaking);
  await adapter.connect('wss://voice.test', { roomId: 'public', token: 'token', listenOnly: true });
  const room = rooms[0];
  room.localParticipant.emit(ParticipantEvent.IsSpeakingChanged, true);
  expect(speaking).toHaveBeenCalledWith('self', true);
  await adapter.disconnect();
});

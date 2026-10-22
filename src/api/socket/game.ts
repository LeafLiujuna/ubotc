import { randomString } from '@/utils/random';
import { resolveBrowserReachableUrl } from '@/config/serverEndpoints';
import { io, Socket } from 'socket.io-client';
import { EventEmitter } from 'eventemitter3';
import {
  GameSocketEvents,
  ServerErrorMessage,
  ServerPushEventPayloadMap,
  SocketClientEvent,
  SocketEmitEvent,
  SocketEmitPayloadMap,
  SocketRequestEvent,
  SocketRequestPayloadMap,
  SocketRequestResponseMap,
  SocketResponse,
  SocketServerEvent,
} from '@/types/socket';

type PendingRequest = {
  requestId: string;
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
};

type RequestOptions = {
  timeout?: number; // 请求超时时间，单位毫秒
};

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export class SocketRequestError extends Error {
  public readonly status: number;
  public readonly error: string | undefined;
  public readonly data: unknown;

  public constructor(response: SocketResponse) {
    const responseError = typeof response.error === 'string' ? response.error : undefined;
    const responseMessage =
      typeof response.message === 'string' && response.message.trim()
        ? response.message
        : responseError || `Socket request failed with status ${response.status}`;

    super(responseMessage);
    this.name = 'SocketRequestError';
    this.status = response.status;
    this.error = responseError;
    this.data = response.data;
  }
}

function isSocketRequestErrorResponse(body: unknown): body is SocketResponse {
  if (!body || typeof body !== 'object') return false;
  const status = (body as { status?: unknown }).status;
  return typeof status === 'number' && status >= 400;
}

type RequestArgs<E extends SocketRequestEvent> =
  SocketRequestPayloadMap[E] extends undefined
    ? [event: E, opts?: RequestOptions]
    : [event: E, data: SocketRequestPayloadMap[E], opts?: RequestOptions];

type EmitArgs<E extends SocketEmitEvent> =
  SocketEmitPayloadMap[E] extends undefined
    ? [event: E]
    : [event: E, data: SocketEmitPayloadMap[E]];

type GameSocketWithTransportEvents = GameSocketEvents & {
  "socket:reconnecting": (attempt: number) => void;
  "socket:connected": () => void;
  "socket:disconnected": (reason: string) => void;
  "socket:error": (error: Error) => void;
};

const BROADCAST_SERVER_EVENTS: Array<keyof ServerPushEventPayloadMap> = [
  SocketServerEvent.BroadcastMessage,
  SocketServerEvent.RoomMeta,
  SocketServerEvent.RoomWillClose,
  SocketServerEvent.RoomClose,
  SocketServerEvent.Kicked,
  SocketServerEvent.ReceiveApply,
  SocketServerEvent.ApplyDone,
  SocketServerEvent.PluginRequest,
  SocketServerEvent.DMElectionUpdate,
  SocketServerEvent.VoiceRoomUserState,
  SocketServerEvent.HandSignals,
  SocketServerEvent.SeatRoles,
  SocketServerEvent.VoiceRoomOverview,
  SocketServerEvent.VoiceRoomJoin,
  SocketServerEvent.VoiceRoomInviteResult,
  SocketServerEvent.VoiceWillReturnToPublicRoom,
  SocketServerEvent.PlayerList,
  SocketServerEvent.GameState,
  SocketServerEvent.NightActionProgress,
  SocketServerEvent.GameScript,
  SocketServerEvent.GameConfig,
  SocketServerEvent.PublicMessage,
  SocketServerEvent.GetMessageHistory,
  SocketServerEvent.WhisperMessage,
  SocketServerEvent.DMMessage,
  SocketServerEvent.DeleteMessage,
  SocketServerEvent.LevelChangeClearMessage,
  SocketServerEvent.GameEnd,
  SocketServerEvent.CharacterChange,
  SocketServerEvent.PlayerEnter,
  SocketServerEvent.PlayerLeave,
  SocketServerEvent.PlayerBuff,
  SocketServerEvent.PlayerSkill,
  SocketServerEvent.DMEnter,
  SocketServerEvent.DMLeave,
  SocketServerEvent.UserEnter,
  SocketServerEvent.UserLeave,
  SocketServerEvent.LevelChange,
  SocketServerEvent.StartVote,
  SocketServerEvent.PlayerVoteStart,
  SocketServerEvent.PlayerVoteResult,
  SocketServerEvent.VoteResult,
  SocketServerEvent.DayNominationState,
];

const NO_PAYLOAD_REQUEST_EVENTS: Set<SocketRequestEvent> = new Set([
  'refreshGameState',
  'leaveSit',
  'leaveRoom',
  'getNotes',
  'dmEnter',
  'dmLeave',
  'applyDM',
  'cancelApplyDM',
  'dmVoiceRoomReturnToPublic',
]);

export class GameSocket {
  private gameApiUrl: string;
  private token: string;

  private io: Socket;
  private pendingRequests: Map<string, PendingRequest> = new Map();

  private eventEmitter = new EventEmitter<GameSocketWithTransportEvents>();

  constructor(gameApiUrl: string, token: string) {
    this.gameApiUrl = resolveBrowserReachableUrl(gameApiUrl);
    this.token = token;

    this.io = io(this.gameApiUrl, {
      auth: {
        token: this.token,
      },
    });

    this.bindEvents();
  }

  public close() {
    this.io.disconnect();
    
    // 清理所有待处理的请求
    for (const pendingRequest of this.pendingRequests.values()) {
      clearTimeout(pendingRequest.timeoutHandle);
      pendingRequest.reject(new Error('Socket closed'));
    }
    this.pendingRequests.clear();
  }

  public on = this.eventEmitter.on.bind(this.eventEmitter);
  public off = this.eventEmitter.off.bind(this.eventEmitter);
  public once = this.eventEmitter.once.bind(this.eventEmitter);

  private bindEvents() {
    this.io.on('ping', (payload: { nonce?: unknown }) => {
      if (typeof payload?.nonce !== 'string') return;
      this.emitEvent(SocketClientEvent.Pong, { nonce: payload.nonce });
    });

    this.io.on('connect', () => {
      this.eventEmitter.emit('socket:connected');
    });

    this.io.on('disconnect', (reason) => {
      this.eventEmitter.emit('socket:disconnected', reason);
    });

    this.io.on('connect_error', (error) => {
      this.eventEmitter.emit('socket:error', error instanceof Error ? error : new Error(String(error)));
    });

    const manager = (this.io as unknown as {
      io?: {
        on: (event: string, handler: (...args: unknown[]) => void) => void;
      };
    }).io;

    if (manager) {
      manager.on('reconnect_attempt', (attempt: unknown) => {
        this.eventEmitter.emit('socket:reconnecting', Number(attempt));
      });

      manager.on('reconnect_error', (error: unknown) => {
        this.eventEmitter.emit('socket:error', error instanceof Error ? error : new Error(String(error)));
      });

      manager.on('reconnect_failed', () => {
        this.eventEmitter.emit('socket:error', new Error('Socket reconnect failed'));
      });
    }

    this.io.on(SocketServerEvent.Response, (requestId: string, body: unknown) => {
      const pendingRequest = this.pendingRequests.get(requestId);
      if (!pendingRequest) {
        this.eventEmitter.emit(SocketServerEvent.Response, requestId, body);
        return;
      }

      clearTimeout(pendingRequest.timeoutHandle);
      this.pendingRequests.delete(requestId);
      if (isSocketRequestErrorResponse(body)) {
        pendingRequest.reject(new SocketRequestError(body));
      } else {
        pendingRequest.resolve(body);
      }
      this.eventEmitter.emit(SocketServerEvent.Response, requestId, body);
    });

    this.io.on(SocketServerEvent.Error, (payload: ServerErrorMessage) => {
      this.eventEmitter.emit(SocketServerEvent.Error, payload);
    });

    for (const event of BROADCAST_SERVER_EVENTS) {
      this.io.on(event, (payload: ServerPushEventPayloadMap[typeof event]) => {
        this.eventEmitter.emit(event as keyof GameSocketEvents, payload as never);
      });
    }
  }

  public async request<E extends SocketRequestEvent>(...args: RequestArgs<E>): Promise<SocketRequestResponseMap[E]> {
    const event = args[0];
    const requestId = randomString(16);

    const [data, opts] = this.parseRequestArgs(event, args as unknown as [E, unknown, RequestOptions | undefined]);

    // 交互请求默认快速失败；确实需要长等待的请求可通过 opts.timeout 显式覆盖。
    const timeoutMs = opts.timeout ?? DEFAULT_REQUEST_TIMEOUT_MS;
    return new Promise<SocketRequestResponseMap[E]>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Socket request timeout: ${event}`));
      }, timeoutMs);

      const pendingRequest: PendingRequest = {
        requestId,
        resolve,
        reject,
        timeoutHandle,
      };

      this.pendingRequests.set(requestId, pendingRequest);

      this.io.emit(event, requestId, data);
    });
  }

  public emitEvent<E extends SocketEmitEvent>(...args: EmitArgs<E>) {
    const event = args[0];
    const data = args[1] as SocketEmitPayloadMap[E] | undefined;
    this.io.emit(event, data);
  }

  private parseRequestArgs<E extends SocketRequestEvent>(
    event: E,
    args: [E, unknown, RequestOptions | undefined],
  ): [SocketRequestPayloadMap[E] | undefined, RequestOptions] {
    const maybeDataOrOpts = args[1];
    const maybeOpts = args[2];

    if (maybeOpts) {
      return [maybeDataOrOpts as SocketRequestPayloadMap[E], maybeOpts];
    }

    if (NO_PAYLOAD_REQUEST_EVENTS.has(event)) {
      return [undefined, (maybeDataOrOpts ?? {}) as RequestOptions];
    }

    return [maybeDataOrOpts as SocketRequestPayloadMap[E], {}];
  }
}

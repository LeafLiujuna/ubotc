export interface RoomJoinFailure {
  status?: number;
  errorCode?: string;
  message?: string;
}

export interface RoomPasswordPromptContext {
  isPrivate: boolean;
  hasAuthToken: boolean;
  hasSuppliedPassword: boolean;
}

const PASSWORD_REQUIRED_CODES = new Set([
  "ERR::PASSWORD_REQUIRED",
  "ERR::WRONG_PASSWORD",
]);

const AUTHENTICATION_ERROR_CODES = new Set([
  "ERR::UNAUTHORIZED",
  "ERR::TOKEN_INVALID",
  "ERR::USER_NOT_FOUND",
]);

const ROOM_UNAVAILABLE_CODES = new Set([
  "ERR::ROOM_NOT_FOUND",
  "ERR::NOT_FOUND",
  "ERR::GAME_SERVER_UNAVAILABLE",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

/** Normalize both an Axios rejection and an API error response. */
export function getRoomJoinFailure(value: unknown): RoomJoinFailure {
  const input = asRecord(value);
  const response = asRecord(input?.response) ?? input;
  const responseData = asRecord(response?.data);
  const body = responseData ?? response;

  const responseStatus = response?.status;
  const bodyStatus = body?.status;
  const errorCode = body?.errorCode;
  const message = body?.message;

  return {
    status: typeof responseStatus === "number"
      ? responseStatus
      : typeof bodyStatus === "number"
        ? bodyStatus
        : undefined,
    errorCode: typeof errorCode === "string" ? errorCode : undefined,
    message: typeof message === "string" ? message : undefined,
  };
}

export function shouldPromptForRoomPassword(
  failure: RoomJoinFailure,
  context: RoomPasswordPromptContext,
): boolean {
  if (failure.errorCode && PASSWORD_REQUIRED_CODES.has(failure.errorCode)) {
    return true;
  }

  if (!context.isPrivate) return false;

  // Compatibility with older local lobby processes that used the generic
  // unauthorized code for a private room with no supplied password.
  if (
    failure.status === 401 &&
    context.hasAuthToken &&
    !context.hasSuppliedPassword &&
    (!failure.errorCode || failure.errorCode === "ERR::UNAUTHORIZED")
  ) {
    return true;
  }

  // Older/custom servers may omit the code while retaining the conventional
  // 403 response for an incorrect password.
  return Boolean(
    failure.status === 403 &&
    context.hasSuppliedPassword &&
    !failure.errorCode,
  );
}

export function isAuthenticationFailure(failure: RoomJoinFailure): boolean {
  if (
    failure.errorCode === "ERR::PASSWORD_REQUIRED" ||
    failure.errorCode === "ERR::WRONG_PASSWORD"
  ) {
    return false;
  }

  return failure.status === 401 || Boolean(
    failure.errorCode && AUTHENTICATION_ERROR_CODES.has(failure.errorCode),
  );
}

export function isRoomUnavailableFailure(failure: RoomJoinFailure): boolean {
  return failure.status === 404 || failure.status === 503 || Boolean(
    failure.errorCode && ROOM_UNAVAILABLE_CODES.has(failure.errorCode),
  );
}

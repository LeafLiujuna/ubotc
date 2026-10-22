import {
  getRoomJoinFailure,
  isAuthenticationFailure,
  isRoomUnavailableFailure,
  shouldPromptForRoomPassword,
} from "@/services/roomJoinFailure";

const context = (overrides = {}) => ({
  isPrivate: false,
  hasAuthToken: true,
  hasSuppliedPassword: false,
  ...overrides,
});

describe("room join failure recovery", () => {
  test("does not ask for a public-room password when authentication fails", () => {
    const failure = getRoomJoinFailure({
      response: {
        status: 401,
        data: {
          errorCode: "ERR::TOKEN_INVALID",
          message: "登录状态已失效",
        },
      },
    });

    expect(failure).toEqual({
      status: 401,
      errorCode: "ERR::TOKEN_INVALID",
      message: "登录状态已失效",
    });
    expect(shouldPromptForRoomPassword(failure, context())).toBe(false);
    expect(isAuthenticationFailure(failure)).toBe(true);
  });

  test.each([
    ["ERR::PASSWORD_REQUIRED", false],
    ["ERR::WRONG_PASSWORD", true],
  ])("asks for a private-room password for %s", (errorCode, hasSuppliedPassword) => {
    const failure = getRoomJoinFailure({
      status: hasSuppliedPassword ? 403 : 401,
      errorCode,
      message: "房间密码无效",
    });

    expect(shouldPromptForRoomPassword(
      failure,
      context({ isPrivate: true, hasSuppliedPassword }),
    )).toBe(true);
    expect(isAuthenticationFailure(failure)).toBe(false);
  });

  test("does not mistake a banned user for a private-room password failure", () => {
    const failure = getRoomJoinFailure({
      response: {
        status: 403,
        data: {
          status: 403,
          errorCode: "ERR::USER_BANNED",
          message: "账号已被封禁",
        },
      },
    });

    expect(shouldPromptForRoomPassword(
      failure,
      context({ isPrivate: true, hasSuppliedPassword: true }),
    )).toBe(false);
  });

  test.each([
    [404, "ERR::ROOM_NOT_FOUND"],
    [404, "ERR::NOT_FOUND"],
    [503, "ERR::GAME_SERVER_UNAVAILABLE"],
  ])("recognizes a room ended by server loss (%s, %s)", (status, errorCode) => {
    expect(isRoomUnavailableFailure({ status, errorCode })).toBe(true);
  });

  test("does not classify a wrong password as a server restart", () => {
    expect(isRoomUnavailableFailure({
      status: 403,
      errorCode: "ERR::WRONG_PASSWORD",
    })).toBe(false);
  });
});

import { getApiErrorMessage, isUnauthorizedError, unwrapApiResponse } from "@/services/api/response";

describe("api response helpers", () => {
  test("unwraps backend http response envelope", () => {
    expect(unwrapApiResponse({ status: 200, data: { ok: true } })).toEqual({ ok: true });
  });

  test("keeps plain response payloads intact", () => {
    expect(unwrapApiResponse([{ id: "room-1" }])).toEqual([{ id: "room-1" }]);
  });

  test("reads backend error message first", () => {
    const error = {
      response: {
        data: {
          message: "房间不存在",
        },
      },
    };

    expect(getApiErrorMessage(error)).toBe("房间不存在");
  });

  test("detects unauthorized responses", () => {
    expect(isUnauthorizedError({ response: { status: 401 } })).toBe(true);
    expect(isUnauthorizedError({ response: { status: 403 } })).toBe(false);
  });
});

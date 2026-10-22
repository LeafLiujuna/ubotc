const mocks = vi.hoisted(() => ({
  legacyPost: vi.fn(),
  rawPost: vi.fn(),
}));

vi.mock("@/config/env", () => ({
  isDev: () => false,
}));

vi.mock("@/transport/http", () => ({
  apiClient: {
    post: mocks.rawPost,
  },
}));

vi.mock("@/services/api", () => ({
  default: {
    post: mocks.legacyPost,
  },
}));

import { AuthApi } from "@/api/http/auth";
import authApiService from "@/services/services/auth";

describe("production development-login guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("blocks the typed API before an HTTP request is sent", async () => {
    await expect(AuthApi.devLogin()).rejects.toThrow("disabled in production");
    expect(mocks.rawPost).not.toHaveBeenCalled();
  });

  test("blocks the legacy service before an HTTP request is sent", async () => {
    await expect(authApiService.devLogin()).rejects.toThrow("disabled in production");
    expect(mocks.legacyPost).not.toHaveBeenCalled();
  });
});

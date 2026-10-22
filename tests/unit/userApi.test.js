import { UserApi } from "@/api/http/user";
import { apiClient } from "@/transport/http";

vi.mock("@/transport/http", () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

describe("UserApi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("serializes batch user ids as repeated query keys without brackets", async () => {
    apiClient.get.mockResolvedValue({ data: { status: 200, data: [] } });

    await UserApi.batchGetUsers({ id: ["user-1", "user-2"] });

    expect(apiClient.get).toHaveBeenCalledWith("/users/batch", {
      params: { id: ["user-1", "user-2"] },
      paramsSerializer: { indexes: null },
    });
  });
});

import { normalizeApiBaseUrl } from "@/services/api/config";

describe("api config", () => {
  test("keeps default relative api base", () => {
    expect(normalizeApiBaseUrl()).toBe("/api");
  });

  test("adds /api when env value is backend origin", () => {
    expect(normalizeApiBaseUrl("http://localhost:9095")).toBe("http://localhost:9095/api");
  });

  test("keeps explicit api base unchanged", () => {
    expect(normalizeApiBaseUrl("http://localhost:9095/api")).toBe("http://localhost:9095/api");
  });
});

export function normalizeApiBaseUrl(value?: string): string {
  const baseUrl = value?.trim().replace(/\/+$/, "") || "/api";
  return /\/api$/i.test(baseUrl) ? baseUrl : `${baseUrl}/api`;
}

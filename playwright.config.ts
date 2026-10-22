import { defineConfig } from "@playwright/test";

const localExecutablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }], ["line"]],
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}{ext}",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:8081",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: process.env.PLAYWRIGHT_DISABLE_VIDEO ? "off" : "retain-on-failure",
    launchOptions: localExecutablePath ? { executablePath: localExecutablePath } : undefined,
  },
  projects: [
    { name: "phone-375x667", use: { viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true } },
    { name: "phone-390x844", use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
    { name: "landscape-844x390", use: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true } },
    { name: "tablet-768x1024", use: { viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: "desktop-1440x900", use: { viewport: { width: 1440, height: 900 } } },
  ],
});

import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
export default defineConfig({
  testDir: "tests/phone-ui",
  timeout: 90000,
  workers: 1,
  use: {
    ...devices["iPhone 13"],
    defaultBrowserType: "chromium",
    baseURL: "http://127.0.0.1:3200",
    launchOptions: {
      executablePath: existsSync("/usr/bin/chromium")
        ? "/usr/bin/chromium"
        : undefined,
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "npm run preview:phone",
    url: "http://127.0.0.1:3200",
    reuseExistingServer: false,
    timeout: 30000,
  },
});

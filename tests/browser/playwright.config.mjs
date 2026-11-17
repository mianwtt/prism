import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4318",
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    cwd: root,
    command: "node src/server.mjs",
    url: "http://127.0.0.1:4318/api/health",
    reuseExistingServer: false,
    env: {
      PORT: "4318",
      HOST: "127.0.0.1",
      PRISM_DATA_DIR: "work/e2e-data-" + Date.now(),
      LLM_API_KEY: "",
      LLM_MODEL: "",
      TAVILY_API_KEY: "",
    },
  },
});

import base from "./playwright.config";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: "http://127.0.0.1:1422" },
  webServer: {
    command: "npm run dev -- --port 1422",
    url: "http://127.0.0.1:1422",
    reuseExistingServer: false,
  },
});

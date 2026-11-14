import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173/floetentrainer/",
    trace: "off",
    // Ohne eigene Daten beginnt jeder Test wie nach „Von vorn beginnen“ (sonst käme die Willkommensseite,
    // docs/app-startpunkt.md). Tests mit seed(page, null) sehen sie wie beim allerersten Start.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: "http://localhost:4173",
          localStorage: [{ name: "floetentrainer", value: JSON.stringify({ version: 2, app: "floetentrainer", start: { lesen: "erste-toene", spielen: "erste-toene" } }) }],
        },
      ],
    },
    launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173/floetentrainer/",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

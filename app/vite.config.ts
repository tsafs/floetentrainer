import { defineConfig } from "vitest/config";
import { heftSongs } from "./scripts/heft-songs-plugin.ts";
import { serviceWorker } from "./scripts/sw-plugin.ts";

export default defineConfig({
  base: "/floetentrainer/",
  plugins: [heftSongs(), serviceWorker()],
  build: { target: "es2022", assetsInlineLimit: 0 },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import { serviceWorker } from "./tools/vite-sw.ts";

// https://vite.dev/config/
// https://vitest.dev/config/
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    // og.png is a social card for crawlers, and 160 kB of an offline install
    // that no player will ever see.
    serviceWorker({ source: "src/sw.js", exclude: ["og.png"] }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/engine/testing.ts", "src/main.tsx"],
      thresholds: {
        // The engine and the input layer are pure, so a floor is cheap to hold.
        "src/engine/**": { lines: 90, branches: 90 },
        "src/input/**": { lines: 80, branches: 80 },
      },
    },
  },
});

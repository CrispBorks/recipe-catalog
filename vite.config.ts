/// <reference types="vitest/config" />
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  // The unit tests cover the parsers and the pure helpers — the parts with
  // enough edge cases to be worth pinning down. Anything needing a browser
  // lives in tests/browser and runs separately.
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});

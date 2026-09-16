import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": root,
      "server-only": path.resolve(root, "tests/empty.ts"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}", "evals/**/*.test.ts"],
    css: false,
  },
});

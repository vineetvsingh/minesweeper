/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// The build is one self-contained HTML file (scripts, styles and the generator
// worker inlined), so dist/index.html still opens straight from disk.
export default defineConfig({
  base: "./",
  plugins: [viteSingleFile()],
  build: { target: "es2022" },
  worker: { format: "es" },
  test: { include: ["tests/**/*.test.ts"] },
});

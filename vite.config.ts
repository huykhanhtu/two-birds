import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages serves under /two-birds/ (ADR-0010)
  base: process.env.GH_PAGES ? "/two-birds/" : "/",
  build: { target: "es2022" },
});

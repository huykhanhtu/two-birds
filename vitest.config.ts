import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = dirname(fileURLToPath(import.meta.url));

// Canonical unit-test config for two-birds. The workspace runner entry point
// (tests/_runner/vitest.two-birds.config.ts) re-exports this file.
export default defineConfig({
  root: here,
  test: {
    dir: resolve(here, "../../tests/unit/two-birds"),
    environment: "node",
  },
});

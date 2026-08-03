// Vitest configuration — runs test/*.test.mjs with the vitest runner.
// Project is ESM ("type": "module"); .mjs tests load via native ESM.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.mjs"],
    // Node built-in test runner used to be the runner here; vitest supersedes it.
    // node:test's `test` is NOT used — tests import from "vitest".
    environment: "node",
    globals: false,
    reporters: "default",
  },
});

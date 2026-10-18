import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    // `.ts` as well as `.tsx` under client/: a plain-TS unit test in the client tree
    // was never collected, because only `.tsx` matched. A test that exists and does not
    // run is worse than no test, because it reads as coverage.
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      "client/**/*.test.ts",
      "client/**/*.test.tsx",
      "client/**/*.spec.ts",
      "client/**/*.spec.tsx",
      "shared/**/*.test.ts",
      "shared/**/*.spec.ts",
    ],
  },
});

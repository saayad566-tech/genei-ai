import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Regression guard for the packaging failure that made the installed Windows app
// unusable: esbuild inlined the dynamic `import("../../vite.config")` into the
// server bundle, which hoisted Vite's dev-only toolchain to top-level imports of
// dist/index.js. electron-builder ships production dependencies only, so the
// packaged server died with ERR_MODULE_NOT_FOUND before it could print its
// readiness line and the desktop window never loaded.
//
// The build script now passes --splitting, which keeps that toolchain in a
// separate lazy chunk. These assertions fail loudly if that ever regresses.

const bundlePath = path.resolve(import.meta.dirname, "../dist/index.js");
const DEV_TOOLCHAIN = [
  "vite",
  "@vitejs/plugin-react",
  "@tailwindcss/vite",
  "@builder.io/vite-plugin-jsx-loc",
  "vite-plugin-manus-runtime",
];

describe("packaged server bundle", () => {
  const built = fs.existsSync(bundlePath);

  it.skipIf(!built)("does not statically import the Vite development toolchain", () => {
    const bundle = fs.readFileSync(bundlePath, "utf8");
    const offenders = DEV_TOOLCHAIN.filter((name) => bundle.includes(`from "${name}"`));
    expect(offenders).toEqual([]);
  });

  it.skipIf(!built)("resolves only packages that ship as production dependencies", () => {
    const bundle = fs.readFileSync(bundlePath, "utf8");
    const specifiers = new Set<string>();
    // Only a real module specifier counts. Scanning for `from "` anywhere matched prose
    // inside string literals — a prompt containing `character from "${...}"` was reported
    // as an undeclared dependency. A package name cannot contain a template expression,
    // whitespace, or parentheses, so requiring that shape removes the false positive
    // without weakening the check.
    const SPECIFIER = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(\/[\w.-]+)*$/i;
    for (const match of bundle.matchAll(/from "([^".][^"]*)"/g)) {
      const raw = match[1];
      if (!SPECIFIER.test(raw)) continue;
      const packageName = raw.startsWith("@") ? raw.split("/").slice(0, 2).join("/") : raw.split("/")[0];
      specifiers.add(packageName);
    }
    const pkg = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../package.json"), "utf8"));
    const runtimePackages = new Set(Object.keys(pkg.dependencies ?? {}));
    const builtins = new Set(["node", "fs", "path", "http", "net", "crypto", "events", "child_process", "util", "stream", "os", "url", "zlib"]);
    const missing = [...specifiers]
      .filter((name) => !builtins.has(name) && !runtimePackages.has(name) && !name.startsWith("node:"))
      .sort();
    expect(missing).toEqual([]);
  });
});

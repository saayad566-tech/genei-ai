/**
 * Runtime configuration.
 *
 * This file is read BEFORE the app starts, and is deliberately a plain script rather than
 * part of the bundle: it means the backend URL can be changed by editing one file after the
 * build, without a toolchain, a rebuild, or a Node install.
 *
 * That matters for web-to-app packaging. A WebView wrapping a static bundle has no origin
 * server, so a hardcoded "/api/trpc" resolves to the local file and returns index.html
 * instead of JSON — the app renders but every request fails. Pointing apiBase at a real
 * server fixes it here, with no rebuild.
 *
 *   ""                          same origin (correct for a normal web deployment)
 *   "https://api.example.com"   a separate backend
 */
window.__GENEI_CONFIG__ = {
  apiBase: "",
};

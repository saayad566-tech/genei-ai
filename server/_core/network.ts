/**
 * Outbound network configuration.
 *
 * Node's built-in `fetch` does **not** honour `HTTP_PROXY` / `HTTPS_PROXY`. On a machine
 * or network that requires a proxy — a corporate network, a sandbox with egress through a
 * gateway, a locked-down host — every outbound call fails with a connection error while
 * `curl` in the same shell succeeds. That is a genuinely confusing failure, and it is why
 * live-data tests skip in such environments.
 *
 * `EnvHttpProxyAgent` is the right tool here rather than a plain `ProxyAgent`: it reads
 * `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY` itself, and — verified, not assumed — it
 * genuinely bypasses the hosts in `NO_PROXY`. A plain `ProxyAgent` with a `noProxy` option
 * does not do this in undici 6 or 7, which would have sent requests for ComfyUI and
 * llama-server on localhost through the proxy and broken them.
 */
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

export type ProxyOutcome = {
  configured: boolean;
  proxy?: string;
  bypass?: string[];
  reason?: string;
};

/** The proxy URL and bypass list, as the environment declares them. */
export function resolveProxy(env: NodeJS.ProcessEnv = process.env): { proxy?: string; bypass: string[] } {
  const proxy =
    env.HTTPS_PROXY?.trim() ||
    env.https_proxy?.trim() ||
    env.HTTP_PROXY?.trim() ||
    env.http_proxy?.trim() ||
    undefined;
  const bypass = (env.NO_PROXY || env.no_proxy || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return { proxy, bypass };
}

/**
 * Install the environment-aware proxy dispatcher when the environment asks for one.
 *
 * Returns what it did so startup can report it rather than leaving the behaviour
 * invisible. A malformed proxy value is refused with a reason instead of being installed
 * and failing every request later.
 */
export function configureProxyFromEnvironment(env: NodeJS.ProcessEnv = process.env): ProxyOutcome {
  if (env.GENEI_DISABLE_PROXY === "1") {
    return { configured: false, reason: "GENEI_DISABLE_PROXY is set, so no proxy is used." };
  }

  const { proxy, bypass } = resolveProxy(env);
  if (!proxy) {
    return { configured: false, reason: "No HTTP_PROXY or HTTPS_PROXY is set." };
  }

  try {
    const parsed = new URL(proxy);
    if (!/^https?:$/.test(parsed.protocol)) {
      return { configured: false, reason: `The proxy protocol "${parsed.protocol}" is not http or https.` };
    }
  } catch {
    return { configured: false, reason: "The proxy value is not a valid URL." };
  }

  try {
    // Reads the environment itself, so NO_PROXY is honoured for local services.
    setGlobalDispatcher(new EnvHttpProxyAgent());
    return { configured: true, proxy, bypass };
  } catch (error) {
    return { configured: false, reason: `The proxy could not be installed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

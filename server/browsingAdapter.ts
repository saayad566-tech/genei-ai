/**
 * Browsing adapter.
 *
 * Requirement: when a model lacks context it must be able to fetch real-time
 * information and documentation. This adapter performs the fetch for real and
 * records provenance (the exact URL, the final URL after redirects, and when it was
 * read) so the Director can cite what it grounded on.
 *
 * It never invents a result. If browsing is not configured or the network is
 * unavailable, the caller receives an explicit "unsupported" state and must say so
 * rather than answering from an invented memory.
 */

export type BrowsingOk = {
  status: "ok";
  url: string;
  finalUrl: string;
  title: string;
  text: string;
  fetchedAt: string;
  contentLength: number;
};

export type BrowsingUnsupported = {
  status: "unsupported";
  reason: string;
};

export type BrowsingError = {
  status: "error";
  url: string;
  error: string;
};

export type BrowsingResult = BrowsingOk | BrowsingUnsupported | BrowsingError;

export type FetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  userAgent?: string;
};

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_BYTES = 2_000_000;
const DEFAULT_UA = "GeneiAI/1.0 (+local-first; context grounding)";

/**
 * Only http(s) to a public host. Private ranges and loopback are refused so a
 * prompt cannot be used to probe the user's own machine or local network.
 */
export function isFetchableUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Not a valid absolute URL." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `Unsupported protocol ${url.protocol}. Only http and https are allowed.` };
  }
  const host = url.hostname.toLowerCase();
  const isPrivate =
    host === "localhost" ||
    host === "::1" ||
    host.endsWith(".local") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    host === "0.0.0.0";
  if (isPrivate) {
    return { ok: false, reason: "Refusing to fetch a private or loopback address." };
  }
  return { ok: true, url };
}

/** Strip script/style/comment blocks and tags, collapse whitespace. Dependency-free. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractTitle(html: string): string {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? htmlToText(match[1]).slice(0, 300) : "";
}

/**
 * Fetch a page and return its readable text with provenance.
 * Every failure mode is reported as itself — there is no silent fallback to a guess.
 */
export async function fetchPageForContext(rawUrl: string, options: FetchOptions = {}): Promise<BrowsingResult> {
  const validated = isFetchableUrl(rawUrl);
  if (!validated.ok) {
    return { status: "unsupported", reason: validated.reason };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(validated.url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": options.userAgent ?? DEFAULT_UA, accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5" },
    });

    if (!response.ok) {
      return { status: "error", url: rawUrl, error: `The page returned HTTP ${response.status}.` };
    }

    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.text();
    const truncated = body.slice(0, maxBytes);
    const text = contentType.includes("text/html") ? htmlToText(truncated) : truncated.trim();

    return {
      status: "ok",
      url: rawUrl,
      finalUrl: response.url || validated.url.toString(),
      title: contentType.includes("text/html") ? extractTitle(truncated) : "",
      text: text.slice(0, 40_000),
      fetchedAt: new Date().toISOString(),
      contentLength: body.length,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `The request timed out after ${timeoutMs} ms.`
        : error instanceof Error
          ? error.message
          : "Unknown network error.";
    return { status: "error", url: rawUrl, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Web search for context. Requires a configured search endpoint; without one the
 * honest answer is that search is unsupported, not an invented result set.
 */
export async function searchForContext(query: string, options: FetchOptions = {}): Promise<BrowsingResult> {
  const endpoint = process.env.GENEI_SEARCH_ENDPOINT?.trim();
  if (!endpoint) {
    return {
      status: "unsupported",
      reason:
        "No search endpoint is configured. Set GENEI_SEARCH_ENDPOINT to enable live search, or provide explicit URLs to fetch.",
    };
  }
  const trimmed = query.trim();
  if (!trimmed) {
    return { status: "unsupported", reason: "An empty search query has nothing to look up." };
  }
  const separator = endpoint.includes("?") ? "&" : "?";
  return fetchPageForContext(`${endpoint}${separator}q=${encodeURIComponent(trimmed)}`, options);
}

/** Grounding block injected into a model prompt, or an explicit note that none exists. */
export function groundingBlock(result: BrowsingResult): string {
  if (result.status === "ok") {
    return [
      `Grounded context from ${result.finalUrl} (read ${result.fetchedAt}):`,
      result.title ? `Title: ${result.title}` : "",
      result.text.slice(0, 8_000),
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (result.status === "unsupported") {
    return `No live context is available: ${result.reason} Do not present remembered or assumed information as current.`;
  }
  return `Live context could not be retrieved from ${result.url}: ${result.error} Do not present remembered or assumed information as current.`;
}

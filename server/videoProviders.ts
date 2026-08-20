import * as crypto from "crypto";

export type VideoProviderHealth = {
  status: "healthy" | "invalid" | "unreachable" | "needs_configuration" | "unsupported";
  message: string;
  checkedAt: string;
  capabilities: string[];
};

export type VideoProviderSpec = {
  id: string;
  name: string;
  category: "Video" | "Voice" | "AI";
  auth: "bearer" | "x-api-key" | "configured";
  docsUrl: string;
  capabilities: string[];
  health: "account" | "configured_endpoint" | "task_probe" | "not_available";
};

export const VIDEO_PROVIDER_CATALOG: VideoProviderSpec[] = [
  {
    id: "runway",
    name: "Runway",
    category: "Video",
    auth: "bearer",
    docsUrl: "https://docs.dev.runwayml.com/guides/using-the-api/",
    capabilities: ["text-to-video", "image-to-video", "video-upscale", "character-control"],
    health: "task_probe",
  },
  {
    id: "pika",
    name: "Pika",
    category: "Video",
    auth: "configured",
    docsUrl: "https://dev.pika.art/agent",
    capabilities: ["text-to-video", "image-to-video", "audio", "speech"],
    health: "account",
  },
  {
    id: "kling",
    name: "Kling",
    category: "Video",
    auth: "bearer",
    docsUrl: "https://kling.ai/document-api/api/assets/account-usage",
    capabilities: ["text-to-video", "image-to-video", "motion-control", "character-reference"],
    health: "account",
  },
  {
    id: "heygen",
    name: "HeyGen",
    category: "Video",
    auth: "x-api-key",
    docsUrl: "https://developers.heygen.com/user-profile",
    capabilities: ["avatar-video", "lip-sync", "voice", "translation"],
    health: "account",
  },
];

const checkedAt = () => new Date().toISOString();

async function requestHealth(url: string, headers: Record<string, string>): Promise<Response> {
  return fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(8_000) });
}

export async function checkVideoProviderHealth(provider: string, key: string): Promise<VideoProviderHealth> {
  const spec = VIDEO_PROVIDER_CATALOG.find((item) => item.id === provider);
  if (!spec) {
    return { status: "unsupported", message: "No provider-specific video adapter is registered for this provider.", checkedAt: checkedAt(), capabilities: [] };
  }

  try {
    if (provider === "heygen") {
      const response = await requestHealth("https://api.heygen.com/v3/users/me", { "X-Api-Key": key });
      return { status: response.ok ? "healthy" : "invalid", message: response.ok ? "HeyGen account and credits endpoint accepted the key." : `HeyGen rejected the key (${response.status}).`, checkedAt: checkedAt(), capabilities: spec.capabilities };
    }

    if (provider === "kling") {
      const end = Date.now();
      const start = end - 86_400_000;
      const response = await requestHealth(`https://api-singapore.klingai.com/account/costs?start_time=${start}&end_time=${end}`, { Authorization: `Bearer ${key}`, "Content-Type": "application/json" });
      return { status: response.ok ? "healthy" : "invalid", message: response.ok ? "Kling account usage endpoint accepted the key." : `Kling rejected the key (${response.status}).`, checkedAt: checkedAt(), capabilities: spec.capabilities };
    }

    if (provider === "runway") {
      const taskId = process.env.GENEI_RUNWAY_HEALTH_TASK_ID || "00000000-0000-0000-0000-000000000000";
      const endpoint = process.env.GENEI_RUNWAY_HEALTH_ENDPOINT || `https://api.dev.runwayml.com/v1/tasks/${taskId}`;
      const response = await requestHealth(endpoint, { Authorization: `Bearer ${key}`, "X-Runway-Version": process.env.GENEI_RUNWAY_API_VERSION || "2024-11-06" });
      if (response.status === 401 || response.status === 403) return { status: "invalid", message: `Runway rejected the key (${response.status}).`, checkedAt: checkedAt(), capabilities: spec.capabilities };
      if (response.status === 404 && !process.env.GENEI_RUNWAY_HEALTH_ENDPOINT) return { status: "healthy", message: "Runway authenticated task endpoint is reachable; no billable generation was created and the sentinel task is not present.", checkedAt: checkedAt(), capabilities: spec.capabilities };
      return { status: response.ok ? "healthy" : "unreachable", message: response.ok ? "Runway task endpoint accepted the key." : `Runway task endpoint returned ${response.status}.`, checkedAt: checkedAt(), capabilities: spec.capabilities };
    }

    if (provider === "pika") {
      const endpoint = process.env.GENEI_PIKA_HEALTH_ENDPOINT || "https://api.dev.pika.art/billing/balance";
      const headerName = process.env.GENEI_PIKA_AUTH_HEADER || "X-API-Key";
      const headerValue = headerName.toLowerCase() === "authorization" ? `Bearer ${key}` : key;
      const response = await requestHealth(endpoint, { [headerName]: headerValue });
      return { status: response.ok ? "healthy" : response.status === 401 || response.status === 403 ? "invalid" : "unreachable", message: response.ok ? "Pika billing balance endpoint accepted the key." : `Pika health endpoint returned ${response.status}.`, checkedAt: checkedAt(), capabilities: spec.capabilities };
    }
  } catch (error) {
    return { status: "unreachable", message: error instanceof Error ? error.message : "Provider health check failed", checkedAt: checkedAt(), capabilities: spec.capabilities };
  }

  return { status: "unsupported", message: "Provider adapter does not expose a safe health check yet.", checkedAt: checkedAt(), capabilities: spec.capabilities };
}

export function hashRunnerToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

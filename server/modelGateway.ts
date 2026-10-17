import { invokeLLM, type Message } from "./_core/llm";
import { ENV } from "./_core/env";

export type ModelPurpose = "chat" | "lyrics" | "prompt" | "vision" | "image";

export type ClientRuntimeHints = {
  webGpu: boolean;
  storage: boolean;
  online: boolean;
};

export type ModelCapability = {
  id: string;
  label: string;
  provider: string;
  purposes: ModelPurpose[];
  supportsAndroid: boolean;
  supportsOnDevice: boolean;
  status: "available" | "server-only" | "not-configured";
};

export type ModelCapabilitiesResult = {
  models: ModelCapability[];
  source: "live" | "fallback";
  runtime: {
    webGpu: boolean;
    storage: boolean;
    online: boolean;
    onDeviceEligible: boolean;
    fallback: "server";
  };
};

export type ModelGatewayResult = {
  content: string;
  model: string;
  purpose: ModelPurpose;
  execution: "server";
  fallbackUsed: boolean;
  attempts: number;
};

/**
 * The managed model, named by configuration.
 *
 * There is deliberately no built-in default model id: the platform must not decide
 * on the user's behalf which model runs. When no managed model is configured this
 * returns null, and callers report "no model selected" rather than guessing.
 */
function managedModelCapability(): ModelCapability | null {
  const id = ENV.forgeModel.trim();
  if (!id) return null;
  return {
    id,
    label: "Genei Managed Model",
    provider: "Managed provider",
    purposes: ["chat", "lyrics", "prompt", "vision"],
    supportsAndroid: true,
    supportsOnDevice: false,
    status: ENV.forgeApiKey ? "available" : "not-configured",
  };
}

function getTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type: "text"; text: string } =>
      Boolean(part && typeof part === "object" && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string")
    )
    .map((part) => part.text)
    .join("\n");
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("Model request timed out. Please retry.")), timeoutMs);
    }),
  ]);
}

export async function getModelCapabilities(runtime?: ClientRuntimeHints): Promise<ModelCapabilitiesResult> {
  const runtimeState = {
    webGpu: runtime?.webGpu === true,
    storage: runtime?.storage === true,
    online: runtime?.online !== false,
    onDeviceEligible: runtime?.webGpu === true && runtime?.storage === true,
    fallback: "server" as const,
  };

  // Resolve the managed endpoint the same way `_core/llm.ts` does: honour an
  // explicitly configured URL, otherwise fall back to the public Forge host.
  // The live catalog must still be attempted when only the base URL or only
  // the key is configured, so the gateway can degrade to the managed model
  // instead of silently reporting an empty catalog.
  const resolvedBaseUrl = ENV.forgeApiUrl.trim().length > 0
    ? ENV.forgeApiUrl.replace(/\/$/, "")
    : "https://forge.manus.im";
  const managed = managedModelCapability();
  const managedFallback: ModelCapability[] = managed ? [managed] : [];

  try {
    const response = await fetch(`${resolvedBaseUrl}/v1/models`, {
      headers: { authorization: `Bearer ${ENV.forgeApiKey}` },
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return { models: managedFallback, source: "fallback", runtime: runtimeState };

    const payload = await response.json() as { data?: Array<{ id?: string; owned_by?: string }> };
    const liveModels = (payload.data ?? [])
      .filter((model): model is { id: string; owned_by?: string } => typeof model.id === "string" && model.id.length > 0)
      .slice(0, 20)
      .map((model) => ({
        id: model.id,
        label: model.id,
        provider: model.owned_by || "Managed provider",
        purposes: ["chat", "lyrics", "prompt", "vision"] as ModelPurpose[],
        supportsAndroid: true,
        supportsOnDevice: false,
        status: "server-only" as const,
      }));

    return {
      models: liveModels.length ? liveModels : managedFallback,
      source: liveModels.length ? "live" : "fallback",
      runtime: runtimeState,
    };
  } catch {
    return { models: managedFallback, source: "fallback", runtime: runtimeState };
  }
}

export async function generateWithModel(args: {
  purpose: ModelPurpose;
  messages: Message[];
  timeoutMs?: number;
  preferredModel?: string;
}): Promise<ModelGatewayResult> {
  const catalog = await getModelCapabilities();
  // The user's explicit choice always wins. Everything after it is a catalog entry
  // that can actually serve this purpose - never a built-in fallback id.
  const catalogModels = catalog.models
    .filter((model) => model.purposes.includes(args.purpose))
    .map((model) => model.id);
  const candidates = Array.from(new Set(
    [args.preferredModel, ...catalogModels].filter((model): model is string => Boolean(model)),
  ));

  if (candidates.length === 0) {
    throw new Error(
      "No model is selected. Choose a model in the Model Library, or configure a provider, before requesting generation.",
    );
  }

  let lastError: unknown = new Error("No model is configured.");

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    try {
      const response = await withTimeout(invokeLLM({ model: candidate, messages: args.messages }), args.timeoutMs ?? 45_000);
      const content = getTextContent(response.choices[0]?.message?.content);
      if (!content) throw new Error("The model returned an empty response.");

      return {
        content,
        model: response.model || candidate,
        purpose: args.purpose,
        execution: "server",
        fallbackUsed: index > 0,
        attempts: index + 1,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(lastError instanceof Error ? lastError.message : "All configured models failed. Please retry.");
}

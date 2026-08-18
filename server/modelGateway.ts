import { invokeLLM, type Message } from "./_core/llm";
import { ENV } from "./_core/env";

export type ModelPurpose = "chat" | "lyrics" | "prompt" | "vision" | "image";

export type ModelCapability = {
  id: string;
  label: string;
  provider: string;
  purposes: ModelPurpose[];
  supportsAndroid: boolean;
  supportsOnDevice: boolean;
  status: "available" | "server-only" | "not-configured";
};

export type ModelGatewayResult = {
  content: string;
  model: string;
  purpose: ModelPurpose;
  execution: "server";
  fallbackUsed: boolean;
  attempts: number;
};

const DEFAULT_MODEL: ModelCapability = {
  id: "gemini-2.5-flash",
  label: "Genei Managed Model",
  provider: "Manus Forge",
  purposes: ["chat", "lyrics", "prompt", "vision"],
  supportsAndroid: true,
  supportsOnDevice: false,
  status: "available",
};

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

export async function getModelCapabilities(): Promise<{ models: ModelCapability[]; source: "live" | "fallback" }> {
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
    return { models: [{ ...DEFAULT_MODEL, status: "not-configured" }], source: "fallback" };
  }

  try {
    const response = await fetch(`${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/models`, {
      headers: { authorization: `Bearer ${ENV.forgeApiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { models: [DEFAULT_MODEL], source: "fallback" };

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

    return { models: liveModels.length ? liveModels : [DEFAULT_MODEL], source: liveModels.length ? "live" : "fallback" };
  } catch {
    return { models: [DEFAULT_MODEL], source: "fallback" };
  }
}

export async function generateWithModel(args: {
  purpose: ModelPurpose;
  messages: Message[];
  timeoutMs?: number;
  preferredModel?: string;
}): Promise<ModelGatewayResult> {
  const catalog = await getModelCapabilities();
  const catalogModel = catalog.models.find((model) => model.purposes.includes(args.purpose))?.id;
  const candidates = Array.from(new Set([
    args.preferredModel,
    catalogModel,
    DEFAULT_MODEL.id,
  ].filter((model): model is string => Boolean(model))));
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

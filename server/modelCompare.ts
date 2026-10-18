/**
 * Side-by-side model comparison.
 *
 * Send one prompt to several models and report what actually came back: the answer, how
 * long it took, and the status of each. This is the feature every model hub is judged on,
 * and the rule here is that the numbers are **measured**, not estimated — a comparison
 * that invents its latency is worse than no comparison.
 *
 * Runs with bounded concurrency rather than all at once: four simultaneous local models
 * on a laptop is how you turn a comparison into a frozen machine.
 */
import { executeModel, type ChatMessage, type ExecutionOutcome } from "./aiStore";

export type CompareCandidate = {
  modelId: string;
  /** Local runs need the downloaded weights and the runtime; hosted runs need a token. */
  mode: "local" | "hosted";
  localPath?: string;
};

export type CompareResult = {
  modelId: string;
  mode: "local" | "hosted";
  status: "completed" | "failed";
  content?: string;
  error?: string;
  via?: string;
  /** Wall-clock time for this model's run, measured around the call. */
  latencyMs: number;
  /** Characters returned, a rough proxy for verbosity. */
  characters?: number;
};

export type CompareReport = {
  prompt: string;
  results: CompareResult[];
  /** Models that produced a usable answer, fastest first. */
  ranked: string[];
  /** Said plainly, because it is easy to misread a comparison as a benchmark. */
  note: string;
};

const DEFAULT_CONCURRENCY = 2;

/**
 * Run one prompt across several models.
 *
 * A model that fails does not fail the comparison — its failure is reported in its own
 * result, because "this one needs a token" is a useful outcome of a comparison.
 */
export async function compareModels(input: {
  prompt: string;
  candidates: CompareCandidate[];
  system?: string;
  token?: string;
  binaryPath?: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  concurrency?: number;
  /** Injectable for tests. */
  run?: (candidate: CompareCandidate, messages: ChatMessage[]) => Promise<ExecutionOutcome>;
}): Promise<CompareReport> {
  const messages: ChatMessage[] = [];
  if (input.system?.trim()) messages.push({ role: "system", content: input.system.trim() });
  messages.push({ role: "user", content: input.prompt });

  const concurrency = Math.max(1, Math.min(input.concurrency ?? DEFAULT_CONCURRENCY, 4));
  const candidates = input.candidates.slice(0, 4);
  const results: CompareResult[] = new Array(candidates.length);

  const runOne = async (candidate: CompareCandidate): Promise<CompareResult> => {
    const startedAt = Date.now();
    try {
      const outcome = input.run
        ? await input.run(candidate, messages)
        : await executeModel({
            modelId: candidate.modelId,
            messages,
            mode: candidate.mode,
            localPath: candidate.localPath,
            binaryPath: candidate.mode === "local" ? input.binaryPath : undefined,
            baseUrl: input.baseUrl,
            token: candidate.mode === "hosted" ? input.token : undefined,
            maxTokens: input.maxTokens,
            temperature: input.temperature,
          });
      const latencyMs = Date.now() - startedAt;
      if (outcome.status === "completed") {
        return {
          modelId: candidate.modelId,
          mode: candidate.mode,
          status: "completed",
          content: outcome.content,
          via: outcome.via,
          latencyMs,
          characters: outcome.content.length,
        };
      }
      return { modelId: candidate.modelId, mode: candidate.mode, status: "failed", error: outcome.error, via: outcome.via, latencyMs };
    } catch (error) {
      return {
        modelId: candidate.modelId,
        mode: candidate.mode,
        status: "failed",
        error: error instanceof Error ? error.message : "unknown error",
        latencyMs: Date.now() - startedAt,
      };
    }
  };

  // Bounded concurrency: keep `concurrency` runs in flight, take the next as each finishes.
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= candidates.length) return;
      results[index] = await runOne(candidates[index]);
    }
  });
  await Promise.all(workers);

  const ranked = results
    .filter((result) => result.status === "completed")
    .sort((a, b) => a.latencyMs - b.latencyMs)
    .map((result) => result.modelId);

  return {
    prompt: input.prompt,
    results,
    ranked,
    note: "Latency is measured wall-clock time for this machine and this prompt. It is a comparison of these runs, not a benchmark of the models, and it will differ under different load.",
  };
}

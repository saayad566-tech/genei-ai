import { describe, expect, it } from "vitest";
import { classifyModel, readParameterScale, readQuantization, CAPABILITY_LABELS } from "../shared/modelCapabilities";

/**
 * Capability classification.
 *
 * The store's whole value is telling a user what a model is for. A wrong label is worse
 * than no label, so these tests are about two things: that real metadata produces the
 * right capability, and that every label carries the evidence that produced it.
 */

describe("classification from real Hub metadata", () => {
  it("reads a coder model from its name and tags", () => {
    const profile = classifyModel({
      id: "Qwen/Qwen2.5-Coder-7B-Instruct-GGUF",
      pipelineTag: "text-generation",
      tags: ["transformers", "gguf", "code", "codeqwen"],
    });
    expect(profile.primary).toBe("coding");
    const coding = profile.capabilities.find((c) => c.id === "coding");
    expect(coding?.basis).toMatch(/code/i);
    expect(profile.parameterScale).toBe("7B");
  });

  it("separates a vision model from a text model", () => {
    const profile = classifyModel({
      id: "Qwen/Qwen3-VL-8B-Instruct-GGUF",
      pipelineTag: "image-text-to-text",
      tags: ["gguf", "vision", "multimodal"],
    });
    expect(profile.primary).toBe("vision");
    expect(profile.parameterScale).toBe("8B");
  });

  it("recognises speech, embeddings and translation from their pipeline tags", () => {
    expect(classifyModel({ id: "openai/whisper-large-v3", pipelineTag: "automatic-speech-recognition" }).primary).toBe("speech-to-text");
    expect(classifyModel({ id: "BAAI/bge-small-en-v1.5", pipelineTag: "feature-extraction" }).primary).toBe("embeddings");
    expect(classifyModel({ id: "Helsinki-NLP/opus-mt-en-de", pipelineTag: "translation" }).primary).toBe("translation");
    expect(classifyModel({ id: "facebook/bart-large-cnn", pipelineTag: "summarization" }).primary).toBe("summarization");
  });

  it("prefers the strongest signal when several match", () => {
    // The pipeline tag is Hugging Face's own classification and outranks a tag or a name.
    const profile = classifyModel({
      id: "some/coder-model",
      pipelineTag: "automatic-speech-recognition",
      tags: ["code"],
    });
    expect(profile.primary).toBe("speech-to-text");
    expect(profile.capabilities.find((c) => c.id === "speech-to-text")?.confidence).toBeGreaterThan(
      profile.capabilities.find((c) => c.id === "coding")?.confidence ?? 0,
    );
  });

  it("keeps the strongest evidence for a capability, not the last one seen", () => {
    const profile = classifyModel({
      id: "org/model",
      tags: ["chat", "instruct"],
    });
    const chat = profile.capabilities.find((c) => c.id === "chat");
    expect(chat?.confidence).toBe(0.7); // the stronger of the two chat rules
  });
});

describe("honesty", () => {
  it("reports general rather than guessing when nothing matches", () => {
    const profile = classifyModel({ id: "org/some-unnamed-thing" });
    expect(profile.primary).toBe("general");
    expect(profile.capabilities).toEqual([]);
    expect(profile.notes.join(" ")).toMatch(/reported as general rather than guessed/i);
  });

  it("names the basis for every capability it returns", () => {
    const profile = classifyModel({ id: "Qwen/Qwen2.5-Coder-7B-Instruct", pipelineTag: "text-generation", tags: ["code"] });
    expect(profile.capabilities.length).toBeGreaterThan(0);
    for (const capability of profile.capabilities) {
      expect(capability.basis.length, `${capability.id} has no stated basis`).toBeGreaterThan(5);
      expect(capability.confidence).toBeGreaterThan(0);
      expect(capability.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("flags gated and disabled repositories", () => {
    expect(classifyModel({ id: "meta-llama/Llama-3-8B", gated: true }).notes.join(" ")).toMatch(/gated/i);
    expect(classifyModel({ id: "org/model", disabled: true }).notes.join(" ")).toMatch(/disabled/i);
  });

  it("says so when a pipeline tag has no mapping instead of silently dropping it", () => {
    const profile = classifyModel({ id: "org/model", pipelineTag: "some-new-task" });
    expect(profile.notes.join(" ")).toMatch(/no mapping here/i);
  });
});

describe("metadata extraction", () => {
  it("reads the parameter scale from the name", () => {
    expect(readParameterScale("Qwen/Qwen2.5-7B-Instruct")).toBe("7B");
    expect(readParameterScale("Qwen/Qwen2.5-1.5B-Instruct-GGUF")).toBe("1.5B");
    expect(readParameterScale("org/model-32B")).toBe("32B");
    expect(readParameterScale("org/model")).toBeUndefined();
  });

  it("reads the quantisation from the name or the GGUF block", () => {
    expect(readQuantization({ id: "org/model-Q4_K_M-GGUF" })).toBe("Q4_K_M");
    expect(readQuantization({ id: "org/model", gguf: { quantization: "Q5_K_S" } })).toBe("Q5_K_S");
    expect(readQuantization({ id: "org/model" })).toBeUndefined();
  });

  it("has a human label for every capability", () => {
    for (const id of ["chat", "coding", "vision", "general"] as const) {
      expect(CAPABILITY_LABELS[id]).toBeTruthy();
    }
  });
});

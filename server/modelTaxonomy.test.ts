import { describe, expect, it } from "vitest";
import {
  categorise, CAPABILITY_DOMAIN, readLanguages, readLicence, readLineage,
  sizeClassOf, MODEL_DOMAINS, RUNNABILITY, SIZE_CLASSES,
} from "../shared/modelTaxonomy";
import { classifyModel } from "../shared/modelCapabilities";

/**
 * The taxonomy the store browses by.
 *
 * The point of these tests is that every dimension is derived from real metadata, that a
 * dimension which cannot be determined says so, and that the licence distinction — the
 * one with legal consequences — never implies safety it has not established.
 */

const profileFor = (meta: Parameters<typeof classifyModel>[0]) => classifyModel(meta).capabilities;

describe("domains", () => {
  it("assigns every capability to a domain", () => {
    for (const [capability, domain] of Object.entries(CAPABILITY_DOMAIN)) {
      expect(MODEL_DOMAINS, `${capability} maps to an unknown domain`).toContain(domain);
    }
  });

  it("places a coder model in the code domain", () => {
    const meta = { id: "Qwen/Qwen2.5-Coder-7B-Instruct-GGUF", pipelineTag: "text-generation", tags: ["gguf", "code"] };
    const category = categorise({ ...meta, hasGguf: true, parameterScale: "7B", capabilities: profileFor(meta) });
    expect(category.domains).toContain("code");
  });

  it("places a vision model in vision and multimodal", () => {
    const meta = { id: "Qwen/Qwen3-VL-8B-Instruct-GGUF", pipelineTag: "image-text-to-text", tags: ["gguf", "vision"] };
    const category = categorise({ ...meta, hasGguf: true, parameterScale: "8B", capabilities: profileFor(meta) });
    expect(category.domains).toContain("vision");
    // Two input modalities is what makes it multimodal.
    expect(category.domains).toContain("multimodal");
  });

  it("falls back to 'other' rather than leaving the domain empty", () => {
    const category = categorise({ id: "org/mystery", capabilities: [] });
    expect(category.domain).toBe("other");
    expect(category.unknown).toContain("modality");
  });
});

describe("modality", () => {
  it("reads the input and output shape from the pipeline tag, and names the basis", () => {
    const category = categorise({ id: "x/y", pipelineTag: "text-to-speech", capabilities: [] });
    expect(category.modality.input).toEqual(["text"]);
    expect(category.modality.output).toEqual(["audio"]);
    expect(category.modality.basis).toMatch(/pipeline tag/);
  });

  it("infers from tags when there is no pipeline tag", () => {
    const category = categorise({ id: "x/y", tags: ["audio", "asr"], capabilities: [] });
    expect(category.modality.input).toContain("audio");
    expect(category.modality.basis).toMatch(/audio-related tag/);
  });
});

describe("size classes", () => {
  it("classifies by parameter count at the boundaries that matter", () => {
    expect(sizeClassOf("1.5B")).toBe("tiny");
    expect(sizeClassOf("7B")).toBe("small");   // the canonical small consumer model
    expect(sizeClassOf("8B")).toBe("medium");
    expect(sizeClassOf("13B")).toBe("medium");
    expect(sizeClassOf("70B")).toBe("large");  // the largest commonly self-hosted size
    expect(sizeClassOf("405B")).toBe("xl");
    expect(sizeClassOf(undefined)).toBe("unknown");
    expect(sizeClassOf("not-a-size")).toBe("unknown");
  });

  it("has a label for every class", () => {
    expect(SIZE_CLASSES.length).toBe(6);
  });

  it("reports size as unknown rather than guessing", () => {
    const category = categorise({ id: "org/model", capabilities: [] });
    expect(category.sizeClass).toBe("unknown");
    expect(category.unknown).toContain("size");
  });
});

describe("runability", () => {
  it("calls a GGUF repository locally runnable", () => {
    const category = categorise({ id: "org/model-Q4_K_M-GGUF", hasGguf: true, capabilities: [] });
    expect(category.runability).toBe("local-gguf");
    expect(RUNNABILITY).toContain(category.runability);
  });

  it("distinguishes a local format that is not GGUF", () => {
    const category = categorise({ id: "org/model", hasGguf: false, hasOtherWeights: true, capabilities: [] });
    expect(category.runability).toBe("local-runtime");
  });

  it("recognises an adapter, which cannot be run alone", () => {
    const category = categorise({ id: "org/lora-adapter", tags: ["base_model:adapter:meta-llama/Llama-3-8B"], capabilities: [] });
    expect(category.runability).toBe("adapter");
  });
});

describe("lineage", () => {
  it("reads a plain base model as a finetune", () => {
    const lineage = readLineage(["base_model:Qwen/Qwen2.5-7B-Instruct"]);
    expect(lineage.baseModels).toEqual(["Qwen/Qwen2.5-7B-Instruct"]);
    expect(lineage.relation).toBe("finetune");
  });

  it("reads the relation from the tag when it states one", () => {
    expect(readLineage(["base_model:quantized:Qwen/Qwen2.5-7B-Instruct"]).relation).toBe("quantized");
    expect(readLineage(["base_model:peft:org/base"]).relation).toBe("adapter");
  });

  it("treats several base models as a merge", () => {
    const lineage = readLineage(["base_model:org/a", "base_model:org/b"]);
    expect(lineage.relation).toBe("merge");
    expect(lineage.baseModels).toHaveLength(2);
  });

  it("says base when there is no lineage information", () => {
    expect(readLineage([]).relation).toBe("base");
  });
});

describe("licence", () => {
  it("marks a permissive licence as permissive", () => {
    expect(readLicence(["license:apache-2.0"])).toMatchObject({ id: "apache-2.0", permissive: true });
    expect(readLicence(["license:mit"]).permissive).toBe(true);
  });

  it("does not imply a restricted licence is safe", () => {
    const llama = readLicence(["license:llama3"]);
    expect(llama.permissive).toBe(false);
    expect(llama.note).toMatch(/usage conditions/i);
  });

  it("treats an unrecognised licence as unverified rather than permissive", () => {
    const other = readLicence(["license:some-new-licence"]);
    expect(other.permissive).toBe(false);
    expect(other.note).toMatch(/not on the permissive list/i);
  });

  it("says the terms are unknown when nothing is declared", () => {
    const unknown = readLicence([]);
    expect(unknown.id).toBe("unknown");
    expect(unknown.permissive).toBe(false);
    expect(unknown.note).toMatch(/check the repository/i);
  });

  it("prefers the model card over a tag", () => {
    expect(readLicence(["license:mit"], { license: "apache-2.0" }).id).toBe("apache-2.0");
  });
});

describe("languages", () => {
  it("reads bare language codes and ignores everything else", () => {
    const languages = readLanguages(["en", "fr", "de", "gguf", "text-generation", "license:mit", "base_model:org/x", "code"]);
    expect(languages).toEqual(["de", "en", "fr"]);
  });

  it("keeps English, which is a language despite also being a common tag", () => {
    expect(readLanguages(["en"])).toEqual(["en"]);
  });

  it("returns nothing rather than inventing a language", () => {
    expect(readLanguages(["gguf", "transformers"])).toEqual([]);
  });
});

describe("the full categorisation", () => {
  it("produces every dimension for a real model", () => {
    const meta = {
      id: "bartowski/Qwen2.5-7B-Instruct-GGUF",
      pipelineTag: "text-generation",
      tags: ["gguf", "chat", "en", "license:apache-2.0", "base_model:Qwen/Qwen2.5-7B-Instruct"],
    };
    const category = categorise({ ...meta, hasGguf: true, parameterScale: "7B", capabilities: profileFor(meta) });
    expect(category.domain).toBe("language");
    expect(category.modality.input).toEqual(["text"]);
    expect(category.sizeClass).toBe("small");
    expect(category.runability).toBe("local-gguf");
    expect(category.lineage.relation).toBe("finetune");
    expect(category.licence.permissive).toBe(true);
    expect(category.languages).toContain("en");
    expect(category.unknown).toEqual([]);
  });
});

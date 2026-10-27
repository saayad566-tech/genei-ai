import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  bandFor,
  PASS_THRESHOLD,
  parseScore,
  reviewTakes,
  scoreConfigFromEnv,
  scoreIdentity,
  SCORE_CAVEATS,
  SCORER_REQUIREMENT,
  STRONG_THRESHOLD,
} from "./visualContinuity";

/**
 * Visual continuity.
 *
 * The scoring path is exercised with an injected fetch so the parsing, bounds and caveats are
 * deterministic. The point of most of these tests is not that scoring works — it is that the
 * result cannot be mistaken for a guarantee.
 */

let sandbox: string;
let reference: string;
let take: string;

beforeAll(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "genei-visual-"));
  reference = path.join(sandbox, "ref.jpg");
  take = path.join(sandbox, "take.jpg");
  await fs.writeFile(reference, Buffer.alloc(512, 1));
  await fs.writeFile(take, Buffer.alloc(512, 2));
});

afterAll(async () => {
  await fs.rm(sandbox, { recursive: true, force: true });
});

const CONFIG = { baseUrl: "http://scorer/v1", model: "face-embedding" };

function fakeScorer(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
}

describe("parseScore", () => {
  it("accepts a 0-100 score", () => {
    expect(parseScore({ score: 82.4 })?.score).toBe(82.4);
  });

  it("accepts a 0-1 similarity and converts it", () => {
    expect(parseScore({ similarity: 0.9 })?.score).toBe(90);
  });

  it("accepts a -1..1 cosine and converts it", () => {
    expect(parseScore({ cosine: 0 })?.score).toBe(50);
  });

  it("refuses an out-of-range score rather than clamping it", () => {
    // A scorer returning 250 is broken. Silently turning that into 100 would hide the fault.
    expect(parseScore({ score: 250 })).toBeNull();
    expect(parseScore({ score: -5 })).toBeNull();
  });

  it("refuses a non-numeric score", () => {
    expect(parseScore({ score: "high" })).toBeNull();
    expect(parseScore({})).toBeNull();
    expect(parseScore(null)).toBeNull();
  });

  it("defaults faces to 1 when the scorer does not say", () => {
    expect(parseScore({ score: 80 })?.facesDetected).toBe(1);
  });
});

describe("bands", () => {
  it("uses the field convention: 70 passes, 85 is strong", () => {
    expect(PASS_THRESHOLD).toBe(70);
    expect(STRONG_THRESHOLD).toBe(85);
    expect(bandFor(69.9)).toBe("weak");
    expect(bandFor(70)).toBe("pass");
    expect(bandFor(84.9)).toBe("pass");
    expect(bandFor(85)).toBe("strong");
  });
});

describe("configuration", () => {
  it("is null when nothing is configured", () => {
    const saved = process.env.GENEI_EMBEDDING_URL;
    delete process.env.GENEI_EMBEDDING_URL;
    expect(scoreConfigFromEnv()).toBeNull();
    if (saved !== undefined) process.env.GENEI_EMBEDDING_URL = saved;
  });

  it("names a concrete thing to install when unavailable", () => {
    expect(SCORER_REQUIREMENT).toMatch(/GENEI_EMBEDDING_URL/);
    expect(SCORER_REQUIREMENT).toMatch(/insightface|facenet|embeddings/i);
  });
});

describe("scoreIdentity", () => {
  it("is unavailable with a requirement when no scorer is configured", async () => {
    const result = await scoreIdentity({ referencePaths: [reference], takePath: take }, null);
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") expect(result.reason).toMatch(/GENEI_EMBEDDING_URL/);
  });

  it("is unavailable when there is no reference to compare against", async () => {
    const result = await scoreIdentity({ referencePaths: [], takePath: take }, CONFIG, fakeScorer({ score: 90 }));
    expect(result.status).toBe("unavailable");
  });

  it("is unavailable when an image is missing", async () => {
    const result = await scoreIdentity(
      { referencePaths: [reference], takePath: path.join(sandbox, "nope.jpg") },
      CONFIG,
      fakeScorer({ score: 90 }),
    );
    expect(result.status).toBe("unavailable");
  });

  it("scores a good take and reports a basis", async () => {
    const result = await scoreIdentity({ referencePaths: [reference], takePath: take }, CONFIG, fakeScorer({ score: 88 }));
    expect(result.status).toBe("scored");
    if (result.status === "scored") {
      expect(result.score).toBe(88);
      expect(result.band).toBe("strong");
      expect(result.basis).toContain("ref.jpg");
    }
  });

  it("ALWAYS carries the caveats — a number without them invites over-trust", async () => {
    const result = await scoreIdentity({ referencePaths: [reference], takePath: take }, CONFIG, fakeScorer({ score: 88 }));
    expect(result.caveats.length).toBeGreaterThanOrEqual(SCORE_CAVEATS.length);
    expect(result.caveats.join(" ")).toMatch(/not a guarantee/i);
  });

  it("warns that a multi-face take makes the score unreliable", async () => {
    const result = await scoreIdentity(
      { referencePaths: [reference], takePath: take },
      CONFIG,
      fakeScorer({ score: 80, faces: 3 }),
    );
    expect(result.status).toBe("scored");
    if (result.status === "scored") {
      expect(result.facesDetected).toBe(3);
      expect(result.caveats.join(" ")).toMatch(/3 faces/i);
    }
  });

  it("warns when no face was found", async () => {
    const result = await scoreIdentity(
      { referencePaths: [reference], takePath: take },
      CONFIG,
      fakeScorer({ score: 0, faces: 0 }),
    );
    expect(result.status).toBe("scored");
    if (result.status === "scored") expect(result.caveats.join(" ")).toMatch(/no face/i);
  });

  it("is unavailable on a non-200 reply", async () => {
    const result = await scoreIdentity({ referencePaths: [reference], takePath: take }, CONFIG, fakeScorer({}, 500));
    expect(result.status).toBe("unavailable");
  });

  it("is unavailable when the scorer returns an unbounded number", async () => {
    const result = await scoreIdentity({ referencePaths: [reference], takePath: take }, CONFIG, fakeScorer({ score: 999 }));
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") expect(result.reason).toMatch(/bounded similarity/i);
  });

  it("is unavailable when the scorer cannot be reached", async () => {
    const failing = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const result = await scoreIdentity({ referencePaths: [reference], takePath: take }, CONFIG, failing);
    expect(result.status).toBe("unavailable");
  });
});

describe("reviewTakes", () => {
  it("separates unscored takes from failing ones", async () => {
    // "We could not check this" and "we checked and it is wrong" are different facts.
    const summary = await reviewTakes([take, path.join(sandbox, "missing.jpg")], [reference], null, fakeScorer({ score: 90 }));
    expect(summary.unscored).toContain(path.join(sandbox, "missing.jpg"));
    expect(summary.belowThreshold).toEqual([]);
    expect(summary.note).toMatch(/NOT counted as passing/i);
  });

  it("flags takes below the threshold", async () => {
    const summary = await reviewTakes([take], [reference], CONFIG, fakeScorer({ score: 40 }));
    expect(summary.belowThreshold).toEqual([take]);
    expect(summary.note).toMatch(/below the 70 threshold/i);
  });

  it("never presents a score as a decision", async () => {
    const summary = await reviewTakes([take], [reference], CONFIG, fakeScorer({ score: 95 }));
    expect(summary.note).toMatch(/the decision is yours/i);
  });

  it("handles an empty take list", async () => {
    const summary = await reviewTakes([], [reference], CONFIG, fakeScorer({ score: 90 }));
    expect(summary.reviews).toEqual([]);
  });
});

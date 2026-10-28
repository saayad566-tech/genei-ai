import { describe, expect, it, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Face scorer, end to end.
 *
 * Runs the real ONNX models through the real script and asserts the score DISCRIMINATES —
 * because a scorer that returns a plausible number for everything is worse than one that
 * returns nothing. The three cases below are the whole contract:
 *
 *   same face      -> ~100
 *   different face -> near the unrelated midpoint, well below the pass threshold
 *   no face        -> reported as no face, never as a score of zero
 *
 * Skips with a stated reason when the models or opencv are absent — never passes silently.
 */

const MODEL_DIR = process.env.GENEI_FACE_MODEL_DIR ?? "/scratch/work/face";
const SCRIPT = path.resolve(process.cwd(), "scripts", "score_faces.py");
const PYTHON = process.env.GENEI_PYTHON_BIN ?? "python3";

function haveModels(): boolean {
  return existsSync(path.join(MODEL_DIR, "detection.onnx")) && existsSync(path.join(MODEL_DIR, "arcface.onnx"));
}

function haveOpenCv(): boolean {
  try {
    execFileSync(PYTHON, ["-c", "import cv2, onnxruntime, numpy"], { stdio: "ignore", timeout: 30_000 });
    return true;
  } catch {
    return false;
  }
}

const available = haveModels() && haveOpenCv();

let sandbox: string;
let faceA: string;
let faceB: string;
let noFace: string;

/** A real face image, taken from the OpenCV sample set. */
const FACE_A_URL = "https://raw.githubusercontent.com/opencv/opencv/master/samples/data/lena.jpg";
const FACE_B_URL = "https://raw.githubusercontent.com/opencv/opencv/master/samples/data/messi5.jpg";

async function download(url: string, dest: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    const buffer = Buffer.from(await response.arrayBuffer());
    // A JPEG starts FF D8 — a 200 response carrying an HTML error page must not pass.
    if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return false;
    await fs.writeFile(dest, buffer);
    return true;
  } catch {
    return false;
  }
}

function score(reference: string, take: string): Record<string, unknown> {
  const raw = execFileSync(PYTHON, [SCRIPT, "--reference", reference, "--take", take, "--model-dir", MODEL_DIR], {
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return JSON.parse(raw.trim()) as Record<string, unknown>;
}

beforeAll(async () => {
  sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "genei-face-e2e-"));
  faceA = path.join(sandbox, "a.jpg");
  faceB = path.join(sandbox, "b.jpg");
  noFace = path.join(sandbox, "none.jpg");

  if (available) {
    await download(FACE_A_URL, faceA);
    await download(FACE_B_URL, faceB);
    // A plain grey image: no face, and the scorer must say so rather than scoring 0.
    execFileSync(
      PYTHON,
      ["-c", `import numpy, cv2; cv2.imwrite(${JSON.stringify(noFace)}, numpy.full((512,512,3), 128, numpy.uint8))`],
      { stdio: "ignore", timeout: 60_000 },
    );
  }
});

describe.skipIf(!available)("face scorer discrimination", () => {
  it("scores the same face against itself at the maximum", { timeout: 240_000 }, () => {
    const result = score(faceA, faceA);
    expect(result.error).toBeUndefined();
    expect(Number(result.score)).toBeGreaterThan(99);
    expect(Number(result.faces)).toBe(1);
  });

  it("scores a DIFFERENT person well below the pass threshold", { timeout: 240_000 }, () => {
    // This is the assertion that makes the scorer meaningful. A model returning a high score
    // for any two faces would pass the previous test and be useless.
    const result = score(faceA, faceB);
    expect(result.error).toBeUndefined();
    const different = Number(result.score);
    expect(different).toBeLessThan(70);
    expect(different).toBeGreaterThan(30); // and not absurdly low: unrelated faces sit near 50
  });

  it("reports no face rather than a score of zero", { timeout: 240_000 }, () => {
    const result = score(faceA, noFace);
    expect(result.error).toBe("no face found in the take");
    expect(result.score).toBeUndefined();
  });

  it("detects exactly one face in a single-portrait image", { timeout: 240_000 }, () => {
    const result = score(faceA, faceA);
    expect(Number(result.referenceFaces)).toBe(1);
    expect(Number(result.takeFaces)).toBe(1);
  });
});

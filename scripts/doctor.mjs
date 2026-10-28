#!/usr/bin/env node
/**
 * Doctor — check every toolchain dependency this platform needs.
 *
 * Run it before blaming the app:
 *
 *     node scripts/doctor.mjs
 *     node scripts/doctor.mjs --json     # machine-readable
 *
 * Exit code 0 when everything REQUIRED is present, 1 when something required is missing.
 * Optional capabilities report their status without failing the run, because a platform that
 * refuses to start without a GPU is a platform nobody can run.
 *
 * The report distinguishes three states, and the distinction is the point:
 *
 *   required   — the app cannot function without it
 *   optional   — a feature degrades without it, and says which feature
 *   unverified — present but not exercised, so it is not called working
 */

import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const JSON_OUT = process.argv.includes("--json");
const checks = [];

function record(name, status, detail, fix, kind = "optional") {
  checks.push({ name, status, detail, fix, kind });
}

/** Does a binary exist and actually run? Presence on PATH is not proof it executes. */
function checkBinary(name, envVar, args = ["--version"], kind = "required") {
  const configured = envVar ? process.env[envVar]?.trim() : undefined;
  const candidate = configured || name;
  try {
    const out = execFileSync(candidate, args, { encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "ignore"] });
    record(name, "ok", (out.split("\n")[0] || "").slice(0, 90), null, kind);
    return true;
  } catch (error) {
    record(
      name,
      "missing",
      configured ? `${envVar}=${configured} did not run` : "not on PATH",
      configured ? `Check that ${envVar} points at a working binary.` : `Install ${name}, or set ${envVar || "the matching env var"}.`,
      kind,
    );
    return false;
  }
}

function checkFile(label, filePath, envVar, kind = "optional") {
  if (!filePath) {
    record(label, "missing", `${envVar} is not set`, `Set ${envVar} to a file on disk.`, kind);
    return false;
  }
  if (!existsSync(filePath)) {
    record(label, "missing", `${filePath} does not exist`, `Point ${envVar} at an existing file.`, kind);
    return false;
  }
  const size = statSync(filePath).size;
  if (size === 0) {
    record(label, "missing", `${filePath} is empty (0 bytes)`, `Re-download the file.`, kind);
    return false;
  }
  record(label, "ok", `${(size / 1024 ** 2).toFixed(1)} MB at ${filePath}`, null, kind);
  return true;
}

function checkEnv(label, envVar, kind = "optional", note = "") {
  const value = process.env[envVar]?.trim();
  if (value) record(label, "ok", `${envVar} is set`, null, kind);
  else record(label, "missing", `${envVar} is not set${note ? ` — ${note}` : ""}`, `Set ${envVar}.`, kind);
  return Boolean(value);
}

/* ------------------------------------------------------------------ *
 * Required: nothing runs without these
 * ------------------------------------------------------------------ */

const nodeMajor = Number(process.versions.node.split(".")[0]);
record(
  "node",
  nodeMajor >= 20 ? "ok" : "missing",
  `v${process.versions.node}`,
  nodeMajor >= 20 ? null : "Node 20 or newer is required.",
  "required",
);

checkBinary("ffmpeg", "GENEI_FFMPEG_BIN", ["-version"], "required");

// ffprobe ships beside ffmpeg and is derived from it, exactly as the media adapter does.
// Checking PATH alone would report it missing on a machine that has a perfectly good pair
// configured through GENEI_FFMPEG_BIN.
{
  const configured = process.env.GENEI_FFMPEG_BIN?.trim();
  const derived = configured
    ? configured.replace(/ffmpeg(\.exe)?$/i, process.platform === "win32" ? "ffprobe.exe" : "ffprobe")
    : "ffprobe";
  try {
    const out = execFileSync(derived, ["-version"], { encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "ignore"] });
    record("ffprobe", "ok", (out.split("\n")[0] || "").slice(0, 90), null, "required");
  } catch {
    record("ffprobe", "missing", `could not run ${derived}`, "ffprobe ships with ffmpeg; install both or set GENEI_FFMPEG_BIN to the ffmpeg that sits beside ffprobe.", "required");
  }
}

/* ------------------------------------------------------------------ *
 * Speech — Piper, local and offline
 * ------------------------------------------------------------------ */

const piperBin = process.env.GENEI_PIPER_BIN?.trim();
const piperVoice = process.env.GENEI_PIPER_VOICE?.trim();
if (piperBin) checkBinary("piper", "GENEI_PIPER_BIN", ["--help"], "optional");
else record("piper", "missing", "GENEI_PIPER_BIN is not set", "Download Piper and set GENEI_PIPER_BIN.", "optional");
checkFile("piper voice model", piperVoice, "GENEI_PIPER_VOICE", "optional");

/* ------------------------------------------------------------------ *
 * Vision — face embeddings, local and offline
 * ------------------------------------------------------------------ */

const faceDir = process.env.GENEI_FACE_MODEL_DIR?.trim();
if (faceDir) {
  checkFile("face detection model", path.join(faceDir, "detection.onnx"), "GENEI_FACE_MODEL_DIR", "optional");
  checkFile("face recognition model", path.join(faceDir, "arcface.onnx"), "GENEI_FACE_MODEL_DIR", "optional");
} else {
  record(
    "face models",
    "missing",
    "GENEI_FACE_MODEL_DIR is not set",
    "Download insightface buffalo_l detection.onnx and arcface.onnx into one directory and set GENEI_FACE_MODEL_DIR.",
    "optional",
  );
}

/* ------------------------------------------------------------------ *
 * Language models and services
 * ------------------------------------------------------------------ */

checkEnv("vision model (video analysis)", "GENEI_VLM_URL", "optional", "needed to analyse an uploaded video");
checkEnv("local LLM", "GENEI_LLAMA_URL", "optional", "needed for local text generation");
checkEnv("ComfyUI", "GENEI_COMFY_URL", "optional", "needed to render images and video");
checkEnv("speech server", "GENEI_SPEECH_URL", "optional", "an alternative to local Piper");
checkEnv("identity scorer service", "GENEI_EMBEDDING_URL", "optional", "an alternative to local face models");

/* ------------------------------------------------------------------ *
 * Storage
 * ------------------------------------------------------------------ */

const dataDir = process.env.GENEI_DESKTOP_DATA_DIR?.trim() || path.join(os.homedir(), ".genei");
try {
  execFileSync("mkdir", ["-p", dataDir]);
  record("data directory", "ok", dataDir, null, "required");
} catch {
  record("data directory", "missing", `cannot create ${dataDir}`, "Check permissions on the parent directory.", "required");
}

const hasDb = Boolean(process.env.DATABASE_URL?.trim());
record(
  "database",
  hasDb ? "ok" : "absent",
  hasDb ? "DATABASE_URL is set" : "not set — projects are stored as files instead",
  hasDb ? null : "Optional. Without it, continuity projects persist to JSON files in the data directory.",
  "optional",
);

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

const required = checks.filter((c) => c.kind === "required");
const failedRequired = required.filter((c) => c.status === "missing");
const missingOptional = checks.filter((c) => c.kind === "optional" && c.status === "missing");

if (JSON_OUT) {
  console.log(JSON.stringify({ checks, ok: failedRequired.length === 0 }, null, 2));
  process.exit(failedRequired.length === 0 ? 0 : 1);
}

const MARK = { ok: "OK  ", missing: "MISS", absent: "--  " };
console.log("\nGenei AI — toolchain doctor\n");
for (const c of checks) {
  console.log(`  ${MARK[c.status] ?? c.status}  ${c.name.padEnd(30)} ${c.detail}`);
  if (c.status === "missing" && c.fix) console.log(`           -> ${c.fix}`);
}

console.log("");
if (failedRequired.length > 0) {
  console.log(`  ${failedRequired.length} required dependency(ies) missing. The app cannot run until these are installed.`);
} else {
  console.log("  All required dependencies are present.");
}
if (missingOptional.length > 0) {
  console.log(`  ${missingOptional.length} optional capability(ies) unavailable — the app runs, and each feature says what it needs.`);
}
console.log("");

process.exit(failedRequired.length === 0 ? 0 : 1);

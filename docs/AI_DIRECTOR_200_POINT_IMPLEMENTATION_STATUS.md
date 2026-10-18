# AI Director — Implementation Status and Traceability

This document is the traceability record the specification asks for. Every capability is
classified as **IMPLEMENTED**, **PARTIALLY_IMPLEMENTED**, **BLOCKED** or
**NOT_IMPLEMENTED**, and — as the specification insists — a capability is not called
IMPLEMENTED merely because a typed interface exists. Where a capability requires
execution, the execution path that was actually exercised is named.

The full requirement-by-requirement mapping, including the logic / architecture /
execution-plan check for each item, lives in `REQUIREMENTS_CHECKLIST.md` at the repository
root. This file is the capability summary.

---

## IMPLEMENTED

Each of these has a real execution path, not only a contract.

| Capability | Execution path |
|---|---|
| Project Brain (entities, events, evidence, confidence) | `ai_director/brain.py`, exercised by `test_ai_director_200.py` |
| Production Constitution + validation | `brain.py` `validate_constitution` |
| **Film Blueprint** (logline, theme, acts, sequences, beats) | `ai_director/film_blueprint.py`, 12 tests |
| Brief decomposition into scenes and shots | `ai_director/director.py` `decompose_brief` |
| Shot and scene contracts | `ai_director/models.py` |
| DAG compilation | `ai_director/dag_compiler.py` through the Node→Python bridge, with a TypeScript fallback (`server/directorCompiler.ts`) |
| Persisted project / scene / shot / job / QC state | Drizzle schema + migrations (19 tables, in parity) |
| Capability routing | `ai_director/router_registry.py`, `server/adapters/index.ts` |
| **Take selection** (score, continuity, technical, Director requirements; append-only) | `ai_director/take_selection.py`, 15 tests |
| **Resumable production** (never regenerate approved work) | `ai_director/resume.py`, 8 tests |
| Continuity engine (packets, bridges, transition fingerprints) | `ai_director/continuity.py` |
| Deterministic reviewer (real ffprobe readback) | `FfmpegAdapter.probe`, `mediaPipeline.e2e.test.ts` |
| AI reviewer (UNKNOWN is never PASS) | `server/adapters/vlmReviewer.ts` |
| Automatic repair loop | `ai_director/repair_manager.py` |
| Media worker planning | `ai_director/media_worker.py` |
| **Resource-aware queue** (one heavy job, 60% RAM budget, pressure pause) | `server/jobQueue.ts`, 10 low-end tests across 0.5–64 GB |
| Hardware detection and readiness self-test | `server/adapters/selfTest.ts` |
| Tool registry (10 tools, official sources) | `server/modelRegistry.ts` |
| One-click install with real release resolution and checksum verification | `server/toolReleases.ts`, `server/assetDownloader.ts` |
| Model weights resolved live from the Hugging Face Hub | `server/modelWeights.ts` |
| Execution-plane adapters: ComfyUI, FFmpeg, whisper.cpp, MuseTalk, Wav2Lip, Video2X, Real-ESRGAN, VLM reviewer, **llama.cpp** | `server/adapters/` — protocol-verified against a mock ComfyUI, real subprocesses and real media |
| Frame-to-video contract with capability gating | `shared/frameVideo.ts` |
| **Cinematic motion kept as five separate instructions** | `shared/frameVideo.ts`, `models.py` |
| **Frame interpolation as a capability distinct from frames-to-video** | `shared/frameVideo.ts`, 7 tests |
| Director Console with DAG dependency dashboard and job controls | `client/src/pages/DirectorConsole.tsx` |
| BYOH telemetry and runner pairing | `client/src/components/ByohMonitorPanel.tsx`, runner client |
| Outbound networking through an environment proxy | `server/_core/network.ts` |
| Windows packaging | `electron-builder` — see below |
| Prompt and safety guardrails on every delegation | `server/directorGuardrails.ts` |
| Live web context for models that lack it | `server/browsingAdapter.ts` |

## PARTIALLY_IMPLEMENTED

| Capability | What exists | What is missing |
|---|---|---|
| Code signing | The certificate generator, the pipeline and real Authenticode verification | A **CA-issued** certificate. A self-signed one is trusted only where it is installed. |
| Hosted provider video | Runway, Kling and HeyGen implemented against their published contracts, with 13 wire-format tests | A live submission, which needs the user's own provider key. Pika publishes no documented public API and is reported as such. |
| Full multi-format source extraction | Document ingestion and the Project Brain | Video and audio source extraction |
| Persistent Project Brain version APIs | The Brain is built and persisted | Versioned retrieval through an API |

## BLOCKED

| Capability | Blocked on |
|---|---|
| Real GPU render | Actual GPU hardware. The adapters are verified against a mock ComfyUI, real subprocesses and real media; a render needs the machine that has the card. `adapters.selfTest` completes it on that machine. |
| Signed public EXE distribution | A CA-issued code-signing certificate. |
| GitHub Actions builds for this repository | The repository is **private** and its metered Actions minutes are spent. `analyzerx` is public and builds fine on the same account. The GitLab / Woodpecker pipelines and `./build.sh` are the shipped way around it. |

## NOT_IMPLEMENTED

| Capability | Note |
|---|---|
| Frame-level identity and optical-flow analysis | Not attempted. The continuity engine works on declared state, not on pixel analysis. |
| Arbitrary open-source plugin installation | The registry is a curated set of ten tools. Installing an arbitrary third-party plugin is not supported. |

---

## The Windows deliverable

An earlier revision of this document stated that "the Linux sandbox cannot generate a
genuine Windows PE executable" and that a PyInstaller workflow on a Windows host was
required. **That is no longer true, and it was wrong to leave it standing.**

`electron-builder` bundles its own wine, so a Windows target builds on Linux. This was
executed, and the output verified as **PE32+ executable (GUI) x86-64, 14 sections**, with
the packaged application content checked inside the asar. The packaged app is delivered as
`Genei-AI-Desktop-Windows-Portable.zip`.

What remains true: the **NSIS installer** cannot be produced in a constrained sandbox,
because `makensis` is killed while embedding the ~438 MB payload under a 1.5 GB virtual
memory limit. That is an environment ceiling, not a capability of the code. A machine with
more memory, or the included CI workflow, produces the installer.

## What is not claimed

The UI does not represent any BLOCKED or NOT_IMPLEMENTED item as production-complete. The
tool registry reports `needs_source` rather than inventing a download; the reviewer reports
UNKNOWN rather than passing an unjudged take; an adapter reports `not_installed` rather
than claiming readiness; and the hosted providers report the provider's own error rather
than a fabricated success.

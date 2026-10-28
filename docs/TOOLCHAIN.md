# Toolchain

Every dependency this platform needs, what it unlocks, and how to install it.

**Check your machine first:**

```sh
node scripts/doctor.mjs          # human-readable
node scripts/doctor.mjs --json   # machine-readable
```

Exit code 0 means every *required* dependency is present. Optional capabilities report their
status without failing the run — a platform that refuses to start without a GPU is a platform
nobody can run.

---

## Required

| Tool | Version | Why | Install |
|---|---|---|---|
| **Node.js** | 20+ | the server and the build | [nodejs.org](https://nodejs.org) |
| **pnpm** | 10.4.1 | package manager, pinned in `packageManager` | `npm i -g pnpm@10.4.1` |
| **ffmpeg** | any recent | probe, frame extraction, assembly, transcoding | Debian: `apt install ffmpeg` · macOS: `brew install ffmpeg` · Windows: `winget install ffmpeg` · or `pip install static-ffmpeg` |
| **ffprobe** | ships with ffmpeg | reads real duration, resolution, codec | comes with ffmpeg — do not install separately |

`GENEI_FFMPEG_BIN` points at a specific ffmpeg; ffprobe is derived from it automatically, so
a pair in a non-standard location needs one variable, not two.

---

## Speech — local, offline, no API key

| Tool | Size | Why | Install |
|---|---|---|---|
| **Piper** | ~26 MB | text-to-speech on CPU, offline | [rhasspy/piper releases](https://github.com/rhasspy/piper/releases) |
| **A voice model** | ~60 MB | the voice itself | [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices) |

```sh
export GENEI_PIPER_BIN=/path/to/piper
export GENEI_PIPER_VOICE=/path/to/en_US-lessac-low.onnx
```

Verified on CPU: a real-time factor of **0.32**, so it synthesises roughly three seconds of
audio per second of compute.

---

## Vision — face identity, local, offline

| Model | Size | Why | Source |
|---|---|---|---|
| **detection.onnx** | 17 MB | SCRFD face detection | [immich-app/buffalo_l](https://huggingface.co/immich-app/buffalo_l) |
| **arcface.onnx** | 167 MB | 512-d face embeddings | same repository |

```sh
mkdir -p ~/.genei/face-models
curl -L -o ~/.genei/face-models/detection.onnx \
  https://huggingface.co/immich-app/buffalo_l/resolve/main/detection/model.onnx
curl -L -o ~/.genei/face-models/arcface.onnx \
  https://huggingface.co/immich-app/buffalo_l/resolve/main/recognition/model.onnx
export GENEI_FACE_MODEL_DIR=~/.genei/face-models
```

Also needs Python with two packages:

```sh
pip install onnxruntime opencv-python-headless numpy
```

`GENEI_PYTHON_BIN` selects the interpreter if `python3` is not the right one.

---

## Generation — where the pixels come from

| Service | Env var | Unlocks | Notes |
|---|---|---|---|
| **ComfyUI** | `GENEI_COMFY_URL` | image and video rendering | the execution plane submits workflows here |
| **Local LLM** | `GENEI_LLAMA_URL` | text generation, scene planning | llama.cpp's `llama-server` |
| **Vision model** | `GENEI_VLM_URL` | analysing an uploaded video | any OpenAI-compatible vision server |
| **Speech server** | `GENEI_SPEECH_URL` | TTS without local Piper | OpenAI-compatible `/audio/speech` |
| **Identity scorer** | `GENEI_EMBEDDING_URL` | face scoring without local models | any service returning a similarity |

Every one of these is **optional**. Without them the app runs, and each feature reports
exactly which variable it needs rather than failing silently or faking a result.

### llama.cpp, specifically

```sh
export GENEI_LLAMA_BIN=/path/to/llama-server
export GENEI_LLAMA_MODEL=/path/to/model.gguf
export GENEI_LLAMA_MMPROJ=/path/to/mmproj.gguf   # only for a vision model
```

`llama-server` needs `libgomp.so.1`. If it will not start, that is almost always why.

---

## Storage

| Mode | Env var | Behaviour |
|---|---|---|
| **File** (default) | none | projects, characters, voices and continuity documents persist as JSON in `~/.genei` |
| **Database** | `DATABASE_URL` | MySQL; projects also persist to `continuity_projects` |

The file backend is not a fallback for a broken database — it is the default, because this is
a local-first application. Set `GENEI_DESKTOP_DATA_DIR` to move the data directory.

---

## Model providers (bring your own key)

Set keys in the app's Settings, not in the environment — they are encrypted at rest and never
written to a log. Provider endpoints can be overridden when self-hosting:

`GENEI_KLING_API_BASE_URL` · `GENEI_RUNWAY_API_BASE_URL` · `GENEI_HEYGEN_API_BASE_URL` ·
`GENEI_PIKA_HEALTH_ENDPOINT` · `GENEI_SEARCH_ENDPOINT`

---

## Build targets

| Target | Extra toolchain |
|---|---|
| **Web / PWA** | none beyond Node |
| **Windows `.exe`** | none — built on a Windows runner or via `electron-builder` |
| **Android `.apk` / `.aab`** | **JDK 21** (not 17), Android SDK, `pnpm build && npx cap sync android` |
| **iOS `.ipa`** | **macOS + Xcode**, an Apple Developer account, a signing identity |

JDK 21 is required because `capacitor.build.gradle` targets `JavaVersion.VERSION_21`.

---

## Verification commands

```sh
node scripts/doctor.mjs            # every dependency, with the fix for each missing one
pnpm check                         # type check
pnpm test                          # test suite
pnpm build                         # production build
pnpm audit --prod --audit-level high
python3 scripts/validate_pwa.py dist/public
```

---

## What "verified" means per dependency

The doctor reports `OK` when a binary runs or a file exists with non-zero size. That is
**presence**, not correctness. Where a dependency was exercised end to end it is stated
explicitly in the feature's own documentation:

| Dependency | Exercised? |
|---|---|
| ffmpeg / ffprobe | **Yes** — real probe, real frame extraction, real concat |
| Piper | **Yes** — real WAV with non-silent audio, checked for the RIFF header |
| Face models | **Partly** — models load and produce real 512-d embeddings; no face has been found in any available test image, so the positive-match path is unverified |
| ComfyUI / LLM / VLM | **No** — none present in the development environment |

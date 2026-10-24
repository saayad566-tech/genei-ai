# Genei AI

**An independent, local-first platform for autonomous AI film direction.**

Turn an idea into a film. Genei AI takes a brief, develops it into a blueprint
with characters, world and continuity, breaks it into scenes, shots and takes,
generates each shot on your own hardware, reviews and repairs what fails,
and assembles the result — locally, on your machine.

You choose the models. Nothing is hardcoded, nothing is sent to us, and the
application works with no account at all.

---

## Why it is different

**Local-first, genuinely.** Models run on your hardware. Your projects, media
and keys stay on your disk. The app works offline once models are installed.

**You choose the models.** Bring your own open-source or commercial models. The
AI Store browses the Hugging Face Hub, tells you what each model is actually
good at — with the evidence for the claim — and whether it fits your machine.

**It tells the truth about what it can do.** If a tool is missing, the app says
which one and what still works. It does not return a plausible-looking result
instead of a real one. A job reports `completed` only when an output file exists
on disk.

**Long-form, through small shots.** A five-minute film is produced as many short
connected shots that are reviewed and assembled, not as one enormous generation.

---

## Install

| Platform | How |
|---|---|
| **Windows** | Extract the archive and run `GeneiAI.exe`. No installer, no admin rights. |
| **Android** | Install the release APK. Requires Android 7.0 (API 24) or newer. |
| **Web / PWA** | Open the hosted origin and install it from your browser. |

See `PLATFORM_MATRIX.md` for what is verified on each platform.

### First run

The onboarding screen detects your hardware and offers to install the tools and
models you need, so you do not have to hunt for them. Everything is optional —
the app tells you what each piece unlocks.

---

## Requirements

| | |
|---|---|
| **Minimum** | 8 GB RAM, 10 GB free disk, no GPU (CPU inference works) |
| **Recommended** | 16 GB RAM, a GPU with 8 GB VRAM, 100 GB free disk |
| **Runtime** | Windows 10+, Android 7.0+, or a modern browser |

The app detects what you have and adapts. It does not assume a GPU.

---

## Configuration

Copy `.env.example` to `.env`. **Nothing in it is required** — the application
runs fully local with the file empty. Every variable is documented with its
default and what degrades without it.

---

## What is verified, and what is not

We distinguish these deliberately, because a build succeeding is not the same as
an application working.

| | Status |
|---|---|
| Web/PWA: tests, type check, production build | **Verified** |
| Windows: builds on a real Windows runner | **Verified** |
| Android: APK built, release-signed, contents verified | **Verified** |
| Local LLM inference | **Verified** — real model, real tokens |
| Media assembly | **Verified** — real film, probe-validated |
| Windows/Android *execution* on a device | **Not verified** — see `PLATFORM_MATRIX.md` |

---

## Development

```sh
pnpm install
pnpm dev          # development server
pnpm check        # type check
pnpm test         # test suite
pnpm build        # production build
pnpm start        # run the production build
```

Architecture, decisions and the platform matrix are in `docs/` and the
`PLATFORM_MATRIX.md` file.

---

## Privacy and security

Local-first means your work stays yours. Read `PRIVACY.md` for exactly what
leaves your device and when — it is short, and it is specific. `SECURITY.md`
explains how to report a vulnerability.

---

## Licence

MIT — see `LICENSE`.

---

## Contributing

Issues and pull requests are welcome. Please run `pnpm check && pnpm test` before
opening a pull request, and describe what you verified rather than what you
changed.

# Documentation index

Everything about this project, and where to find it.

---

## Start here

| Document | What it answers |
|---|---|
| **[README.md](README.md)** | What is this, and how do I install and use it? |
| **[PLATFORM_MATRIX.md](PLATFORM_MATRIX.md)** | What runs on which platform, and what is actually verified? |
| **[PUBLISHING.md](PUBLISHING.md)** | What is required to publish on each store, and what is done? |
| **[CHANGELOG.md](CHANGELOG.md)** | What changed, and when? |

## Using it

| Document | What it answers |
|---|---|
| [PRIVACY.md](PRIVACY.md) | What leaves my device, and when? (Also the Play Data Safety answers.) |
| [SECURITY.md](SECURITY.md) | How do I report a vulnerability? How are my keys handled? |
| [.env.example](.env.example) | Every configuration variable, its default, and what degrades without it. |
| [android/BUILD-ANDROID.md](android/BUILD-ANDROID.md) | How do I build the APK, and why does it need JDK 21? |

## Building and running

| Document | What it answers |
|---|---|
| [README.md](README.md) | The development commands. |
| [BUILD-PIPELINE.md](BUILD-PIPELINE.md) | CI pipelines, and how to build without GitHub. |
| [ROLLBACK.md](ROLLBACK.md) | How do I undo a change safely? |

## Platforms

| Platform | Target | Where |
|---|---|---|
| **Web / PWA** | Browser, installable | `pnpm build && pnpm start` |
| **Android** | APK + AAB | `android/` — see `android/BUILD-ANDROID.md` |
| **Windows** | Portable `.exe` | `desktop/` — `pnpm desktop:build:portable` |
| **iOS** | Simulator build via macOS CI | `.github/workflows/build-genei-ios.yml` — see `PLATFORM_MATRIX.md` |

## The honest position

This project distinguishes **"the code is written"** from **"it is verified to work."**
`PLATFORM_MATRIX.md` uses these terms precisely:

| Term | Meaning |
|---|---|
| **Verified locally** | Ran in the development environment and passed |
| **CI-verified** | Ran on a hosted runner of the correct OS |
| **Not verified** | Stated as such, with the specific missing requirement |

Artifacts that have been built but never executed on their target platform are described
as built, not as working. That distinction is the point.

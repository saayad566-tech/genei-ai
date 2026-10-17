# Build Pipeline — GitHub-free APK + EXE

A complete path for building the Android APK and the Windows `.exe` **without GitHub
Actions**, for when the repository's Actions minutes are spent, a sandbox pod recycles
mid-build, or the build simply must not depend on a hosted runner.

---

## 1. Why this exists

GitHub Actions is **metered per account for private repositories**, and Windows runners
bill at **2×**. Once the included minutes are gone, GitHub stops starting jobs: the run
appears and then fails within a few seconds with **zero steps executed**, which looks
like an infrastructure fault rather than a quota. Nothing in the repository can fix
that — but the build does not have to depend on it.

| Provider | Config file | Free tier | Windows runner? | Notes |
|---|---|---|---|---|
| **GitLab CI** (gitlab.com) | `.gitlab-ci.yml` | ~400 compute-min/month | yes (self-hosted, tagged) | closest drop-in to Actions |
| **Codeberg + Woodpecker** | `.woodpecker.yml` | free for FOSS | yes (own agent) | community-run |
| **Self-hosted runner** | — | unlimited (your hardware) | yes | the reliable endgame |
| **Local / Docker** | `Dockerfile.build`, `build.sh` | unlimited | yes | no CI at all |
| **Cloudflare Pages / Vercel** | provider dashboard | generous | n/a | web/Electron **front-ends only** |

**Rule of thumb:** hosted CI is convenient, but a self-hosted runner or a local Docker
build is what makes the pipeline unbreakable — no minutes, no quota, no cap.

Cloudflare Pages and Vercel host a built web bundle. They do **not** replace the native
APK/EXE build.

---

## 2. What is in this repository

| File | Purpose |
|---|---|
| `.gitlab-ci.yml` | GitLab pipeline: validate → build APK → build EXE → verify |
| `.woodpecker.yml` | The same pipeline for Codeberg/Woodpecker |
| `build.sh` | Portable offline build (APK + EXE), heap raised, artifacts verified |
| `Dockerfile.build` | Reproducible container: JDK 21 + Node 22 + Android SDK 36 + pnpm |
| `scripts/verify_artifacts.py` | Proves artifacts are real (non-zero, correct magic bytes) |
| `scripts/ci_lint.py` | Lints the CI config, including duplicate YAML keys |

---

## 3. The commands this project actually uses

```bash
# Install
pnpm install --frozen-lockfile

# Web bundle + Android sync (required before the Gradle build)
pnpm android:sync

# Android debug APK
cd android && ./gradlew assembleDebug --no-daemon
#   -> android/app/build/outputs/apk/debug/app-debug.apk

# Windows installer (NSIS) + portable
pnpm desktop:build:all
#   -> release/Genei-AI-Desktop-Setup-<version>.exe
#      release/Genei-AI-Desktop-Portable-<version>.exe

# Verify the artifacts are real
python3 scripts/verify_artifacts.py --dir artifacts
```

Two constraints worth knowing:

- **The Android build needs JDK 21** (Gradle 8.14.3) and **compileSdk 36**. The CI jobs
  pin `eclipse-temurin:21-jdk` rather than inheriting a JDK from a convenience image.
- **The release APK variant needs a signing config that is not in the repository**, so
  the pipelines build the **debug** APK — the same artifact the GitHub workflow
  produces and validates. `build.sh` prefers the debug APK and falls back to release if
  one exists.

---

## 4. GitLab CI

1. Push the repository to GitLab.
2. `.gitlab-ci.yml` is already at the root — nothing to move.
3. Commit. `build:android` runs on a shared Linux runner immediately.

`build:windows` needs a runner tagged `windows`, because electron-builder cannot
produce an NSIS installer on Linux without Wine. Until one is registered that job is
`allow_failure: true`, so it never blocks the Android pipeline.

**Self-hosted runners** (no hosted minutes, no platform cap):

```bash
# Linux runner — Android
curl -L https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh | sudo bash
sudo apt-get install -y gitlab-runner
sudo gitlab-runner register \
  --url https://gitlab.com/ --registration-token "<TOKEN>" \
  --executor docker --docker-image eclipse-temurin:21-jdk \
  --description "android-builder" --tag-list android

# Windows runner — EXE. Install GitLab Runner for Windows, then:
gitlab-runner register --url https://gitlab.com/ --registration-token "<TOKEN>" \
  --executor shell --description "windows-builder" --tag-list windows
```

---

## 5. Codeberg / Woodpecker

1. Push to Codeberg and enable Woodpecker for the repository.
2. `.woodpecker.yml` is already at the root.
3. Commit. `android-apk` runs on a shared agent; `windows-exe` needs an agent labelled
   `windows` and is set to `failure: ignore` until one exists.

---

## 6. Local and Docker builds

```bash
# On your machine
./build.sh                  # APK + EXE, then verify
./build.sh android          # APK only
./build.sh verify           # just re-check artifacts/

# Reproducible, containerised
docker build -f Dockerfile.build -t genei-builder .
docker run --rm -v "$PWD":/work -w /work genei-builder bash build.sh android
```

`build.sh` writes to **`artifacts/`**, deliberately not `dist/` — this repository
already uses `dist/` for the built web bundle, and writing installers there would
collide with it.

---

## 7. Working from a phone or a constrained sandbox

A phone-sized sandbox cannot compile a heavy SDK in time. **Do not compile there.**
Edit and verify, then let CI or your own machine do the heavy build.

```bash
git add -A && git commit -m "wip" && git push     # triggers GitLab/Woodpecker
glab ci status                                    # GitLab, without a browser
glab ci artifact <job> ./artifacts                # fetch the result once green
```

If you must build in a constrained environment, keep it small and offline:

```bash
./build.sh android          # offline Gradle, no daemon, heap raised — not shrunk
```

---

## 8. Non-negotiables

- **Raise the heap, never shrink it** — `-Xmx4g`, not `768m`.
- **Never shrink the build or drop an architecture** to fit a small sandbox. Fail over
  to a runner instead.
- **Verify artifacts** (non-zero, correct magic bytes) before delivering.
- **Never claim a green build you did not actually run.**

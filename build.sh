#!/usr/bin/env bash
# build.sh — portable, offline-first build for the Genei AI APK and Windows EXE.
#
# Tuned for a constrained sandbox or a laptop: raises the heap, uses caches, fails
# fast, and verifies the artifacts it produces. Nothing here shrinks the build to fit
# a small machine — if the environment cannot do it, this exits and says so.
#
# Usage:
#   ./build.sh                 # build everything, then verify
#   ./build.sh android         # debug APK only
#   ./build.sh windows         # Windows installer only (needs Windows, or Wine)
#   ./build.sh verify          # re-check the artifacts in artifacts/ only
#
# Output goes to ./artifacts — deliberately NOT ./dist, which this repository already
# uses for the built web bundle.
set -Eeuo pipefail

TARGET="${1:-all}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$ROOT/artifacts"
mkdir -p "$OUT"

# --- memory tuning (raise, never shrink) ----------------------------------- #
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
export GRADLE_OPTS="${GRADLE_OPTS:--Dorg.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g -XX:+HeapDumpOnOutOfMemoryError}"
export ORG_GRADLE_PROJECT_org_gradle_caching=true

log()  { printf '\033[1;36m[build]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[build:warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[build:error]\033[0m %s\n' "$*" >&2; exit 1; }

pnpm_run() {
  if command -v pnpm >/dev/null 2>&1; then pnpm "$@"; else corepack pnpm "$@"; fi
}

preflight() {
  log "preflight: toolchains"
  command -v node >/dev/null 2>&1 || die "node not found — install Node 20+ (this project targets Node 22 in CI)"
  node --version
  if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
    warn "ANDROID_HOME / ANDROID_SDK_ROOT are not set — the Android build will fail without them"
  else
    log "android sdk: ${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
  fi
  command -v java >/dev/null 2>&1 || warn "java not found — the Android build needs JDK 21"
  java -version 2>&1 | head -1 || true
}

install_deps() {
  log "dependencies: pnpm install --frozen-lockfile"
  [ -f "$ROOT/pnpm-lock.yaml" ] || die "pnpm-lock.yaml not found — run this from the repository root"
  pnpm_run install --frozen-lockfile
}

build_android() {
  log "android: cap sync + assembleDebug"
  [ -x "$ROOT/android/gradlew" ] || die "android/gradlew not found or not executable — run this from the repository root"
  # android:sync runs the web build and capacitor sync first; the Gradle build needs it.
  pnpm_run android:sync
  ( cd "$ROOT/android" && ./gradlew assembleDebug --no-daemon --stacktrace )

  # This project produces a debug APK (the release variant needs a signing config that
  # is not in the repository). Take whichever exists and say which one it was.
  local debug_apk="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
  local release_dir="$ROOT/android/app/build/outputs/apk/release"
  if [ -f "$debug_apk" ]; then
    cp "$debug_apk" "$OUT/"
  elif [ -d "$release_dir" ] && compgen -G "$release_dir/*.apk" >/dev/null; then
    find "$release_dir" -name '*.apk' -exec cp {} "$OUT/" \;
  else
    die "no APK was produced under android/app/build/outputs/apk"
  fi
}

build_windows() {
  log "windows: electron-builder (nsis + portable)"
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) : ;;
    *) warn "not on Windows: electron-builder needs Wine to produce an NSIS installer here" ;;
  esac
  pnpm_run desktop:build:all
  local found=0
  for dir in "$ROOT/release" "$ROOT/dist"; do
    [ -d "$dir" ] || continue
    while IFS= read -r -d '' file; do
      cp "$file" "$OUT/"
      found=1
    done < <(find "$dir" -maxdepth 2 -name '*.exe' -print0 2>/dev/null || true)
    while IFS= read -r -d '' file; do
      cp "$file" "$OUT/"
    done < <(find "$dir" -maxdepth 2 -name '*.sha256' -print0 2>/dev/null || true)
  done
  [ "$found" -eq 1 ] || die "no .exe was produced under release/ or dist/"
}

verify() {
  log "verify: artifacts in $OUT"
  shopt -s nullglob
  local count=0 file size magic
  for file in "$OUT"/*.apk "$OUT"/*.exe; do
    count=$((count + 1))
    size="$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null || echo 0)"
    [ "$size" -gt 0 ] || die "artifact is 0 bytes: $file"
    magic="$(head -c 2 "$file" | od -An -tx1 | tr -d ' \n')"
    case "$file" in
      *.apk) [ "$magic" = "504b" ] || die "not a valid APK (magic $magic): $file" ;;
      *.exe) [ "$magic" = "4d5a" ] || die "not a valid EXE (magic $magic): $file" ;;
    esac
    log "ok: $(basename "$file") ($size bytes)"
  done
  [ "$count" -gt 0 ] || die "no artifacts were produced in $OUT"

  if command -v python3 >/dev/null 2>&1 && [ -f "$ROOT/scripts/verify_artifacts.py" ]; then
    python3 "$ROOT/scripts/verify_artifacts.py" --dir "$OUT" || die "verify_artifacts.py rejected the output"
  fi
  log "verified $count artifact(s)"
}

case "$TARGET" in
  all)     preflight; install_deps; build_android; build_windows; verify ;;
  android) preflight; install_deps; build_android; verify ;;
  windows) preflight; install_deps; build_windows; verify ;;
  verify)  verify ;;
  *)       die "unknown target '$TARGET' (use: all|android|windows|verify)" ;;
esac

log "done — artifacts in $OUT"

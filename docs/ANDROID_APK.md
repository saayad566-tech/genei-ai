# Genei AI Android APK

Genei AI now has a **real native Android project** under `android/`, generated from the same React workspace as the Windows desktop application. The Android build is produced by the GitHub Actions workflow `.github/workflows/build-genei-android.yml` and emits an installable `app-debug.apk` artifact for device testing.

The APK is a native Capacitor shell around the Genei creator workspace. It opens the same beginner-friendly interface and uses the hosted Genei origin for authenticated API and tRPC calls when a network is available. It does not claim that large local video or image models run inside every phone. Heavy capabilities are routed to the unified desktop host or a configured provider, while mobile-safe features remain available in the app.

## Build and validation

```bash
pnpm install --frozen-lockfile
pnpm android:sync
cd android
./gradlew assembleDebug
```

The CI workflow verifies that the output is a non-empty APK, confirms the Android package id `ai.genei.creator`, confirms the app label, and writes a SHA-256 checksum beside the APK. The debug signing key is intended for testing and sideloading, not for a public Play Store release. A production Play Store release must use a long-lived private signing key supplied by the publisher.

## Install for testing

Download the workflow’s `app-debug.apk` artifact, copy it to an Android phone, open it, and allow the phone’s one-time permission to install an app from that source. Keep an internet connection available for sign-in, API requests, and capabilities routed to Genei Desktop or configured providers. The Windows installer remains the complete local-first desktop package for hardware detection and heavyweight model execution.

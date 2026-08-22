# Android Delivery Status

Genei AI currently ships a verified mobile-friendly PWA experience, not a native APK in this repository. The project contains no Android Gradle project, Capacitor project, Android SDK, or Gradle toolchain in the current build environment. Therefore no APK is claimed or linked from this release.

The PWA is the reliable Android path: open Genei AI in Chrome, choose **Install app** or **Add to Home screen**, and use the server-side model gateway plus hardware-aware routing. Heavy local models remain desktop or provider workloads; the Capability Library labels those constraints instead of promising universal phone inference.

A genuine APK requires a separate native wrapper project, a configured backend origin for mobile requests, Android SDK/Gradle tooling, signing credentials, and installation testing on a physical Android device or emulator. It must be generated and validated before being distributed as an APK.

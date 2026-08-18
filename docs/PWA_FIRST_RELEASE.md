# Genei AI — PWA-First Release Guide

## Release position

Genei AI is currently delivered as a production-oriented **Progressive Web App**. The web app is the source of truth for the creator ecosystem, API gateway, cloud asset library, and Android experience. It is not represented as a native APK, Windows EXE, iOS IPA, or HarmonyOS HAP until a genuine platform build has been produced and installed on the target platform.

## Android installation

Open the Genei AI preview or published web address in Chrome on Android. Use the **Install app** control when Chrome exposes the install prompt, or use Chrome's menu and choose **Install app** / **Add to Home screen**. The manifest declares standalone display behavior, the service worker provides an offline application shell, and the application keeps private API and storage traffic out of the cache.

The Android PWA supports touch-first navigation, safe-area spacing, large interaction targets, browser voice input where Chrome exposes the Web Speech API, retry controls for failed image generation, remote asset persistence through the server, and server-side model routing with fallback. Optional local inference remains capability-gated; Android devices always have the reliable server gateway path.

## Model and API behavior

Model credentials remain server-side. The model gateway performs capability discovery, timeout handling, and alternate-model fallback. The browser never receives provider keys. Add or manage provider credentials from **API Integrations** rather than embedding secrets in the client.

## Validation performed

The release candidate has been checked with TypeScript, a production build, backend tests, PWA contract tests, and jsdom frontend integration tests. The automated frontend coverage includes model capability rendering, Android voice-input lifecycle, PWA install-prompt invocation, image-generation failure recovery, cloud asset save, and download behavior.

## Native-package policy

A renamed archive is not a valid native application package. APK, EXE, IPA, and HAP download links should only be published after the corresponding platform build has been generated, signed or packaged as required, and installation-tested on that platform. Until then, distribute the source/PWA checkpoint and the web URL.

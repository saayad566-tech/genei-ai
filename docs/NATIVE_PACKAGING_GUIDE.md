# Genei AI Native Packaging and Signing Guide

This guide details the exact prerequisites, compilation commands, and signing steps for producing genuine Windows `.exe` executables and Android `.apk` / `.aab` packages for Genei AI.

## 1. Unified Windows Desktop Installer (`Genei AI Desktop`)

The complete Genei AI application is packaged as a one-click x64 Windows installer. Electron contains the React workspace and production Node server, while PyInstaller compiles the internal Python hardware probe into `runtime/GeneiAI-Director.exe`. The internal probe is not a separately installed user application.

### Prerequisites (on a Windows build environment)
- Python 3.12 and Node.js 22 with pnpm
- A native Windows environment for PE and NSIS output
- Optional Windows code-signing certificate

### Build Command
```powershell
.\packaging\build_windows_desktop.ps1
pnpm install --frozen-lockfile
pnpm build
pnpm exec electron-builder --win nsis --x64 --publish never
```

The resulting installer is written to `release/Genei-AI-Desktop-Setup-<version>.exe`. Validate the internal probe with:

```powershell
python .\packaging\validate_windows_exe.py .\runtime\GeneiAI-Director.exe --json
```

### Code Signing (Windows)
The GitHub Actions workflow accepts a base64-encoded certificate through `WINDOWS_SIGNING_CERT_BASE64` and its password through `WINDOWS_SIGNING_CERT_PASSWORD`. If signing locally with `signtool`, sign the final installer rather than a hidden internal component:

```cmd
signtool sign /f my_certificate.pfx /p password /tr http://timestamp.digicert.com /td sha256 /fd sha256 release\Genei-AI-Desktop-Setup-<version>.exe
```

---

## 2. Android APK & App Bundle (`GeneiAI.apk`)

Genei AI delivers its mobile experience via an optimized PWA and Capacitor container.

### Prerequisites
- Node.js 22+ and pnpm
- Android Studio with Android SDK 34 and Build-Tools installed

### Setup & Build
```bash
pnpm build
npx cap add android
npx cap sync android
cd android
./gradlew assembleRelease
```

The signed release APK will be generated at:
`android/app/build/outputs/apk/release/app-release-unsigned.apk`

### APK Signing
Generate a release keystore:
```bash
keytool -genkey -v -keystore genei-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias genei-alias
```

Sign the APK:
```bash
apksigner sign --ks genei-release-key.jks --out GeneiAI-Release.apk android/app/build/outputs/apk/release/app-release-unsigned.apk
```

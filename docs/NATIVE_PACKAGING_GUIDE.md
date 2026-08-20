# Genei AI Native Packaging and Signing Guide

This guide details the exact prerequisites, compilation commands, and signing steps for producing genuine Windows `.exe` executables and Android `.apk` / `.aab` packages for Genei AI.

## 1. Windows Standalone EXE (`GeneiRunner.exe`)

The BYOH workstation runner client can be bundled into a standalone Windows executable using PyInstaller.

### Prerequisites (on a Windows build environment)
- Python 3.10+ installed and added to `PATH`
- PyInstaller (`pip install pyinstaller`)

### Build Command
```cmd
cd ai_director
pyinstaller genei_runner.spec
```

The resulting standalone executable will be placed in `ai_director/dist/GeneiRunner.exe`.

### Code Signing (Windows)
To sign the executable for Windows Defender trust:
```cmd
signtool sign /f my_certificate.pfx /p password /tr http://timestamp.digicert.com /td sha256 /fd sha256 dist/GeneiRunner.exe
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

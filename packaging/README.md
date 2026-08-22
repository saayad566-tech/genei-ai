# Genei AI Desktop Windows Packaging

Genei AI is distributed as one Windows x64 application. The installer contains the Electron desktop shell, the bundled React workspace, the production Node server, and the internal Python capability probe. Users do not install or pair a separate runner.

## Native Windows build

Run the build on a native Windows machine or through the repository workflow on `windows-latest`:

```powershell
.\packaging\build_windows_desktop.ps1
pnpm install --frozen-lockfile
pnpm build
pnpm exec electron-builder --win nsis --x64 --publish never
```

The helper creates a temporary Python environment, installs the AI Director probe dependencies, compiles `GeneiAI-Director.exe` with PyInstaller, and places it under `runtime/`. Electron Builder then embeds that internal executable into the one-click NSIS installer.

The resulting files are written to `release/`:

```text
Genei-AI-Desktop-Setup-<version>.exe
Genei-AI-Desktop-Setup-<version>.exe.sha256
Genei-AI-Desktop.metadata.json
```

The GitHub Actions workflow `.github/workflows/build-genei-runner-windows.yml` is retained for repository compatibility, but now builds the complete **Genei AI Desktop** application. It validates the embedded PE sidecar and installer size, records a checksum, reports whether code signing was available, and uploads the installer as an artifact. It never publishes a runner-only binary.

## Signing

Code signing is optional in development and controlled by the native workflow secrets `WINDOWS_SIGNING_CERT_BASE64` and `WINDOWS_SIGNING_CERT_PASSWORD`. A release marked unsigned must be labelled clearly when distributed. The checksum file must accompany every installer.

## Runtime behavior

On first launch, the desktop host starts its bundled local server on an available port and runs the internal hardware probe. The probe reports CPU, memory, disk, GPU, accelerator, and optional runtime capabilities. Genei then routes each tool to local execution, a user-configured provider, or the managed fallback. Missing GPU hardware is not an installation failure.

The legacy runner source and pairing procedures remain in the repository only for compatibility with historical server records. They are not part of the installer, are not linked from the user interface, and are not required for any normal desktop workflow.

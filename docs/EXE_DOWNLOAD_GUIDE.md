# Genei AI Desktop — Windows Installation

## For end users

Genei AI Desktop is the complete Genei workspace in one Windows x64 installer. It includes the creator studios, AI Director, visual workflow studio, project manager, encrypted provider hub, local server, and built-in hardware detection.

Download `Genei-AI-Desktop-Setup-<version>.exe`, run the installer, and open **Genei AI Desktop** from the Start menu or desktop shortcut. The first launch performs a quiet capability check inside Genei. After that, choose a studio such as Image, Music, Video, AI Director, Visual Workflows, or Voice.

There is no separate runner, pairing token, command-line command, Python installation, hardware utility, or second application required for the normal workflow. Genei chooses local hardware when it is available and reports a clear cloud fallback when it is not.

## For maintainers

Build on native Windows with:

```powershell
.\packaging\build_windows_desktop.ps1
pnpm install --frozen-lockfile
pnpm build
pnpm exec electron-builder --win nsis --x64 --publish never
```

The authoritative application entry point is `desktop/main.cjs`. It starts the bundled production server, opens the unified workspace, enforces a single application instance, and exposes only a small isolated preload bridge. The internal probe is compiled from `ai_director/desktop_host.py` using `desktop/genei-desktop.spec`.

Before distributing an installer, validate the embedded sidecar and record the installer checksum:

```powershell
python .\packaging\validate_windows_exe.py .\runtime\GeneiAI-Director.exe --json
Get-FileHash .\release\Genei-AI-Desktop-Setup-<version>.exe -Algorithm SHA256
```

The GitHub Actions workflow builds on `windows-latest`, packages the full app, validates the installer, and uploads the installer, checksum, and metadata together. A code-signing certificate may be supplied through the repository’s protected signing secrets. The release metadata explicitly records `runnerRequired: false` and `hardwareDetection: embedded`.

The browser preview intentionally does not claim to inspect the host computer. It displays a preview state and the installed desktop build performs the real local probe.

# Genei BYOH Windows Runner

The Windows artifact produced by this directory is the **Genei BYOH Workstation Runner**. It is a paired background runner that reports local hardware and installed-tool capabilities to a Genei workspace. It is not the complete Genei dashboard or a standalone desktop editor.

## Build locally on Windows

Open PowerShell in the repository root and run:

```powershell
.\packaging\build_windows_exe.ps1
python .\packaging\validate_windows_exe.py .\dist\GeneiRunner.exe
.\dist\GeneiRunner.exe --help
```

The build creates `dist/GeneiRunner.exe`, `dist/GeneiRunner.exe.sha256`, and `dist/GeneiRunner.metadata.json`. The executable is labelled unsigned unless a signing certificate is supplied to the build environment.

## Build with GitHub Actions

Use `.github/workflows/build-genei-runner-windows.yml` on a repository with Actions enabled. A manual run creates a workflow artifact. A release-triggered run attaches the executable, checksum, and metadata to the release. The workflow refuses to publish when the executable is missing or when PE validation or the `--help` smoke test fails.

To enable Authenticode signing, add `WINDOWS_SIGNING_CERT_BASE64` and `WINDOWS_SIGNING_CERT_PASSWORD` as repository or environment secrets. Without those secrets, the release must remain visibly marked **unsigned**.

## Pair a runner

1. Sign in to the Genei control plane and open **API Integrations**.
2. Pair a new BYOH workstation and copy the one-time runner token.
3. Run the published executable with the workspace origin and token:

```powershell
.\GeneiRunner.exe --server-url https://your-genei-origin.example --token genei_one_time_token
```

The runner sends heartbeat and capability telemetry only. It does not receive provider API keys and does not execute arbitrary remote shell commands. Revoke the runner from Genei when the workstation should no longer connect.

## Release truth requirements

Do not upload a renamed placeholder file. A release is valid only when the executable has a Windows PE header, targets x64, starts successfully with `--help`, has an independently computed SHA-256 checksum, and has an explicit signed or unsigned state. The Genei Settings download panel must remain in a build-pending state until all of those conditions are satisfied.

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
$Python = Get-Command python -ErrorAction Stop
$BuildEnv = Join-Path $Root ".desktop-build-venv"
$Runtime = Join-Path $Root "runtime"
$PyInstaller = Join-Path $BuildEnv "Scripts\pyinstaller.exe"

if (-not (Test-Path $BuildEnv)) {
  & $Python.Source -m venv $BuildEnv
}

& (Join-Path $BuildEnv "Scripts\python.exe") -m pip install --upgrade pip
& (Join-Path $BuildEnv "Scripts\python.exe") -m pip install -r (Join-Path $Root "ai_director\requirements.txt") pyinstaller

Remove-Item (Join-Path $Root "build\genei-desktop") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $Root "dist\GeneiAI-Director.exe") -Force -ErrorAction SilentlyContinue
Remove-Item $Runtime -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $Runtime -Force | Out-Null

& $PyInstaller --clean --noconfirm (Join-Path $Root "desktop\genei-desktop.spec")
$BuiltSidecar = Join-Path $Root "dist\GeneiAI-Director.exe"
if (-not (Test-Path $BuiltSidecar)) {
  throw "The embedded GeneiAI-Director.exe was not produced by PyInstaller."
}

Copy-Item $BuiltSidecar (Join-Path $Runtime "GeneiAI-Director.exe") -Force
$hash = (Get-FileHash (Join-Path $Runtime "GeneiAI-Director.exe") -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  GeneiAI-Director.exe" | Out-File -Encoding ascii (Join-Path $Runtime "GeneiAI-Director.exe.sha256")
Write-Host "Embedded sidecar SHA-256: $hash"
Write-Host "Embedded sidecar ready at $Runtime"

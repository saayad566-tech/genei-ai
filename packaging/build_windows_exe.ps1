$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$BuildVenv = Join-Path $ProjectRoot ".venv-genei-build"
$Python = Join-Path $BuildVenv "Scripts\python.exe"
$PyInstaller = Join-Path $BuildVenv "Scripts\pyinstaller.exe"
$OutputDir = Join-Path $ProjectRoot "dist"
$Output = Join-Path $OutputDir "GeneiRunner.exe"
$ChecksumPath = Join-Path $OutputDir "GeneiRunner.exe.sha256"

Write-Host "[Genei] Creating isolated Python environment..."
if (Test-Path $BuildVenv) {
  Remove-Item -Recurse -Force $BuildVenv
}
python -m venv $BuildVenv
& $Python -m pip install --upgrade pip
& $Python -m pip install -r .\ai_director\requirements.txt pyinstaller

Write-Host "[Genei] Building the Genei BYOH workstation runner executable..."
if (Test-Path $OutputDir) {
  Remove-Item -Recurse -Force $OutputDir
}
& $PyInstaller --clean --noconfirm .\ai_director\genei_runner.spec

if (-not (Test-Path $Output)) {
  throw "Expected EXE was not produced at $Output"
}

$Hash = (Get-FileHash $Output -Algorithm SHA256).Hash.ToLowerInvariant()
"$Hash  GeneiRunner.exe" | Out-File -Encoding ascii $ChecksumPath

$Version = "1.0.0"
$Metadata = [ordered]@{
  name = "Genei BYOH Windows Runner"
  version = $Version
  product = "Genei AI"
  target = "win-x64"
  artifact = "GeneiRunner.exe"
  fileSizeBytes = (Get-Item $Output).Length
  sha256 = $Hash
  signingState = if ($env:SIGNING_CERT_PATH -and $env:SIGNING_CERT_PASSWORD) { "signed" } else { "unsigned" }
  buildUtc = [DateTime]::UtcNow.ToString("o")
}
$Metadata | ConvertTo-Json | Out-File -Encoding utf8 (Join-Path $OutputDir "GeneiRunner.metadata.json")

Write-Host "[Genei] EXE ready: $Output"
Write-Host "[Genei] SHA256: $Hash"
Write-Host "[Genei] Validate with: .\dist\GeneiRunner.exe --help"

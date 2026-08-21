$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "[Genei] Creating isolated Python environment..."
py -3.11 -m venv .venv-genei-build
& .\.venv-genei-build\Scripts\python.exe -m pip install --upgrade pip
& .\.venv-genei-build\Scripts\python.exe -m pip install -r .\ai_director\requirements.txt pyinstaller

Write-Host "[Genei] Building the signed-ready BYOH runner executable..."
& .\.venv-genei-build\Scripts\pyinstaller.exe --clean --noconfirm .\ai_director\genei_runner.spec

$Output = Join-Path $ProjectRoot "dist\GeneiRunner.exe"
if (-not (Test-Path $Output)) {
  throw "Expected EXE was not produced at $Output"
}

if ($env:SIGNING_CERT_PATH -and $env:SIGNING_CERT_PASSWORD) {
  Write-Host "[Genei] Signing EXE locally using provided cert..."
  & signtool sign /f $env:SIGNING_CERT_PATH /p $env:SIGNING_CERT_PASSWORD /tr http://timestamp.digicert.com /td sha256 /fd sha256 $Output
}

$Hash = (Get-FileHash $Output -Algorithm SHA256).Hash
$Hash | Out-File -Encoding ascii (Join-Path $ProjectRoot "dist\GeneiRunner.exe.sha256")
Write-Host "[Genei] EXE ready: $Output"
Write-Host "[Genei] SHA256: $Hash"
Write-Host "[Genei] Run .\dist\GeneiRunner.exe --help to validate the packaged binary."

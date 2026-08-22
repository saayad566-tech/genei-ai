[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$InstalledDir
)

$ErrorActionPreference = "Stop"
$installedExe = Join-Path $InstalledDir "GeneiAI.exe"
$serverEntry = Join-Path $InstalledDir "resources\app.asar.unpacked\dist\index.js"
$unpackedDependencies = Join-Path $InstalledDir "resources\app.asar.unpacked\node_modules"
$logPath = Join-Path $env:RUNNER_TEMP "genei-desktop-startup-smoke.log"
$dataDir = Join-Path $env:RUNNER_TEMP "genei-desktop-smoke-data"

foreach ($requiredPath in @($installedExe, $serverEntry, $unpackedDependencies)) {
  if (-not (Test-Path $requiredPath)) {
    throw "Installed desktop smoke test is missing: $requiredPath"
  }
}

Remove-Item $logPath -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

$env:NODE_ENV = "production"
$env:PORT = "0"
$env:GENEI_DESKTOP = "1"
$env:GENEI_DESKTOP_DATA_DIR = $dataDir
$env:ELECTRON_RUN_AS_NODE = "1"

$serverProcess = $null
$ready = $false
try {
  $serverProcess = Start-Process `
    -FilePath $installedExe `
    -ArgumentList @("`"$serverEntry`"") `
    -WorkingDirectory $InstalledDir `
    -RedirectStandardOutput $logPath `
    -RedirectStandardError "$logPath.stderr" `
    -PassThru `
    -WindowStyle Hidden

  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    Start-Sleep -Milliseconds 500
    if ($serverProcess.HasExited) {
      $stdout = if (Test-Path $logPath) { Get-Content $logPath -Raw } else { "" }
      $stderr = if (Test-Path "$logPath.stderr") { Get-Content "$logPath.stderr" -Raw } else { "" }
      throw "Embedded server exited before readiness (code $($serverProcess.ExitCode)). stdout=$stdout stderr=$stderr"
    }

    if (Test-Path $logPath) {
      $match = Select-String -Path $logPath -Pattern "Server running on http://localhost:(\d+)/" | Select-Object -Last 1
      if ($match) {
        $port = [int]$match.Matches[0].Groups[1].Value
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$port/" -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -lt 500) {
          Write-Host "Embedded server readiness verified on port $port."
          $ready = $true
          break
        }
      }
    }
  }

  if (-not $ready) {
    $stdout = if (Test-Path $logPath) { Get-Content $logPath -Raw } else { "" }
    $stderr = if (Test-Path "$logPath.stderr") { Get-Content "$logPath.stderr" -Raw } else { "" }
    throw "Embedded server did not reach HTTP readiness within 30 seconds. stdout=$stdout stderr=$stderr"
  }
}
finally {
  if ($serverProcess -and -not $serverProcess.HasExited) {
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
  }
}

if (-not $ready) {
  exit 1
}

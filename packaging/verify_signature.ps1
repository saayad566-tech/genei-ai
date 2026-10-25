# Verifies the Authenticode signature of the built executables for real.
#
# The build metadata used to record "signed" whenever the signing secret was present,
# which is an assumption rather than a check: a wrong password, an expired certificate
# or a missing signtool would all still have been reported as signed. This script reads
# the actual signature off the binary and reports what it finds.
#
# Two rules learned from this script breaking a release it was only supposed to describe:
#
#  1. A reporting script must not be able to fail the build by accident. Every file is
#     examined inside its own try/catch, so one unreadable binary produces a row saying
#     so rather than killing the whole report.
#  2. Without a certificate, an unsigned artifact is the EXPECTED outcome, not a fault.
#     Only a supplied certificate makes an unsigned artifact a failure.

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Path,
  # Set when a signing certificate was supplied. Makes an unsigned artifact a failure.
  [switch]$ExpectSigned,
  # Emit the result as JSON for the build metadata step.
  [switch]$AsJson
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if (-not (Test-Path $Path)) {
  # Not a throw: report it, and let the caller decide. A missing directory here means the
  # build produced nothing, which the build step itself should have caught.
  $empty = @()
  if ($AsJson) { ConvertTo-Json -InputObject @($empty) -Depth 5 } else { Write-Host "Nothing exists at $Path" }
  return
}

# -ErrorAction SilentlyContinue: a transient filesystem hiccup must not abort the report.
$targets = @()
if ((Get-Item -LiteralPath $Path).PSIsContainer) {
  $targets = @(Get-ChildItem -LiteralPath $Path -Filter *.exe -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike '*uninstaller*' })
} else {
  $targets = @(Get-Item -LiteralPath $Path)
}

Write-Host "Examining $($targets.Count) executable(s) under $Path"

$results = @()
foreach ($target in $targets) {
  try {
    $signature = Get-AuthenticodeSignature -LiteralPath $target.FullName -ErrorAction Stop

    # Map the real status to something the metadata can carry without overstating it.
    $state = switch ("$($signature.Status)") {
      "Valid" { "signed-valid" }
      # Signed by a certificate the machine does not trust - the normal outcome for a
      # self-signed identity that has not been installed into the trust store.
      "UnknownError" { "signed-untrusted" }
      "NotSigned" { "unsigned" }
      "HashMismatch" { "tampered" }
      default { "unsigned-$($signature.Status)" }
    }

    $signer = $null
    $thumbprint = $null
    if ($null -ne $signature.SignerCertificate) {
      $signer = $signature.SignerCertificate.Subject
      $thumbprint = $signature.SignerCertificate.Thumbprint
    }

    $isSigned = $state -like "signed-*"
    $displaySigner = if ($signer) { $signer } else { "no signer certificate" }
    Write-Host ("{0,-46} {1,-18} {2}" -f $target.Name, $state, $displaySigner)

    $results += [ordered]@{
      artifact = $target.Name
      signingState = $state
      signatureStatus = "$($signature.Status)"
      signerSubject = $signer
      signerThumbprint = $thumbprint
      signed = $isSigned
      verifiedAt = (Get-Date).ToUniversalTime().ToString("o")
    }
  } catch {
    # One unreadable or locked binary is a row in the report, not the end of the build.
    Write-Host ("{0,-46} {1,-18} {2}" -f $target.Name, "unreadable", $_.Exception.Message)
    $results += [ordered]@{
      artifact = $target.Name
      signingState = "unreadable"
      signatureStatus = "Unreadable"
      signerSubject = $null
      signerThumbprint = $null
      signed = $false
      error = $_.Exception.Message
      verifiedAt = (Get-Date).ToUniversalTime().ToString("o")
    }
  }
}

if ($AsJson) {
  # -InputObject with @() keeps a single result as a JSON array rather than a bare object,
  # which is what the metadata step expects to parse.
  ConvertTo-Json -InputObject @($results) -Depth 5
}

$signedCount = @($results | Where-Object { $_.signed }).Count
$unsigned = @($results | Where-Object { -not $_.signed })
$artifactNames = ($unsigned | ForEach-Object { $_.artifact }) -join ', '

if ($ExpectSigned -and $unsigned.Count -gt 0) {
  throw "A signing certificate was supplied but $($unsigned.Count) artifact(s) are not signed: $artifactNames. Signing silently failed."
}

Write-Host ""
Write-Host "$signedCount of $($results.Count) executable(s) carry a signature."
if (-not $ExpectSigned -and $unsigned.Count -gt 0) {
  Write-Host "No certificate was supplied, so unsigned artifacts are expected. This is a report, not a failure."
}

# Verifies the Authenticode signature of the built executables for real.
#
# The build metadata used to record "signed" whenever the signing secret was present,
# which is an assumption rather than a check: a wrong password, an expired certificate
# or a missing signtool would all still have been reported as signed. This script reads
# the actual signature off the binary and reports what it finds.
#
# It also fails the build when a certificate was supplied but the artifact came out
# unsigned, so a silently broken signing step cannot reach a release.

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

if (-not (Test-Path $Path)) { throw "Nothing exists at $Path" }

$targets = if ((Get-Item $Path).PSIsContainer) {
  @(Get-ChildItem -Path $Path -Filter *.exe -Recurse -File | Where-Object { $_.Name -notlike '*uninstaller*' })
} else {
  @(Get-Item $Path)
}

if ($targets.Count -eq 0) { throw "No executables were found at $Path" }

$results = foreach ($target in $targets) {
  $signature = Get-AuthenticodeSignature -FilePath $target.FullName

  # Map the real status to something the metadata can carry without overstating it.
  $state = switch ($signature.Status) {
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
  if ($signature.SignerCertificate) {
    $signer = $signature.SignerCertificate.Subject
    $thumbprint = $signature.SignerCertificate.Thumbprint
  }

  $isSigned = $state -like "signed-*"
  Write-Host ("{0,-46} {1,-18} {2}" -f $target.Name, $state, ($signer ?? "no signer certificate"))

  [ordered]@{
    artifact = $target.Name
    signingState = $state
    signatureStatus = $signature.Status.ToString()
    signerSubject = $signer
    signerThumbprint = $thumbprint
    signed = $isSigned
    verifiedAt = (Get-Date).ToUniversalTime().ToString("o")
  }
}

if ($AsJson) {
  $results | ConvertTo-Json -Depth 5
}

$unsigned = @($results | Where-Object { -not $_.signed })
if ($ExpectSigned -and $unsigned.Count -gt 0) {
  throw "A signing certificate was supplied but $($unsigned.Count) artifact(s) are not signed: $($unsigned.artifact -join ', '). Signing silently failed."
}

Write-Host ""
Write-Host "$(@($results | Where-Object { $_.signed }).Count) of $($results.Count) executable(s) carry a signature."

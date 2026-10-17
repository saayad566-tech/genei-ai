# Generates a real code-signing certificate for Genei AI Desktop and prints exactly
# what to paste into the two repository secrets the build expects.
#
# Two modes:
#
#   Self-signed (default) — creates a certificate that is valid for code signing and
#   signs the installer for real. Windows will show "SaayadTech" as the publisher on
#   any machine where the certificate has been trusted (see the trust step it prints).
#   On machines that have not trusted it, SmartScreen will still warn. This is the
#   honest limitation of a self-signed identity and no script can remove it.
#
#   Existing certificate — if you already hold a CA-issued certificate, point this at
#   the PFX and it will use that instead. That is the only way to remove the SmartScreen
#   warning for other people, because the trust has to come from a certificate authority.
#
# Nothing generated here is committed. The private key stays in the output folder.

[CmdletBinding()]
param(
  # Where to write the generated material.
  [string]$OutputDirectory = (Join-Path $PWD ".signing"),
  # Certificate subject. Keep the CN matching the publisher name in package.json.
  [string]$Subject = "CN=SaayadTech, O=SaayadTech, OU=Code Signing, C=IN",
  [int]$ValidYears = 3,
  # Password for the generated PFX. A random one is created when omitted.
  [string]$Password,
  # Use an existing PFX instead of generating one.
  [string]$ExistingPfxPath,
  [string]$ExistingPfxPassword,
  # Also install the certificate into the current user's Trusted Publishers store.
  [switch]$TrustLocally
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# New-SelfSignedCertificate and Export-PfxCertificate are Windows PKI cmdlets. Failing
# with a clear message beats failing with "command not found".
if (-not $IsWindows -and $PSVersionTable.PSVersion.Major -ge 6) {
  throw "This script uses the Windows PKI cmdlets. On macOS or Linux use packaging/generate_signing_cert.sh instead."
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$pfxPath = Join-Path $OutputDirectory "genei-codesign.pfx"
$cerPath = Join-Path $OutputDirectory "genei-codesign.cer"

if ($ExistingPfxPath) {
  if (-not (Test-Path $ExistingPfxPath)) { throw "No PFX exists at $ExistingPfxPath" }
  if (-not $ExistingPfxPassword) { throw "ExistingPfxPassword is required when using ExistingPfxPath." }
  Copy-Item $ExistingPfxPath $pfxPath -Force
  $Password = $ExistingPfxPassword
  Write-Host "Using the supplied certificate." -ForegroundColor Cyan
}
else {
  if (-not $Password) {
    $bytes = New-Object byte[] 24
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $Password = [Convert]::ToBase64String($bytes)
  }

  Write-Host "Generating a code-signing certificate: $Subject" -ForegroundColor Cyan
  $cert = New-SelfSignedCertificate `
    -Type CodeSigningCert `
    -Subject $Subject `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -KeyAlgorithm RSA `
    -KeyLength 3072 `
    -HashAlgorithm SHA256 `
    -KeyUsage DigitalSignature `
    -NotAfter (Get-Date).AddYears($ValidYears)

  $secure = ConvertTo-SecureString -String $Password -AsPlainText -Force
  Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $secure | Out-Null
  Export-Certificate -Cert $cert -FilePath $cerPath | Out-Null
  Write-Host "Certificate thumbprint: $($cert.Thumbprint)"
}

# Report what was actually produced, rather than assuming.
$imported = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($pfxPath, $Password)
$hasCodeSigning = $imported.Extensions | Where-Object { $_.Oid.FriendlyName -eq "Enhanced Key Usage" } | ForEach-Object { $_.Format($false) }
Write-Host ""
Write-Host "Certificate subject : $($imported.Subject)"
Write-Host "Valid until         : $($imported.NotAfter.ToString('yyyy-MM-dd'))"
Write-Host "Enhanced key usage  : $hasCodeSigning"

if ($TrustLocally) {
  Import-Certificate -FilePath $cerPath -CertStoreLocation "Cert:\CurrentUser\TrustedPublisher" | Out-Null
  Import-Certificate -FilePath $cerPath -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null
  Write-Host "Installed into your Trusted Publishers and Root stores on this machine." -ForegroundColor Green
}

$base64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($pfxPath))

Write-Host ""
Write-Host "=" * 78
Write-Host "Set these two repository secrets (Settings -> Secrets and variables -> Actions):"
Write-Host "=" * 78
Write-Host ""
Write-Host "  WINDOWS_SIGNING_CERT_BASE64"
Write-Host $base64
Write-Host ""
Write-Host "  WINDOWS_SIGNING_CERT_PASSWORD"
Write-Host $Password
Write-Host ""
Write-Host "=" * 78
Write-Host "The PFX and its password are the signing identity. Keep them out of the repository."
Write-Host "Store the PFX somewhere safe; regenerating it changes the identity of every build."
Write-Host ""
Write-Host "To remove the SmartScreen warning for other people you need a certificate issued by a"
Write-Host "certificate authority. Re-run this script with -ExistingPfxPath pointing at it."
Write-Host ""
Write-Host "To trust this certificate on your own machine:"
Write-Host "  Import-Certificate -FilePath '$cerPath' -CertStoreLocation Cert:\CurrentUser\TrustedPublisher"
Write-Host "  Import-Certificate -FilePath '$cerPath' -CertStoreLocation Cert:\CurrentUser\Root"

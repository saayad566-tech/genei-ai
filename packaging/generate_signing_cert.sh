#!/usr/bin/env bash
# Generates a real code-signing certificate for Genei AI Desktop using openssl, and
# prints exactly what to paste into the two repository secrets the build expects.
#
# This is the macOS/Linux counterpart to generate_signing_cert.ps1. It produces the
# same material: a PKCS#12 bundle whose key usage is "Code Signing", plus the base64
# the workflow's CSC_LINK expects.
#
#   ./packaging/generate_signing_cert.sh                 # self-signed, 3 years
#   ./packaging/generate_signing_cert.sh -o .signing -y 5
#
# The private key stays in the output directory and is never committed. To remove the
# SmartScreen warning for other people you need a certificate issued by a certificate
# authority; a self-signed one is only trusted where it has been installed.

set -euo pipefail

OUT_DIR=".signing"
SUBJECT="/CN=SaayadTech/O=SaayadTech/OU=Code Signing/C=IN"
YEARS=3
PASSWORD=""

usage() {
  cat <<'USAGE'
Usage: generate_signing_cert.sh [options]
  -o, --out DIR        Output directory (default: .signing)
  -s, --subject SUBJ   Certificate subject (default: CN=SaayadTech, ...)
  -y, --years N        Validity in years (default: 3)
  -p, --password PASS  PFX password (a random one is generated when omitted)
  -h, --help           Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|--out) OUT_DIR="$2"; shift 2 ;;
    -s|--subject) SUBJECT="$2"; shift 2 ;;
    -y|--years) YEARS="$2"; shift 2 ;;
    -p|--password) PASSWORD="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
done

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required but was not found on PATH." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
KEY="$OUT_DIR/genei-codesign.key"
CRT="$OUT_DIR/genei-codesign.crt"
PFX="$OUT_DIR/genei-codesign.pfx"

if [[ -z "$PASSWORD" ]]; then
  PASSWORD="$(openssl rand -base64 24)"
fi

echo "Generating a code-signing certificate: $SUBJECT"
openssl req -x509 -newkey rsa:3072 -nodes -days $((YEARS * 365)) \
  -keyout "$KEY" -out "$CRT" \
  -subj "$SUBJECT" \
  -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=critical,codeSigning" \
  -addext "basicConstraints=critical,CA:FALSE" 2>/dev/null

openssl pkcs12 -export -out "$PFX" -inkey "$KEY" -in "$CRT" \
  -passout "pass:$PASSWORD" -name "SaayadTech Code Signing"

# Report what was actually produced rather than assuming.
echo
echo "Subject            : $(openssl x509 -in "$CRT" -noout -subject | sed 's/^subject=//')"
echo "Valid until        : $(openssl x509 -in "$CRT" -noout -enddate | sed 's/^notAfter=//')"
echo "Enhanced key usage : $(openssl x509 -in "$CRT" -noout -ext extendedKeyUsage | tail -n +2 | tr -d ' ')"

BASE64="$(openssl base64 -A -in "$PFX")"

cat <<EOF

==============================================================================
Set these two repository secrets (Settings -> Secrets and variables -> Actions):
==============================================================================

  WINDOWS_SIGNING_CERT_BASE64
$BASE64

  WINDOWS_SIGNING_CERT_PASSWORD
$PASSWORD

==============================================================================
The PFX and its password are the signing identity. Keep them out of the repository.
Store the PFX somewhere safe; regenerating it changes the identity of every build.

To remove the SmartScreen warning for other people you need a certificate issued by a
certificate authority. Replace the PFX with it and the pipeline is otherwise unchanged.

To trust this certificate on your own machine (macOS):
  security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain-db "$CRT"
(Linux and Windows trust stores differ; Windows has generate_signing_cert.ps1 -TrustLocally.)
EOF

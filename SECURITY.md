# Security policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it privately through GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
on this repository, or by email to the maintainer listed in `package.json`.

Include what you can:

- What the issue is and where it lives (file, endpoint, or component).
- How to reproduce it, or the smallest example that shows it.
- What an attacker could achieve.
- The version or commit you tested.

You will get an acknowledgement, an honest assessment of whether it is
exploitable, and a fix or a written explanation of why it is not. Credit is
offered unless you would rather stay anonymous.

## Supported versions

The most recent release receives security fixes. Older versions are not
maintained.

## How this project handles secrets

- **Credentials are never committed.** `.gitignore` covers `.env`,
  `.project-config.json`, `*.keystore` and `android/keystore.properties`.
- **User-supplied API keys are encrypted at rest** with `server/_core/keyVault.ts`
  and stored in the local database. They are never returned to the client and
  never written to logs.
- **Logs are redacted** at the point of writing (`server/_core/logger.ts`), so a
  secret passed into a log call is masked rather than printed.
- **No credential is ever sent to a third party.** A key you supply is used only
  against the provider you supplied it for.

## Known posture

This is a local-first application. Models can run entirely on your own machine,
and the app is designed to work with no hosted service at all. Where it does
contact a remote service — the model catalogue, or a provider you configured a
key for — that contact is listed in `PRIVACY.md`.

## Dependency security

Production dependencies are audited in CI on every change to the manifest, and
weekly. The gate fails on any critical or high advisory. The current state is
zero production advisories.

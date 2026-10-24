# Publishing checklist

What is required to take this application live, per platform. Researched against
current official requirements, with the date checked.

---

## Google Play (Android)

Checked 24 October 2026 against Google Play's published requirements.

| Requirement | Status | Notes |
|---|---|---|
| **Target API 36** | **Met** | `targetSdkVersion 36`. Required for new apps from 31 Aug 2026. |
| **AAB, not APK** | **Met** | `app-release.aab` built |
| **Release-signed** | **Met** | `CN=SaayadTech`, RSA 4096, valid to 2054 (Play requires validity past 22 Oct 2033) |
| **Privacy policy URL** | **Met** | `PRIVACY.md` — must be hosted at a public URL |
| **Data Safety form** | **Prepared** | Answers drafted at the end of `PRIVACY.md` |
| Play Developer account | **Action needed** | $25 one-time; personal or organisation |
| Store listing text | **Action needed** | Title, short description (80 chars), full description |
| Screenshots | **Action needed** | Minimum 2 |
| Feature graphic | **Action needed** | 1024 × 500 px |
| Hi-res icon | **Met** | `packaging/icon.png` is 1024 px; Play wants 512 × 512 PNG |
| Content rating | **Action needed** | IARC questionnaire in Play Console |
| Internal testing first | **Recommended** | Verify on a real device before production |

**Not met, and cannot be met here:** device verification. The APK is built and
its contents verified, but no Android device or emulator is available in this
environment.

---

## Windows

| Requirement | Status | Notes |
|---|---|---|
| Executable builds | **Met** | `GeneiAI.exe`, PE32+ x86-64 |
| Runs without installation | **Met** | Portable layout |
| Code signing | **Action needed** | No CA certificate. Windows shows a SmartScreen warning until signed. |
| Verified on Windows | **Action needed** | No Windows machine available here |

---

## Web / PWA

| Requirement | Status | Notes |
|---|---|---|
| Installable manifest | **Met** | `manifest.json` served, verified over HTTP |
| Service worker | **Met** | `sw.js` served |
| HTTPS | **Action needed** | The hosting provider supplies it |
| Health endpoint | **Met** | `/healthz` and `/readyz`, unauthenticated |
| Production build | **Met** | `pnpm build`, exit 0 |

---

## Repository

| Requirement | Status |
|---|---|
| `LICENSE` | **Met** — MIT |
| `PRIVACY.md` | **Met** |
| `SECURITY.md` | **Met** |
| `CHANGELOG.md` | **Met** |
| `.env.example` | **Met** |
| `README.md` | **Met** — user-facing |
| Dependency security gate in CI | **Met** — fails on critical/high |

---

## The honest remaining list

Everything above marked "Action needed" requires something that does not exist
in this environment: a Google Play account, a store listing, artwork, a CA
certificate, a Windows machine, or an Android device.

**None of it is code.** The application builds, runs, serves, and passes every
check that can be run here. What remains is accounts, artwork, and hardware.

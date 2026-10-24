# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.6.0]

### Added

- **AI Store** — browse, classify, check fit for, download and run open-source
  models. Every capability label carries the signal that produced it, so a claim
  can be checked rather than trusted.
- **Model taxonomy** — eight domains, modality pairs, size classes, runability,
  lineage and licence, browsable as facets with live counts.
- **Real local inference** — verified end to end: a real GGUF model generating
  real tokens through the application's own adapter.
- **Execution plane** — `adapters.submit` / `adapters.poll` / `adapters.jobs`. A
  job reports `completed` only when an output file exists on disk.
- **Health surface** — `/healthz` and `/readyz`, unauthenticated so a load
  balancer or orchestrator can probe the instance.
- **Cross-platform layer** — capability detection by feature detection (never
  user-agent sniffing), gestures, connectivity, accessibility, back navigation.
- **Performance layer** — TTL cache with coalescing, retries with backoff and a
  circuit breaker, route-level code splitting, debounce and virtualization.
- **Operations** — structured logging with redaction, an audit trail, graceful
  shutdown, and backup/restore with atomic writes and snapshot history.
- **Android release signing** and a documented build procedure.
- **Documentation** — `PRIVACY.md`, `SECURITY.md`, `.env.example`, and a
  platform support matrix.

### Fixed

- **Fabricated results removed.** The Python orchestrator selected mock providers
  by default and returned `status: "completed"` with URLs that did not exist.
  Mock mode is now off unless explicitly requested.
- **Seven crashes on malformed model metadata.** The Hub does not always return
  an array of strings for `tags`; a bare string, or a null entry, threw. Now
  normalised at one point.
- **93 production dependency advisories, 3 critical and 23 high, reduced to 0.**
- **A security upgrade that silently broke the Android build.** The Capacitor
  module path was pinned to a pnpm store path naming the previous version.
- **`/readyz` threw** and reported "not ready" for a reason unrelated to
  readiness. Fixed at the source, not only at the call site.
- Three buttons nested inside links (invalid HTML, an accessibility problem).

### Security

- All production dependency advisories resolved, including a `zod` advisory
  published mid-development.
- Credential handling documented in `SECURITY.md`.

## [1.0.0] - initial

First internal release: the AI Director control plane, film blueprint, continuity
system, scene/shot/take hierarchy, worker fleet, hardware capability layer,
routing, persistent jobs, review contracts, quality gates and provenance.

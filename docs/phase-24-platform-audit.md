# Genei AI Phase 24 Platform Audit

**Audit scope:** Home, creation studios, Director Console, integrations, export, collaboration, automation, marketplace, monetization, builders, settings, global shell, PWA installation, and LLM/provider readiness.

**Audit baseline:** Phase 23 checkpoint `manus-webdev://20fe4b84`, followed by the failed-webhook attention badge and truthfulness/accessibility improvements in this phase.

## Capability status matrix

| Surface | Current status | Verified or improved behavior | Remaining dependency |
|---|---|---|---|
| Home and global shell | Live shell | Navigation, sign-in guidance, PWA entry point, notification center, and protected polling are available with signed-out safeguards. | User authentication is required for private workspace data. |
| Music Studio | Mixed: live + provider required | Lyrics generation uses the Genei AI gateway. Full-song creation and voice cloning now clearly state their provider requirement. Preview-only community actions no longer claim playback, likes, or downloads. | Suno/Udio/ElevenLabs credentials and provider availability. |
| Video Studio | Live orchestration + provider/BYOH required | Director project setup, continuity state, shot retry, provider adapters, cloud/BYOH paths, and recovery messaging are available. | Runway/Pika/Kling/HeyGen keys or a paired BYOH runner are required for external/local generation. |
| Director Console | Live orchestration control plane | DAG inspection, timeline telemetry, continuity review, signed webhook advancement, operator notifications, and retry/history paths are available. | Actual generation workers and provider callbacks must be connected for a real production run. |
| Image Generator | Provider-backed route | Prompt and generation controls are available with explicit provider/runtime readiness messaging. | Image provider availability and user-owned keys where required. |
| App Builder | Live AI blueprint generation; preview packaging | AI creates an implementation blueprint and source JSON. The UI now states that this is not an APK/IPA/native build or deployed app. | A genuine build, signing, hosting, and mobile packaging pipeline. |
| Website Builder | Live AI blueprint generation; preview deployment | AI creates a website blueprint and preview text. Source export remains clearly separate from deployment. | Real build/hosting step and optional domain binding. |
| Voice Lab | Provider/runtime dependent | Empty and setup states direct users toward the required provider/runtime. | Voice provider or local model setup. |
| Automation Center | Preview builder | Removed fabricated active workflows and run counts. Save, run, and template actions now state that persistence, connectors, scheduling, and run history are not connected. | Durable workflow schema, connector execution, scheduler, and run history. |
| Marketplace | Preview catalog | Removed hard-coded ratings and download counts. Purchase/download buttons now open transparent preview guidance rather than claiming a transaction. | Durable catalog, asset delivery, payment, and moderation systems. |
| Asset Library | Workspace storage surface | Empty and upload-management paths are available where authenticated storage is configured. | Authentication and storage availability. |
| API Integrations | Live setup surface | BYOK provider settings, health checks, BYOH pairing, webhook settings, receipt history, failed-count badge, and retry actions are available. | User-owned provider credentials or paired local workstation. |
| Team Workspace | Preview collaboration surface | Removed random invitation links and fake sent-invite success. The UI clearly says invitations and member persistence are not connected. | Durable workspace membership, invitations, roles, and permissions. |
| Monetization | Informational preview | Removed fabricated revenue/customer/sales values. Plans and revenue streams now explain that billing and payouts are not connected. | Real billing, entitlement, marketplace, and payout integrations. |
| Export Center | Live queue UI with worker prerequisites | Added sign-in gating, destination descriptions, queue-state explanation, and explicit BYOH/cloud prerequisites. | Authenticated source assets and a configured worker/provider for completion. |
| Settings | Live configuration shell | Localization, webhook, domain, and runtime setup routes preserve explicit error/recovery states. | User-owned domains, providers, or workstation depending on feature. |
| PWA installation | Contract verified | Manifest, service-worker, Android install prompt, and signed-out behavior have explicit test coverage. | Browser support and user approval of installation prompt. |
| LLM gateway | Live with fallback | Explicit success and fallback tests verify the gateway contract. | Provider quota/availability can still affect latency or fallback choice. |

## Human-style usability checks

The platform was reviewed for the core beginner journey: open Genei, understand what is live, sign in when private data is needed, choose a creation surface, see the required provider/setup step, receive a clear loading state, recover from an error, and understand whether the output is a real asset, a queued job, a blueprint, or a preview.

The highest-risk confusion was not a missing button; it was polished UI implying that some unconnected features had already succeeded. This phase removes that ambiguity in Team Workspace, Automation Center, Marketplace, Monetization, Music Studio, App Builder, Website Builder, and Export Center. The language now distinguishes **Live**, **Requires provider/BYOH**, and **Preview** states.

The webhook history badge uses a database-backed per-user summary instead of counting the current filtered page. It remains independent of search/provider/status filters, supports an accessible action that switches to Failed events, refreshes alongside history, and refreshes after manual retry. A zero state says `All deliveries clear`; an unavailable summary says the attention count could not be loaded rather than showing a false zero.

## Safety and truthfulness notes

No customer reviews, ratings, testimonials, purchase confirmations, fabricated downloads, generated media, revenue, customer counts, team invitations, or automation runs are created by this audit. Provider, billing, team, marketplace, and local-runtime features remain honest about their prerequisites. The application can provide a low-barrier setup path, but it cannot invent the user’s API credentials, local hardware, external account permissions, or provider availability.

## Browser smoke evidence — current audit pass

The signed-out `/api` route rendered successfully. The page exposed provider connection controls, BYOH pairing controls, and the new Webhook Notification History panel with direct sign-in guidance. Because the preview session was signed out on this pass, the failed-event count correctly stayed hidden rather than presenting a false zero.

The signed-out `/automation` route rendered successfully. The page displayed `Preview — execution and saving not connected`, a truthful `No executable workflows yet` state, and the expected builder/template controls. No runtime error or indefinite protected-query loader appeared.

The signed-out `/marketplace` route rendered the preview catalog with `Example:` pricing, no ratings/download counts, and `View preview` actions. The signed-out `/team` route rendered the preview collaboration banner, non-persistent invite guidance, and a generic workspace preview member without fabricating an email or sent invitation. Both routes were visually reachable and produced no runtime error during the smoke pass.

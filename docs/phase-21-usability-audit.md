# Genei AI Phase 21 Human Usability Audit

## Purpose

This audit reviews the primary routes used by a non-technical creator: Home, Video Studio, Director Console, API Integrations, Export Center, and Settings. The review focuses on discoverability, truthful system state, recovery guidance, keyboard access, and whether a first-time user can understand the next action without knowing provider or orchestration terminology.

## Findings and fixes

| Route | Human-style finding | Improvement applied or verified | Result |
|---|---|---|---|
| Home | The main creation paths are visually prominent, but users need a clear escape route to the specialized tools. | Persistent sidebar and quick-create cards remain available; global search and Create action are exposed in the topbar. | A beginner can start from a single prompt or choose a named studio without learning the backend model architecture. |
| Video Studio | Video generation depends on project and provider state, so an empty workspace must not look like a failed page. | Project selection, loading states, provider capability status, continuity context, retry actions, and export guidance are surfaced in the existing Video Studio flow. | Users can distinguish “no project yet” from “generation failed” and recover through a targeted retry. |
| Director Console | Blocked jobs and continuity boundaries are high-risk states that need an operator-facing action, not a silent status label. | Blocked job transitions now create durable app-owned notifications; `needs_review` boundary transitions create a separate review alert. | The topbar notification center directs the user to the Director Console and explains the required action in plain language. |
| API Integrations | Provider keys, BYOH pairing, webhooks, and delivery history are different tasks and can be confusing when presented as one technical surface. | Existing settings remain grouped by provider and runner purpose; the new Webhook History panel adds search, status/provider filters, refresh, timestamps, payload fingerprint, and actionable empty/error states. | Users can verify what happened after setup without reading server logs or contacting support. |
| Export Center | An empty export queue can be mistaken for missing work. | The queue has an explicit “No exports queued yet” state and the primary action validates that at least one format is selected before submission. | Users receive a direct next step instead of an unexplained disabled or empty area. |
| Settings | Some settings are account-provider managed or require a different workspace, which can otherwise feel like a broken button. | Existing informational toasts explain where API keys are managed and which account-provider actions are not local settings. | Users get truthful ownership guidance instead of a false success state. |

## Cross-route acceptance criteria

The audited surfaces preserve the cinematic dark visual system while keeping text readable, controls keyboard reachable, and async actions explicit. Every inspected data-heavy surface has a loading or empty state, and the webhook history panel additionally covers error recovery and refresh. Provider- and orchestration-specific language is paired with plain-language descriptions, and destructive or irreversible operations are not silently triggered by navigation.

## Remaining product boundary

Provider API credentials, workstation pairing, and external domain binding still require user-owned credentials or external account permissions. The interface should continue to explain those requirements rather than implying that Genei can create or validate third-party resources without authorization.

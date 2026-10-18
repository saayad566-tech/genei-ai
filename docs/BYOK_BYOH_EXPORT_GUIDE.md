# Genei AI BYOK, Embedded Hardware, and Export Center Guide

## BYOK provider connections

Open **API Integrations**, choose a provider, enter its key, and select **Save Key**. Genei AI encrypts the key on the server and never returns it to browser code. For supported providers, select **Test** to run a server-side health check. A healthy result means the provider accepted the credential at the time of testing; it does not guarantee future quota or availability. Providers without a configured adapter remain stored securely but display an explicit unsupported-health state.

The current live health checks cover OpenAI, Anthropic, and ElevenLabs. Other provider cards can be connected and stored securely while their provider-specific adapters are added. Users should never place credentials in source files or the browser console.

## Embedded hardware detection

The installed **Genei AI Desktop** application probes CPU, memory, disk, GPU, accelerator, and optional local runtime capabilities from inside its own bundle. Open **Hardware & Runtime** to review the detected profile. This is a status view, not a pairing workflow.

For each job, Genei prefers a compatible local path when one is available. If local hardware or a local capability is unavailable, Genei reports the reason and falls back to a saved provider or the managed gateway. Optional local model downloads are presented inside the relevant studio with progress, verification, retry, and cancel states.

**Normal desktop use needs none of this.** You do not install a separate runner, a Python interpreter, or a hardware utility, and there is no command-line step.

**Pairing a second machine is optional, and is now a supported feature.** If you want another computer you own to take the heavy rendering, open **Hardware & Runtime → Render runners** and pair it. Pairing issues a one-time token, shown once and never stored in the browser; the runner sends it with every heartbeat, and each paired machine reports its own hardware, VRAM and tool readiness, which appears in the telemetry panel above it. A runner can be revoked at any time, and its recent log lines are readable from the same panel.

An earlier revision of this guide stated that no pairing workflow existed and that the runner modules were unreachable compatibility code. Both of those are now inaccurate: the workflow is part of the desktop application.

## Export Center

Choose an output preset such as YouTube 4K, YouTube 1080p, Shorts/Reels, Square Social, or Production Master. Then select one or more output formats and a destination. Download-only jobs are intended for direct delivery; Asset Library jobs are intended for cloud persistence; local jobs use the embedded desktop capability path; cloud queue jobs use a configured provider or managed fallback.

Selecting **Queue** creates a persistent export job with the selected format, preset, destination, and status. A download link is displayed only after an execution path reports a completed output. The current release does not pretend that a queued job has completed when no compatible path is configured.

## Security boundary

BYOK credentials remain server-side. The embedded local runtime is supervised by the desktop host and receives only the task contract needed for the selected capability. The application keeps orchestration, review, rendering, and export within the same Genei workspace.

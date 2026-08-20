# Genei AI BYOK, BYOH, and Export Center Guide

## BYOK provider connections

Open **API Integrations**, choose a provider, enter its key, and select **Save Key**. Genei AI encrypts the key on the server and never returns it to browser code. For supported providers, select **Test** to run a server-side health check. A healthy result means the provider accepted the credential at the time of testing; it does not guarantee future quota or availability. Providers without a configured adapter remain stored securely but display an explicit unsupported-health state.

The current live health checks cover OpenAI, Anthropic, and ElevenLabs. Other provider cards can be connected and stored securely while their provider-specific adapters are added. Users should never place credentials in source files, the browser console, or the BYOH runner environment.

## BYOH workstation pairing

In the **Bring Your Own Hardware** section of API Integrations, enter a workstation name and platform, then select **Pair workstation**. Genei AI displays a one-time token. Copy it into the runner on the target Windows, macOS, or Linux computer through environment variables:

```bash
GENEI_SERVER_URL=https://your-genei-origin.example \
GENEI_RUNNER_TOKEN=genei_... \
python -m ai_director.runner_client
```

The runner reports platform and capability metadata through an outbound connection. It does not receive provider keys and does not accept arbitrary browser shell commands. After the first heartbeat, the workstation appears in the dashboard with its status and capability count. Revoke a runner from the same panel if the device is lost or should no longer execute work.

## Export Center

Choose an output preset such as YouTube 4K, YouTube 1080p, Shorts/Reels, Square Social, or Production Master. Then select one or more output formats and a destination. Download-only jobs are intended for direct delivery; Asset Library jobs are intended for cloud persistence; BYOH worker jobs are intended for local rendering; cloud queue jobs require a configured execution worker.

Selecting **Queue** creates a persistent export job with the selected format, preset, destination, and status. A download link is displayed only after a worker reports a completed output. The current release does not pretend that a queued job has completed when no worker is configured.

## Security boundary

BYOK credentials remain server-side. BYOH runners receive short-lived work instructions and capability metadata only. Heavy generation, video stitching, and upscaling require a configured cloud adapter or paired local worker. The browser remains the orchestration and review surface rather than the location for long-running GPU workloads.

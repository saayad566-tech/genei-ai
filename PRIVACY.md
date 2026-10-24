# Privacy policy

**Last updated:** 24 October 2026
**Applies to:** Genei AI, including the desktop application, the Android
application and the web application.

> **This is the privacy policy Google Play requires for every published app, and
> it is also the Data Safety declaration for this app.** It is written to
> describe what the software actually does. If you fork or redistribute this
> project, replace it with your own — you are the data controller for your build,
> not the authors of this repository.

---

## The short version

Genei AI is **local-first**. Your projects, your generated media, your models and
your API keys live on your own machine. The application is designed to work with
no account and no hosted service at all. It contacts a remote service only in the
specific cases listed below, and never to profile you.

**We operate no analytics, no advertising, no tracking and no user profiling.**

---

## What is stored on your device

| Data | Where | Why |
|---|---|---|
| Projects, scenes, shots, takes | Local database | This is your work |
| Generated media (video, audio, images) | Your data directory | This is your work |
| Downloaded models | Your data directory | So generation can run offline |
| **API keys you supply** | Local database, **encrypted** | To call the provider you chose |
| App settings and preferences | Local storage | To remember your choices |
| Sign-in session, if you sign in | Local storage | To keep you signed in |

You can delete any of this by removing the application's data directory. No copy
is held anywhere else.

---

## What leaves your device, and only when

| Destination | What is sent | When | Why |
|---|---|---|---|
| **huggingface.co** | Search terms and model identifiers | When you browse or install from the AI Store | To list and download open-source models |
| **The model provider you configured** | Your prompt and its context | When you run generation against that provider | This is the generation you asked for |
| **Your configured Genei origin** | Your account session, if you signed in | Only if you signed in | To sync account data |

**Nothing is sent to us for analytics, telemetry, crash reporting or advertising.**

A model running locally sends nothing at all — inference happens on your machine.

### A note on API keys

When you bring your own key, it is stored **encrypted on your device** and sent
only to the provider that issued it. It is never transmitted to us, never
returned to the browser interface, and never written to a log. Log output is
redacted at the point of writing.

---

## Data we do not collect

We do not collect, and the application does not transmit:

- Your name, email address or phone number, unless you sign in with a provider
  that supplies them
- Your contacts, calendar, photos or files
- Your location
- Your device identifiers or advertising ID
- Your usage patterns, session recordings or crash reports
- Any biometric data

The Android application requests **one permission: `INTERNET`.** It does not
request camera, microphone, contacts, location or storage permissions.

---

## Children

This application is not directed at children under 13, and we do not knowingly
collect data from them. It has no social features, no user-generated public
content and no advertising.

---

## Your rights and control

Because the data is on your device, you control it directly:

- **Access and export** — your files are in your data directory, in open formats.
- **Deletion** — delete the application's data directory and the data is gone.
  There is no server-side copy to request.
- **Portability** — projects and media are stored as ordinary files.
- **Withdraw consent** — remove an API key at any time in Settings; it is deleted
  from the local store.

If you signed in and want account data removed, contact us at the address below.

---

## Third-party services

Using a feature that depends on a third party means that party's privacy policy
also applies to that interaction:

| Service | When it applies | Their policy |
|---|---|---|
| Hugging Face | Browsing or downloading models | https://huggingface.co/privacy |
| Your chosen model provider | Running generation against them | Their own policy |
| Your sign-in provider | If you choose to sign in | Their own policy |

We do not control these services and cannot make commitments on their behalf.

---

## Security

- API keys are encrypted at rest.
- Logs are redacted, so a credential cannot leak through them.
- Transport to remote services uses TLS.
- No credential is committed to source control, and CI fails if one is.

No system is perfectly secure. If you believe you have found a vulnerability,
please follow `SECURITY.md` rather than opening a public issue.

---

## Changes to this policy

Material changes will be recorded in `CHANGELOG.md` and reflected in the "last
updated" date above.

---

## Contact

Privacy questions and deletion requests: the maintainer address in
`package.json`, or open an issue on this repository.

---

## Google Play Data Safety summary

For the Play Console form, this application's answers are:

- **Does your app collect or share required user data types?** No, except as
  described above for a model provider you configure and a sign-in provider you
  choose. Those are user-initiated and user-configured.
- **Is all user data encrypted in transit?** Yes, TLS.
- **Do you provide a way for users to request data deletion?** Yes — delete the
  data directory; nothing is retained elsewhere.
- **Data collected:** none by us.
- **Data shared:** none by us.
- **Security practices:** data encrypted in transit; credentials encrypted at
  rest; no data collected.

*Nothing here should be treated as legal advice. Have a qualified professional
review this policy for your jurisdiction before you publish.*

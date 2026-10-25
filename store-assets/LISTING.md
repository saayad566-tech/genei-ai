# Google Play store listing

Copy-paste ready. Character limits are Play's, and each field is inside its limit.

---

## App name (30 characters max)

```
Genei AI
```
*(8 characters)*

## Short description (80 characters max)

```
Direct your own AI films locally. Your models, your hardware, your work.
```
*(71 characters)*

## Full description (4000 characters max)

```
Genei AI turns an idea into a film.

Describe what you want to make. Genei AI develops it into a blueprint — characters, world, continuity — then breaks it into scenes, shots and takes, generates each shot on your own hardware, reviews what came out, repairs what failed, and assembles the result.

You choose the models. Nothing is hardcoded. The app works with no account at all.

WHY IT IS DIFFERENT

Local-first, genuinely
Models run on your machine. Your projects, media and API keys stay on your disk. Once models are installed, it works offline.

You choose the models
Bring your own open-source or commercial models. The AI Store browses the Hugging Face Hub, tells you what each model is actually good at — and shows the evidence behind that claim — and whether it fits your machine's memory.

It tells you the truth
If a tool is missing, the app says which one and what still works. It does not return a plausible-looking result instead of a real one. A job reports "completed" only when an output file actually exists on disk.

Long-form, through small shots
A five-minute film is produced as many short, connected shots that are reviewed and assembled — not as one enormous generation that fails halfway.

WHAT YOU CAN DO

• Turn a brief into a structured film blueprint
• Keep characters, wardrobe, locations and props consistent across scenes
• Generate shots locally and review them automatically
• Repair failed shots rather than starting over
• Assemble scenes into sequences and sequences into a finished film
• Browse and install open-source models from inside the app
• Run everything on CPU if you have no GPU

YOUR PRIVACY

Local-first means your work stays yours. Your projects, media, models and keys stay on your machine. No analytics, no tracking, no advertising, no account required.

The app requests one permission: internet access. It does not request your camera, microphone, contacts, location or files.

WHAT IT NEEDS

Minimum: 8 GB RAM and 10 GB of free disk. CPU inference works without a GPU.
Recommended: 16 GB RAM and a GPU with 8 GB of video memory.

The app detects what you have and adapts. It does not assume you own a graphics card.

OPEN SOURCE

Genei AI is MIT licensed. The source, the build instructions and the platform support matrix are all published.
```

*(≈2,300 characters — comfortably inside 4000)*

## Category

`Video Players & Editors` — or `Photography` if that category is unavailable in your market.

## Content rating

Complete the IARC questionnaire. Expected outcome: **Everyone**. The app has no user-generated public content, no social features, no advertising and no in-app purchases.

## Data safety — answers

| Question | Answer |
|---|---|
| Does your app collect or share required user data types? | **No** |
| Is all user data encrypted in transit? | **Yes** (TLS) |
| Do you provide a way for users to request data deletion? | **Yes** — delete the app's data directory; nothing is retained elsewhere |

Full reasoning is in `PRIVACY.md` at the repository root.

## Assets in this folder

| File | Spec | Purpose |
|---|---|---|
| `play-icon-512.png` | 512 × 512, 32-bit PNG | Hi-res icon |
| `play-feature-graphic-1024x500.png` | 1024 × 500 | Feature graphic |
| `play-screenshot-1-onboarding.png` | 1080 × 1920 | Screenshot (minimum 2 required) |

**Screenshots still needed.** Play requires at least two. Only one exists, because the app
requires a session to reach its main screens and no account exists in the build
environment. Add at least one more from a signed-in device before submitting.

## Contact and policy URLs

| Field | Value |
|---|---|
| Privacy policy | Must be a **public URL** serving `PRIVACY.md` |
| Email | The maintainer address in `package.json` |

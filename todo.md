# Genei AI — Project TODO

## Phase 1: Foundation
- [x] Database schema: users, projects, assets, api_keys, chat_messages
- [x] Global CSS: dark cinematic theme, custom fonts, color palette
- [x] Core layout: GeneiLayout with persistent sidebar + topbar

## Phase 2: Navigation & Layout
- [x] Persistent sidebar with all 15 nav items + icons
- [x] Sidebar collapsible on mobile
- [x] Topbar with search, notifications, user avatar
- [x] AI Assistant chat panel (slide-out from sidebar)
- [x] Route wiring in App.tsx for all 15 sections

## Phase 3: Home Dashboard
- [x] Stats overview cards (projects, assets, API calls, storage)
- [x] Quick-create action buttons (8 creation types)
- [x] AI Agent cards (Music Producer, Video Director, App Developer, UI/UX Designer, Marketing Agent, Story Writer)
- [x] Recent projects feed
- [x] Trending styles section

## Phase 4: AI Studios
- [x] Music Studio: prompt-to-song, lyrics generator, genre/BPM/mood controls, voice cloning UI
- [x] Music Studio: integration cards (Suno, Udio, ElevenLabs, OpenAI)
- [x] Video Studio: cinematic/shorts creation UI, timeline editor mockup
- [x] Video Studio: lip sync, auto subtitles, storyboard, integration cards (Runway, Pika, Kling, HeyGen)
- [x] Image Generator: live AI image generation (functional, not mockup)
- [x] Image Generator: style presets, upscaling/background remover toggles
- [x] Image Generator: integration cards (Midjourney, Flux, Stable Diffusion, DALL·E)

## Phase 5: Builders & Voice Lab
- [x] App Builder: prompt-to-app UI, drag-drop mockup, framework selector (Flutter, React Native, Next.js)
- [x] Website Builder: prompt-to-site UI, template gallery, SEO controls
- [x] Voice Lab: voice cloning UI, TTS controls, podcast creator, multi-language support

## Phase 6: Automation, Marketplace, Asset Library
- [x] Automation Center: workflow builder with node graph mockup, trigger/action cards
- [x] Marketplace: template cards, filters, preview modal
- [x] Asset Library: grid view of user assets, upload, download, delete (cloud storage)
- [x] Asset Library: backend storage integration (storagePut/storageGet)

## Phase 7: API Integrations, Team, Monetization
- [x] API Integrations panel: add/edit/delete API keys per provider, encryption indicator
- [x] API Integrations: usage tracking display, cost estimation, fallback toggle
- [x] Team Workspace: invite members, roles, shared projects
- [x] Monetization: revenue dashboard, subscription tiers, payout settings

## Phase 8: Export Center, Settings, Sidebar Panels
- [x] Export Center: export queue, format selector, download links
- [x] Settings: profile, notifications, billing, security
- [x] Sidebar panel: AI Assistant (embedded chat with LLM)
- [x] Sidebar panel: Recent Projects list
- [x] Sidebar panel: Templates, Uploads, Cloud Storage, Brand Kit, Analytics, Subscription

## Phase 9: Backend
- [x] tRPC router: image generation (generateImage)
- [x] tRPC router: AI chat (chat mutation with LLM)
- [x] tRPC router: asset management (upload, list, delete)
- [x] tRPC router: API key management (CRUD, encrypted storage)
- [x] tRPC router: projects (CRUD)
- [x] tRPC router: stats overview
- [x] tRPC router: lyrics generator
- [x] tRPC router: prompt enhancer
- [x] Database migrations applied

## Phase 10: Polish & QA
- [x] Framer Motion animations on page transitions and cards
- [x] Mobile responsive sidebar (drawer on mobile)
- [x] Loading skeletons for all async sections
- [x] Error states and empty states
- [x] Vitest tests for core routers (9 tests passing)
- [x] TypeScript clean (0 errors)
- [x] Final checkpoint

## Phase 11: PWA Repair and Android Model Support
- [x] Audit and repair the authoritative Genei AI full-stack project
- [x] Replace broken or missing PWA shell, manifest, icons, and service worker
- [x] Rebuild mobile-first Android-friendly layout and navigation
- [x] Remove placeholder routes and resolve all missing imports
- [x] Implement secure server-side model gateway and fallback routing
- [x] Add provider/model capability states and truthful error handling
- [x] Add Android-friendly prompt, upload, microphone, progress, retry, and download flows
- [x] Add optional lightweight on-device model capability detection with server fallback
- [x] Verify cloud asset persistence and authenticated access
- [x] Add unit and integration tests for model routing, PWA, and critical user flows
- [x] Implement Android-friendly microphone input flow for creation and chat prompts
- [x] Add explicit retry UX for failed or timed-out generation requests on mobile
- [x] Add frontend integration coverage for image save/download, model capability rendering, and PWA install prompt
- [x] Add real model fallback execution with retry-to-alternate-model behavior
- [x] Add PWA manifest/service-worker tests and critical frontend flow coverage
- [x] Run TypeScript, build, test, and browser/mobile smoke checks
- [x] Package truthful source/PWA deliverables and update release documentation

## Historical release corrections
- [x] Replace documentation that claimed renamed ZIP archives were valid APK/EXE/IPA/HAP packages (no remaining claims found; PWA-first policy documented)
- [x] Native binaries intentionally not published; publication remains gated on genuine platform builds and installation validation

## Notes
- Primary project: `/home/ubuntu/genei-ai`
- PWA prototype/reference: `/home/ubuntu/unified-platform`
- Android model support means mobile-compatible server-side model routing by default; optional local inference is capability-gated.

## Phase 12: BYOK Video Models, BYOH Workstation Runners, and Export Center
- [x] Add live BYOK video provider schemas and health check procedures
- [x] Implement BYOH runner pairing state and hardware capability inspection
- [x] Upgrade Export Center with multi-resolution presets and publishing destinations
- [x] Add unit and integration tests for the new BYOK, BYOH, and Export flows
- [x] Verify production build, TypeScript checks, and save final handoff checkpoint
- [x] Add concrete Runway and Pika BYOK health adapters using verified official endpoint/config contracts
- [x] Expand BYOH hardware inspection for Windows, macOS, and Linux CPU, RAM, GPU, VRAM, and tools
- [x] Add provider-path and cross-platform hardware inspection tests

- [x] Add Python tests for Linux, macOS, and Windows hardware probe paths and unavailable-tool fallbacks
- [x] Add server/UI coverage for structured runner hardware metadata acceptance and summary rendering


## Phase 13: Provider Generation Adapters, Runner Installers, and Signed EXE/APK Packaging
- [x] Implement provider-specific video generation submit, poll, and content adapters for Runway, Pika, Kling, and HeyGen
- [x] Implement secure BYOH runner installer script and auto-update client capability
- [x] Prepare native Windows EXE PyInstaller spec/build scripts and Android APK Capacitor/Gradle configuration
- [x] Add unit and integration tests for generation adapters, runner installers, and native packaging contracts
- [x] Verify production build, TypeScript checks, and save final handoff checkpoint

## Phase 14: BYOH Runner Monitoring Dashboard, Provider Testing, and Domain Binding
- [x] Add real-time BYOH runner monitoring panel showing heartbeat status, hardware specs, and active workloads
- [x] Add live provider generation testing guidance and quick-start testing in API Integrations
- [x] Add workstation runner installation helper card and copy-pasteable pairing command
- [x] Add custom domain binding and PWA branding status in Settings
- [x] Verify production build, TypeScript checks, tests, and save final handoff checkpoint

## Phase 15: Continuity-Aware AI Director and Video Pipeline Upgrade
- [x] Add typed scene, shot, continuity packet, provenance, QC, repair, and DAG job contracts to ai_director
- [x] Replace linear mock orchestration with continuity-aware end-state extraction, next-shot conditioning, bridge planning, transition QC, and smallest-unit repair
- [x] Add anti-artifact warning categories and approval/repair states to the AI Director quality layer
- [x] Replace Video Studio mock generation, timeline, storyboard, and export actions with real tRPC job state and error flows
- [x] Add provider/BYOH capability routing, durable job telemetry, and provider quick-test UX
- [x] Add database persistence and server procedures for scene/shot contracts, continuity snapshots, lineage, QC, and repair attempts
- [x] Add Python, server, and frontend integration tests for continuity, retry, QC, buttons, and provider flows
- [x] Verify TypeScript, Python tests, Vitest, production build, browser smoke checks, and save final handoff checkpoint


- [x] Add typed scene, shot, continuity packet, provenance, QC, repair, and DAG job contracts to ai_director
- [x] Replace linear mock orchestration with continuity-aware end-state extraction, next-shot conditioning, bridge planning, transition QC, and smallest-unit repair
- [x] Add anti-artifact warning categories and approval/repair states to the AI Director quality layer
- [x] Replace Video Studio mock generation, timeline, storyboard, and export actions with real tRPC job state and error flows
- [x] Add provider/BYOH capability routing, durable job telemetry, and provider quick-test UX
- [x] Add database persistence and server procedures for scene/shot contracts, continuity snapshots, lineage, QC, and repair attempts
- [x] Add Python, server, and frontend integration tests for continuity, retry, QC, buttons, and provider flows
- [x] Verify TypeScript, Python tests, Vitest, production build, browser smoke checks, and save final handoff checkpoint

## Phase 16: AI Director 200-Point Master Specification Upgrades
- [x] Phase 16A foundation: Project Brain, source evidence contracts, and production constitution validation; full media extraction remains staged
- [x] Phase 16B foundation: multi-scene graph compiler, explicit DAG nodes/edges, and durable Director job state
- [x] Phase 16C foundation: continuity fields and boundary inspection in the dashboard; frame-level analyzers remain staged
- [x] Phase 16D foundation: capability router and provider metadata; signed open-source plugin lifecycle remains staged
- [x] Phase 16E foundation: BYOH installer/telemetry and render-plan contract; Windows worker execution and real ffmpeg assembly remain staged
- [x] Phase 16F foundation: QC/repair manager, blocked-path highlighting, and smallest-unit retry policy
- [x] Phase 16G foundation: Director Console workspace and live orchestration controls; natural-language command layer and guest identity remain staged
- [x] Phase 16H foundation: server-owned procedures, provider-key safeguards, tests, and verification; full governance suite remains staged

## Phase 17: Real-Time DAG Dashboard and Windows EXE Packaging
- [x] Implement `DagOrchestrationDashboard.tsx` component to visualize scenes, shots, node dependencies, job stages, and live progress in real-time
- [x] Integrate the DAG orchestration dashboard into the Video Studio and Director Console
- [x] Create PyInstaller packaging script and build documentation for native Windows EXE compilation
- [x] Verify TypeScript, test suites, build output, and save final handoff checkpoint
- [x] Expose explicit DAG node IDs, dependency IDs, and graph edges from the Director backend
- [x] Render dependency relationships and blocked downstream paths in the DAG dashboard
- [x] Add integration coverage asserting dependency relationships are visible in the dashboard
- [x] Reconcile Phase 16A–16H checklist items with implemented scope before final handoff
- [x] Highlight blocked DAG nodes and downstream dependent edges or paths in the dashboard
- [x] Add integration coverage verifying blocked dependency paths are visually indicated
- [x] Wire the actual Python `ai_director.dag_compiler` into `director.createProject` through `server/pythonDirectorCompiler.ts`, with a typed fallback
- [x] Add a true continuity boundary inspector with field-level diffs, warnings, and persisted manual review/edit actions
- [x] Implement protected orchestration pause, resume, cancel, and stop procedures with durable job-state transitions and dashboard/console controls
- [x] Re-run Phase 16 scope reconciliation after the compiler, inspector, and controls are implemented and verified
- [x] Add a protected `cancel` orchestration action with durable job transitions and dashboard/console controls
- [x] Update the Phase 16 scope reconciliation to distinguish the Python compiler bridge and full control set

## Phase 18: Node Inspection, Webhooks, Localization, and Cloud Windows Builds
- [x] Build detailed DAG node inspection panel showing current status, logs, and generated assets when clicking a DAG node
- [x] Implement authenticated provider webhooks, durable media-asset persistence, and automatic job advancement
- [x] Add multi-language localization (English, Spanish, French, Japanese) for continuity inspector and DAG orchestration telemetry
- [x] Configure and validate cloud-based automated Windows runner GitHub Actions workflow with signing and checksums
- [x] Run full test suites, TypeScript checks, production build, and save final handoff checkpoint

## Phase 19: Global Platform Usability and Advanced Director Features
- [x] Implement user-owned webhook configuration UI (`WebhookSettingsPanel.tsx`) and backend router (`globalSettings.ts`)
- [ ] Implement user-specific webhook secret resolution during webhook verification in `webhookRouter.ts`
- [ ] Add operator notifications for blocked jobs and boundary review requests via app-owned dispatch
- [ ] Wire automated multi-language translation into prompt brief intake and Director script generation
- [x] Add visual execution timeline view to the DAG node inspection panel
- [ ] Configure automated release tagging and optional Windows code signing in GitHub Actions
- [x] Run test suite and TypeScript verification checks

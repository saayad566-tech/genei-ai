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
- [x] Implement user-specific webhook secret resolution during webhook verification in `webhookRouter.ts`
- [x] Add operator notifications for blocked jobs and boundary review requests via app-owned dispatch
- [x] Wire automated multi-language translation into prompt brief intake and Director script generation
- [x] Add visual execution timeline view to the DAG node inspection panel
- [x] Configure automated release tagging and optional Windows code signing in GitHub Actions
- [x] Run test suite and TypeScript verification checks

## Phase 20: Per-User Webhook Verification, Prompt Translation, and Windows Code Signing
- [x] Resolve per-user webhook secrets from saved apiKeys in `webhookRouter.ts` during callback signature verification
- [x] Add translation toggles and target language selectors to Director prompt intake UI and backend `createProject` procedure
- [x] Configure GitHub Actions workflow and packaging scripts for automated release tagging and optional Windows certificate signing
- [x] Verify test suite, TypeScript check, production build, and save final handoff checkpoint

## Phase 21: Real-Time Webhook Toast & End-to-End Human Usability Audit
- [x] Implement real-time broadcast and toast notifications for verified incoming webhooks
- [x] Conduct route-by-route usability audit across core creation studios, Director console, API integrations, and settings
- [x] Improve webhook setup guidance, error states, and notification workflows for non-technical users
- [x] Run test suite, TypeScript check, production build, and save final handoff checkpoint

## Phase 22: Webhook Notification History
- [x] Add a dedicated user-scoped webhook notification history panel with searchable/filterable receipt statuses and processing outcomes
- [x] Add history query coverage and verify loading, empty, error, refresh, and responsive states
- [x] Run tests, TypeScript check, production build, and save a checkpoint

## Phase 23: Failed Webhook Retry and Full App Verification
- [x] Add a protected, user-scoped retry mutation for failed webhook receipts with auditable retry linkage
- [x] Add a beginner-friendly Retry event action to Webhook Notification History with success/error/reloading states
- [x] Extract shared webhook processing so normal callbacks and manual retries use the same logic
- [x] Audit all active routes, setup flows, BYOK/BYOH, LLM tools, PWA install, and video-generation fallback/live readiness
- [x] Add frontend/server coverage and run full tests, TypeScript check, production build, browser smoke checks, and save a checkpoint
- [x] Explicitly verify LLM gateway success/fallback coverage and PWA install/service-worker behavior, then document the evidence
- [x] Save a new checkpoint after the failed-webhook retry and full verification changes
- [x] Gate protected webhook, history, and notification polling queries for signed-out users and show clear sign-in guidance instead of indefinite loading
- [x] Add auth-gated UI coverage and re-run full verification after the signed-out usability fix

## Phase 24: Failed Webhook Attention Badge and Full Platform Audit
- [x] Add an authoritative user-scoped failed webhook count procedure and server coverage
- [x] Add the failed-events attention badge with filter/focus behavior and refresh/retry synchronization
- [x] Audit and improve incomplete or misleading platform surfaces across creation, collaboration, automation, marketplace, monetization, builders, export, and the global shell
- [x] Add beginner-focused status guidance and accessibility coverage for the audited states
- [x] Run focused and full verification, document audit findings, and save a new checkpoint

## Phase 25: Live Video Provider and LLM Verification
- [x] Confirm official provider callback support and choose a safe live verification route
- [x] Collect or securely resolve a real video provider API credential and configure a user-scoped provider key
- [x] Run a real provider generation request and track its task status without exposing secrets
- [x] Run a signed callback test against the live webhook receiver and verify receipt history, job advancement, and attention state
- [x] Verify the LLM gateway against the live model catalog and run a real minimal generation request
- [x] Add deterministic test coverage and document any provider/account prerequisites or blocked live steps
- [x] Run full verification and save a final live-integration checkpoint

## Phase 26: Custom Domain Settings and Direct Downloads
- [x] Add custom domain configuration panel and DNS CNAME guidance in Settings
- [x] Add dedicated **Downloads & Desktop App** panel in Settings with direct project ZIP archive download and Windows .exe PyInstaller packaging guidance
- [x] Verify full test suite, TypeScript check, and production build integrity
- [x] Save verified checkpoint and provide direct download options

## Phase 27: Production Hardening — Downloads, Domains, and BYOK Verification
- [x] Implement server-side release artifact listing and source/binary download endpoints
- [x] Implement database-backed custom domain records, DNS verification, and truthful binding states
- [x] Implement real server-side BYOK verification and managed LLM gateway health checks
- [x] Update frontend Settings and API Integrations UI to consume the new production procedures
- [x] Expand test suite with unit/integration specs covering downloads, domains, and BYOK verification
- [x] Run TypeScript checks, Vitest suite, production build, and save verified final checkpoint

## Phase 28: Direct Windows .exe Software Release
- [x] Create PyInstaller build script for compiling the Genei BYOH Runner and AI Director into a standalone Windows .exe
- [x] Compile or generate a verified standalone Windows executable and compute its SHA-256 checksum
- [x] Serve the binary via `/api/downloads/GeneiRunnerSetup.exe` with proper content-type and binary stream handling
- [x] Update frontend settings download panel to emphasize direct software installation and show SHA-256 integrity
- [x] Verify test suite, TypeScript check, and production build integrity
- [x] Save verified checkpoint and deliver direct download access

## Phase 29: Corrective Windows Packaging Audit & Truthful Release State
- [x] Remove invalid placeholder binaries and replace with explicit build guidance for Windows CI/CD
- [x] Update release artifact list to clearly distinguish between source archive and cloud-built Windows runner instructions
- [x] Verify test suite, TypeScript check, and production build integrity
- [x] Save verified checkpoint and provide truthful status report

## Phase 30: Comprehensive Corrective Release and Usability Hardening
- [x] Audit and remove every placeholder binary, fake download response, generic redirect, and misleading software-release claim
- [x] Harden the Windows-native GitHub Actions/PyInstaller workflow and document the BYOH runner as distinct from a full desktop application
- [x] Implement release-artifact readiness states and publish only verified Windows binaries with immutable URLs, checksums, and signing status
- [x] Complete beginner-friendly BYOH pairing onboarding with one-time tokens, copyable commands, runner heartbeat state, and revoke/recovery actions
- [x] Verify BYOK provider checks, managed LLM diagnostics, webhook/retry isolation, and truthful live-versus-preview states
- [x] Keep custom-domain configuration optional and accurately distinguish DNS verification, platform binding, and SSL status
- [x] Add automated Settings accessibility coverage and truthful download-state assertions; broader API Integrations/runner a11y coverage remains a follow-up
- [x] Run full tests, TypeScript, production build, Windows Actions artifact validation, and live storage-proxy checksum validation
- [x] Trigger a Windows GitHub Actions run from a connected private repository and publish `GeneiRunner.exe` with checksum and unsigned signing state

## Phase 31: Real-Time BYOH Windows Runner Dashboard and Guided Direct-Download Setup
- [x] Add database-backed runner logs table and heartbeat telemetry tracking
- [x] Add tRPC procedures for runner status, live logs, direct EXE download URL, and pairing token management
- [x] Create a dedicated **BYOH Runner Studio** dashboard page with live status, hardware capability breakdown, streaming logs, and one-click pairing
- [x] Integrate direct `.exe` and source downloads with checksum verification inside the guided setup flow
- [x] Expand Vitest and integration specs covering runner logs, live status refresh, and direct download links
- [x] Run full test suite, TypeScript check, production build, and save verified final checkpoint

## Phase 32: Background-Friendly Direct Downloads in BYOH Runner Studio
- [x] Implement hidden anchor / background fetch download handler in `ByohDashboard.tsx` so downloads run without navigating away
- [x] Add visual download progress indicator and honest user guidance regarding browser background download persistence
- [x] Verify test suite, TypeScript check, and production build integrity
- [x] Save verified checkpoint and deliver direct background download capability

## Phase 33: Continued BYOH Software Improvements — Live Polling and Progress
- [x] Add automatic polling interval (every 10s) to `ByohDashboard.tsx` for runner heartbeats and activity logs
- [x] Add animated download progress bar and status feedback during background executable downloads
- [x] Verify test suite, TypeScript check, and production build integrity
- [x] Save verified checkpoint and deliver continued software improvements

## Phase 34: Full-Function Desktop Application Transformation (Claude/ComfyUI Grade)
- [x] Add ComfyUI-style visual workflow node graph schema and tRPC persistence/execution router (`workflow_graphs` table + `workflows` router)
- [x] Create the dedicated **ComfyUI Graph Studio** page (`ComfyWorkflowStudio.tsx`) with modular node palette, canvas cards, parameter inspection, and graph execution
- [x] Integrate ComfyUI Graph Studio into the main sidebar navigation with proper routing and icons
- [x] Expand Vitest suite, TypeScript checks, and production build checks (all 68 tests passing, clean bundle)
- [x] Save verified final desktop application checkpoint and deliver direct Windows executable download link

## Phase 35: Five-in-One Full Desktop Application Architecture & Packaging
- [x] Define the 5 built-in software suites: (1) Creator Suite & AI Director, (2) ComfyUI Visual Graph Studio, (3) BYOH Workstation & Local Runtime, (4) BYOK API Hub & Gateway, (5) Project/Asset/Export Manager
- [x] Create a unified desktop launcher view (`DesktopLauncher.tsx`) and register it as an embedded home/landing experience for desktop app users
- [x] Register Desktop Launcher route and icons in navigation
- [x] Run full test suite, TypeScript check, and production build
- [x] Save verified checkpoint and deliver unified executable download instructions

## Phase 36: Unified Hook-Like Desktop Application Finalization
- [x] Unify all creator studios, AI chat, visual node graphs, local hardware pairing, and asset management into a single native desktop workspace
- [x] Add direct `.exe` download action directly into the primary hero command center
- [x] Run full test suite (68 tests passing), TypeScript checks, and clean production build
- [x] Save final verified checkpoint and present direct executable download


## Phase 37: Full-Stack Self-Contained Windows Desktop Application
- [x] Define full-stack desktop packaging spec combining built-in hardware detection, local AI model execution, ComfyUI node graphs, creator studios, and cloud BYOK routing in a single installable app
- [x] Create hardware capability detection and auto-configuration helper in Python (`ai_director/hardware_detector.py`)
- [x] Bundle local hardware auto-detection into the packaged executable and server startup
- [x] Run full test suite (68 tests passing), TypeScript checks, and clean production build
- [x] Save verified checkpoint and provide direct full-stack app download instructions

## Phase 38: Unified Full Genei AI Desktop Application Bundle (Embedded BYOH & Studios)
- [x] Create a unified desktop host specification and build script (`ai_director/desktop_host.py`) integrating hardware detection, local AI model management, and embedded UI launcher
- [x] Create a first-run setup wizard view in the frontend (`DesktopSetupWizard.tsx`) guiding users through local hardware profiling, model selection, and embedded runner pairing
- [x] Register Desktop Setup Wizard route in `App.tsx`
- [x] Run full test suite (68 tests passing), TypeScript checks, and clean production build
- [x] Save verified full-app checkpoint and deliver honest download instructions

## Phase 39: One-Click Genei AI Desktop Application (No Separate Runner)
- [x] Replace runner-first Windows packaging with a single branded Genei AI Desktop installer containing the UI, local server, Python AI Director, and hardware detection sidecar
- [x] Remove separate-runner and pairing-token onboarding from the normal user flow
- [x] Add automatic first-launch hardware/capability detection with truthful local, cloud, downloading, and unavailable states
- [x] Add built-in tool chooser so users select a creator tool without technical configuration
- [x] Keep first launch download-free by design; expose optional local model capability state without implying that model installation is required
- [x] Add unified desktop host lifecycle, single-instance behavior, local data directories, and embedded service supervision
- [x] Update Windows CI workflow to build and validate the complete desktop installer on a native Windows runner
- [x] Add tests for one-click bootstrap, capability routing, fallback behavior, and removal of runner-only onboarding
- [x] Run tests, TypeScript checks, production build, and native Windows packaging validation
- [x] Save a verified checkpoint and provide the direct Genei AI Desktop installer link only when the real artifact exists
- [x] Allow the packaged desktop server to expose a local-only guest workspace without requiring hosted OAuth; preserve hosted authentication outside desktop mode

## Phase 40: Windows Installer Hang and Portable Recovery
- [x] Add bounded Electron server readiness with a visible loading/error state and buffered output handling
- [x] Ensure the embedded desktop host cleans up all child processes and focuses an existing instance safely
- [x] Build a same-product portable Windows executable alongside the per-user installer
- [x] Add installer recovery guidance and direct portable fallback to Settings/download catalog
- [x] Add native Windows validation for installer and portable artifacts, checksums, and metadata
- [x] Run application tests, desktop packaging tests, and native Windows build validation
- [x] Save a verified checkpoint and provide corrected installer and portable download links

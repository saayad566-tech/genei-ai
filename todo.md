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

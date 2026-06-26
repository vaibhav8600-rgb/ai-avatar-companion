# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser-based AI video-call companion ("Mira") built on **Next.js 14 (App Router) + React 18 + TypeScript + Tailwind**. The browser does the rich work (STT, audio playback, camera, persistence); thin server API routes proxy external providers so **API keys never reach the client**. There is no backend database — all user state lives in the browser.

See `docs/ARCHITECTURE.md` for rendered architecture / flow / sequence diagrams.

## Commands

```bash
npm run dev          # dev server (http://localhost:3000)
npm run build        # production build — ALSO runs ESLint + full type-check
npm start            # serve the production build (required to test the PWA/service worker)
npm run lint         # ESLint only
npx tsc --noEmit     # fast type-check without building
```

There is **no test framework** in this repo — do not assume Jest/Vitest/Playwright. Verify changes with `npx tsc --noEmit` and `npm run build` (the build is the source of truth; it fails on type or lint errors). Many behaviors (mic, mobile Web Speech, camera, Simli/PWA) require **real-device / browser testing** that cannot be done from CI — flag these explicitly rather than claiming they're verified.

## Architecture (the big picture)

### `app/page.tsx` is the orchestrator
Nearly all client logic lives here: conversation state, the `AvatarState` machine, mic/STT control, the voice pipeline, vision routing, settings, and persistence wiring. Components are mostly presentational. Because so much async/event-driven state converges here, it relies heavily on **refs for closure-safe reads** inside timers/callbacks (e.g. `avatarStateRef`, `startListeningRef`, `cameraActiveRef`, `spokeRef`). When adding logic in a `setTimeout`/event handler, read state through a ref, not the captured state variable.

### `AvatarState` drives the whole UI
A single union type (`types/index.ts`: `idle | listening | thinking | speaking | error | looking | learning | recognizing | recognized | uncertain`) drives the avatar aura, status pill, and control affordances. Transitions are deliberate — e.g. the live avatar only leaves `thinking` when Simli emits a real `speaking` event, with a 5s **watchdog** that recovers to the browser voice if that event never arrives.

### Provider abstraction with graceful fallback
Every external dependency degrades instead of failing:
- **Chat** (`app/api/chat/route.ts`): `AI_PROVIDER` selects Anthropic/OpenAI/Gemini; falls back to any other configured provider, then a **mock "demo mode"** reply when no key is set. Only the **last ~20 turns** are sent (cost/latency cap) and payloads are size-capped.
- **TTS**: a 3-tier chain — **Deepgram (`/api/tts/deepgram`, *streamed* 16 kHz PCM) → Gemini (`/api/tts`, buffered) → browser SpeechSynthesis**. The streaming path (`streamServerTts` in `lib/ttsAudio.ts` for still mode, `speakStream` in `lib/useSimliAvatar.ts` for live) plays audio as it arrives — first word in ~1s regardless of reply length. `fetchTtsAudio` is the buffered Gemini fallback (used by the chunked players). Toggle `USE_TTS_STREAMING` in `app/page.tsx`.
- **Avatar**: Simli live video → static image. **Vision**: Gemini → OpenAI.

`lib/voiceReply` (in `page.tsx`) is the **single voice pipeline** used by every spoken reply (chat + all vision flows + errors). Route new spoken output through it rather than calling TTS directly.

### Streaming TTS (primary) + chunked fallback
The fast path streams Deepgram's PCM and plays it as it arrives (`streamServerTts` / `speakStream`) — first audio is pinned to the connection floor (~1s) regardless of reply length. The buffered fallback (`fetchTtsAudio` → Gemini) uses `lib/textChunks.ts` to split long replies so playback starts after the first sentence, prefetching the next chunk while the current plays. **Gotcha:** both the chunk player and the streamer use a `playGeneration` token to cancel on barge-in, and `stopServerTts()` itself bumps that token — so call `stopServerTts()` **before** claiming a run's token, or the run cancels itself and nothing plays. `stopServerTts()` also cancels the active stream reader + scheduled sources; the Simli `clear()` cancels its own stream reader.

### Speech recognition (`lib/speechRecognition.ts`)
`continuous = true` + a trailing-silence timer finalizes a turn (so mid-sentence pauses don't cut the user off). A `finalized` flag guards against late `onresult` events (mobile engines emit one after `stop()`); `onEnd` reports `finalized` so `page.tsx` can **auto-restart** the mic on a mobile silence cutoff and drive **hands-free** mode. Always clear interim transcript when starting a new listening session.

### Vision ("Mira Vision")
`lib/visionIntentRouter.ts` regex-classifies each spoken turn into a vision intent vs `normal_chat`; only vision intents capture a frame. Recognition sends saved **thumbnails alongside the live frame** to `/api/vision/analyze` for **image-to-image** comparison; `matchMemory` prefers the model's returned `matchedLabel` over the text-overlap heuristic. People are **consent-gated and opt-in**; strangers are never identified. Visual memories live in **IndexedDB** (`lib/visualMemory.ts`), managed via `VisionMemoryPanel`.

### Persistence
Two stores, no server DB: **`lib/memoryManager.ts`** (localStorage — user memory, history, and all settings toggles) and **`lib/visualMemory.ts`** (IndexedDB — visual memory thumbnails). Add new settings as load/save helpers in `memoryManager.ts` and restore them in the mount effect in `page.tsx`.

### Security guard on every route (`lib/apiGuard.ts`)
Every API route calls `await guard(req, "<route>", { limit, windowMs })` first. It does a same-origin / `x-api-secret` check, then a per-IP sliding-window rate limit: **Upstash Redis when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set, otherwise an in-memory fallback** (also used if Redis throws). `guard()` is **async** — new routes must `await` it.

## Conventions & gotchas

- **Keys are server-only.** Client receives only synthesized audio and a short-lived Simli session token. Never import server env/keys into client code; add new provider calls as API routes.
- **Simli import path:** import `simli-client/dist/client`, not the package root — its `dist/index.js` has a casing bug (`require("./Client")`) that breaks the case-sensitive Linux build on Vercel. `simli-client` is pinned to `3.0.2`.
- **Service worker only registers in production** (`components/ServiceWorkerRegistrar.tsx`); in dev it unregisters SWs and clears caches (stale SWs caused hydration mismatches). Bump `CACHE_VERSION` in `public/service-worker.js` when the app shell changes.
- **Tailwind arbitrary values** with `calc()`/`env()` need underscores for spaces, e.g. `pb-[calc(1rem_+_env(safe-area-inset-bottom))]`.
- **Mobile audio/speech requires a user gesture** — call `primeSpeechSynthesis()` / `primeTtsAudio()` inside the tap/submit handler before any async reply.
- **Config is env-driven**; `.env.example` is the source of truth for every supported variable (providers, Simli, Deepgram, Gemini TTS/Live/Vision models, Upstash, `API_SHARED_SECRET`).
- All API routes use `export const runtime = "nodejs"`.

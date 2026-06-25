# AI Avatar Companion

A browser-based AI video-call companion. Open the app, see a warm human-like
avatar on screen, talk to her with your microphone, and she replies with a
natural voice — like a one-to-one video call with an assistant.

When a live-avatar provider is configured, she becomes a **real-time,
lip-synced video** that moves and speaks as she talks. Without one, she
gracefully falls back to a still image with the browser's built-in voice, so
the app always works.

Prefer to type? There's also a **WhatsApp-style text chat** over the same
conversation. And it's an **installable PWA** — add it to your home screen and
it opens full-screen, works offline, and is tuned to feel native on phones
(notch / home-indicator safe areas, keyboard-aware chat).

It runs in any modern browser — desktop or mobile — and is structured so a
Raspberry Pi / ESP32 client could drive it over HTTP later without
re-architecting the core.

Built by **Vaibhav Rajput**.

---

## Quick start

```bash
# 1. Install
npm install

# 2. Configure (optional — works in demo mode without keys)
cp .env.example .env.local
# Then edit .env.local and paste an API key (see "Configuration" below)

# 3. Run
npm run dev
```

Open <http://localhost:3000> in Chrome or Edge. Click the mic button, grant
microphone permission, and speak.

> **Browser support:** speech recognition uses the Web Speech API, which works
> in Chrome, Edge, and Safari. Firefox doesn't support it — use the text chat
> or the text input fallback there.

> **Testing the PWA:** the service worker (offline + install) only runs in a
> production build, not `npm run dev`. Use `npm run build && npm start` to try
> installing and offline behavior.

---

## Features

| Area | Feature | Status |
| --- | --- | --- |
| Conversation | Three AI providers — Anthropic Claude, OpenAI, Google Gemini | ✅ |
| Conversation | Secure server-side proxy (`/api/chat`) — keys never reach the browser | ✅ |
| Conversation | Per-session history + `localStorage` memory (name, preferences, notes) | ✅ |
| Input | Push-to-talk + click-to-toggle mic (Web Speech STT) | ✅ |
| Input | Text input fallback when mic is denied or unsupported | ✅ |
| Avatar | **Live, lip-synced video avatar** via Simli (real-time WebRTC) | ✅ |
| Avatar | Gemini text-to-speech drives the avatar's lips | ✅ |
| Avatar | Graceful fallback to still image + browser `SpeechSynthesis` | ✅ |
| Avatar | Toggle live video ↔ still image in Settings | ✅ |
| Avatar | State-driven aura (idle / listening / thinking / speaking / error) | ✅ |
| UX | Barge-in: start talking and she stops mid-sentence | ✅ |
| UX | Settings panel, collapsible transcript, error handling | ✅ |
| Chat | WhatsApp-style text chat (bubbles, timestamps, typing indicator) | ✅ |
| Chat | Shares the same history as the call; text-only (no voice) | ✅ |
| PWA | Installable, standalone, offline app-shell caching, app icons | ✅ |
| Mobile | Responsive with safe-area insets, `dvh` sizing, keyboard-aware chat | ✅ |
| Vision | **Mira Vision** — camera sight, describe scenes, teach/recognize objects | ✅ |
| Vision | Opt-in known-person enrollment (consent-gated); strangers never identified | ✅ |
| Vision | Local visual memory (IndexedDB), managed in Settings | ✅ |
| Vision | **Live Vision Conversation** — voice-first; auto-captures only when asked | ✅ |

---

## How it works

```
                         ┌──────────────────────────────────────────────┐
                         │            Next.js server routes              │
                         │             (API keys live here)             │
   ┌──────────────┐      │                                              │
   │   Browser    │ ───▶ │  POST /api/chat        → Anthropic / OpenAI  │
   │              │      │                          / Google (Gemini)   │
   │  Web Speech  │ ◀─── │                                              │
   │     (STT)    │      │  POST /api/tts          → Gemini TTS (audio) │
   │              │      │                                              │
   │  <video> +   │      │  POST /api/simli-session → Simli token       │
   │  <audio>     │      └──────────────────────────────────────────────┘
   └──────┬───────┘
          │  session token + 16kHz PCM audio
          ▼
   ┌──────────────┐
   │  Simli (WebRTC)  → streams a real-time lip-synced video back │
   └──────────────────────────────────────────────────────────────┘
```

A single conversation turn:

1. **You speak** → the browser transcribes it locally with the Web Speech API.
2. The transcript goes to **`/api/chat`**, which forwards it (plus your memory
   and a system prompt) to the configured AI provider and returns the reply.
3. The reply text goes to **`/api/tts`**, which uses Gemini to synthesize speech
   audio (raw PCM).
4. The browser resamples that audio to 16 kHz and streams it to **Simli**, which
   renders a photoreal face whose lips and expressions move with the voice.
5. If Simli or TTS isn't available, the reply is instead spoken by the browser's
   built-in `SpeechSynthesis` over the still image — same conversation, simpler
   visuals.

API keys never leave the server: the browser only ever receives a short-lived
Simli **session token**, never `SIMLI_API_KEY` or any AI provider key.

---

## Configuration

Copy `.env.example` to `.env.local` and fill in what you need. Everything is
optional — with no keys at all, the app runs in **demo mode** with friendly mock
replies so you can review the UI before signing up for anything.

### 1. AI provider (pick one)

Set `AI_PROVIDER` to `anthropic`, `openai`, or `google`, then provide the
matching key:

| Provider | Key | Model var (default) | Get a key |
| --- | --- | --- | --- |
| Anthropic Claude | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` (`claude-sonnet-4-6`) | <https://console.anthropic.com/> |
| OpenAI | `OPENAI_API_KEY` | `OPENAI_MODEL` (`gpt-4o-mini`) | <https://platform.openai.com/> |
| Google AI Studio | `GOOGLE_API_KEY` | `GOOGLE_MODEL` (`gemini-2.0-flash`) | <https://aistudio.google.com/app/apikey> |

If the chosen provider's key is missing, the app falls back to any other
configured provider, and finally to demo mode.

### 2. Live video avatar (optional)

To turn the avatar into a real-time lip-synced video, add a
[Simli](https://app.simli.com/) account's credentials:

| Var | Purpose |
| --- | --- |
| `SIMLI_API_KEY` | Your Simli API key (server-side only) |
| `SIMLI_FACE_ID` | The face to render (from the Simli dashboard) |
| `GEMINI_TTS_MODEL` | TTS model that voices the avatar (default `gemini-2.5-flash-preview-tts`) |
| `GEMINI_TTS_VOICE` | Voice name — e.g. `Kore`, `Aoede`, `Puck`, `Charon`, `Leda`, `Zephyr` |

The avatar's voice reuses your **`GOOGLE_API_KEY`** for TTS, so no extra key is
needed beyond Simli. When `SIMLI_API_KEY` / `SIMLI_FACE_ID` are absent, the live
avatar is silently disabled and the still-image experience is used instead.

### Voice in both modes

Both **Live** and **Still image** modes speak through the same 3-tier fallback
chain (live mode lip-syncs the audio on Simli; still mode plays it via Web
Audio):

1. **Deepgram Aura** (`/api/tts/deepgram`) — primary, when `DEEPGRAM_API_KEY` is
   set. Returns raw PCM.
2. **Gemini TTS** (`/api/tts`) — the Gemini model chain, if Deepgram fails / has
   no key. Also raw PCM.
3. **Browser Web Speech** (`speakWithBrowser`) — if both server tiers fail.

Deepgram's voice is set with `DEEPGRAM_TTS_MODEL` (default `aura-2-luna-en`);
the "Avatar voice model" / "Avatar voice" pickers in Settings apply to the
Gemini tier.

> **Cost note:** Gemini TTS bills per character and Simli bills per minute of
> streaming, so each spoken reply costs a little in **both** modes now. If you
> prefer the free browser voice, leave `GOOGLE_API_KEY` unset (or it'll be used
> for TTS). Text **chat** mode stays silent and free.

---

## Project structure

```
ai-avatar-companion/
├── app/
│   ├── api/
│   │   ├── chat/route.ts          # AI proxy: Anthropic / OpenAI / Google (server only)
│   │   ├── tts/route.ts           # Gemini text-to-speech → base64 PCM (server only)
│   │   ├── tts/deepgram/route.ts  # Deepgram Aura TTS → base64 PCM (primary, server only)
│   │   ├── simli-session/route.ts # Mints a Simli session token (server only)
│   │   └── vision/analyze/route.ts # Mira Vision: image → structured analysis (server only)
│   ├── globals.css                # Tailwind + design tokens
│   ├── layout.tsx
│   └── page.tsx                   # Main UI & conversation orchestrator
├── components/
│   ├── AvatarStage.tsx            # Live video / still image + state-driven aura
│   ├── ChatView.tsx               # WhatsApp-style full-screen text chat
│   ├── StatusIndicator.tsx        # Status pill: Ready / Listening / Speaking…
│   ├── MicButton.tsx              # Mic UI (push-to-talk or click-to-talk)
│   ├── ChatTranscript.tsx         # Collapsible right-side transcript
│   ├── SettingsPanel.tsx          # Name, volume, voice, avatar mode, mic mode, vision, reset
│   ├── CameraPanel.tsx            # Mira Vision camera UI (Look / Teach / Close)
│   ├── VisionMemoryPanel.tsx      # Manage learned objects/people (Settings)
│   ├── PermissionSetup.tsx        # First-run camera+mic permission onboarding
│   ├── ServiceWorkerRegistrar.tsx # Registers the PWA service worker (prod only)
│   └── ErrorBoundary.tsx
├── lib/
│   ├── apiClient.ts               # Frontend → /api/chat
│   ├── speechRecognition.ts       # Web Speech API wrapper (STT)
│   ├── speechSynthesis.ts         # SpeechSynthesis wrapper + voice picker (fallback TTS)
│   ├── audio.ts                   # Base64 PCM decode + resample to 16kHz for Simli
│   ├── useSimliAvatar.ts          # Live avatar lifecycle hook (connect/speak/clear/stop)
│   ├── useCamera.ts               # getUserMedia camera hook + frame capture
│   ├── visionClient.ts            # Vision analyze fetch + thumbnail + matching
│   ├── visionIntentRouter.ts      # Classifies a turn into a vision intent
│   ├── permissionManager.ts       # Centralized camera+mic permission flow
│   ├── visualMemory.ts            # IndexedDB visual-memory store (CRUD + export/import)
│   └── memoryManager.ts           # localStorage persistence
├── scripts/
│   └── generate-icons.mjs         # Zero-dependency PWA icon generator
├── types/index.ts                 # Shared TypeScript types
├── public/
│   ├── avatar.png                 # Fallback still image
│   ├── manifest.webmanifest       # PWA manifest
│   ├── service-worker.js          # Offline app-shell caching
│   └── icon-*.png                 # App icons (generated by the script above)
└── .env.example                   # Copy to .env.local and fill in keys
```

---

## Controls

| Action | How |
| --- | --- |
| Start / stop listening | Click the mic button (or hold it in push-to-talk mode) |
| Stop her mid-sentence | "Stop" button next to the mic while she's speaking (or just start talking — barge-in) |
| Open the text chat | Chat icon (top right) — back arrow returns to the call |
| Type instead of speaking | Text chat, or the quick text input below the mic |
| Show transcript | "Show" button next to the mic, or expand from the right edge |
| Switch live video ↔ still image | Gear icon → **Avatar** (only shown when Simli is configured) |
| Change name / voice / volume / mic mode | Gear icon top right |
| Reset everything | Settings → "Reset conversation & memory" |

### Two ways to talk

- **Call mode** (default) — voice-first: speak and hear her reply, with the live
  (or fallback) avatar reacting on screen.
- **Chat mode** — a quiet, WhatsApp-style text conversation over the *same*
  history. Text-only, so no audio plays. Opening chat also drops the live
  avatar stream so it isn't billing in the background.

---

## Tech stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript**
- **Tailwind CSS** for styling
- **simli-client** for the real-time WebRTC avatar
- Browser **Web Speech API** for speech-to-text and fallback text-to-speech
- AI providers via plain `fetch` (Anthropic Messages, OpenAI Chat Completions,
  Gemini `generateContent`) — no heavy SDKs in the request path

---

## Mira Vision

Mira can see through your camera, describe what she sees, learn objects, and
recognize them later. It's fully modular and opt-in — the camera never starts on
its own.

### Setup

No extra keys: vision reuses your existing **`GOOGLE_API_KEY`** (Gemini vision)
or **`OPENAI_API_KEY`** (OpenAI vision), chosen the same way as `AI_PROVIDER`.
Optionally override the model with `GEMINI_VISION_MODEL` / `OPENAI_VISION_MODEL`.
If no vision provider is configured, the analyze route returns a clear error.

### Using it

Tap the **camera icon** (top right) to open Mira Vision. On phones it opens the
**back camera by default** (you mostly point it at objects, desks, parcels,
rooms) and you can **switch between front and back** with the toggle on the
preview — front is handy for face/person chat. Your choice is remembered for
next time. The manual buttons are still there as a fallback:

- **Look** — capture a frame; Mira describes the scene and names any learned
  object she recognizes ("That looks like your guitar.").
- **Teach object** — capture → label + notes → saved to local visual memory.
- **Teach person** — *opt-in, consent-gated.* Confirm permission, capture 3
  angles, add a name/context.
- **Close camera** — stops the stream immediately.

### Live Vision Conversation Mode (voice-first)

Once the camera is on, you don't need the buttons — **just talk** and Mira
captures a frame automatically when your words call for it. Every reply comes
back through the normal voice/avatar pipeline (Simli or browser TTS), not just
the screen. The header shows a **Live Vision** badge and a status line
("Looking now", "Recognizing", "I need a label"…).

Each turn is classified ([lib/visionIntentRouter.ts](lib/visionIntentRouter.ts))
into one of: `normal_chat`, `describe_current_view`, `remember_current_object`,
`recognize_current_view`, `remember_current_person`, `recognize_known_person`,
`forget_visual_memory`. Only vision intents touch the camera; normal chat never
does.

Examples:

- "What do you see?" / "What's on my desk?" → captures + describes the scene.
- "Remember this as my black keyboard." → captures, saves the object, confirms
  by voice. (No label? She asks "What should I remember this as?")
- "Do you remember this?" → captures and compares to your saved objects.
- "Who is this?" → only recognizes enrolled people; otherwise "I see a person,
  but I don't recognize them."
- "This is my friend Amit, remember him." → asks for consent first, then saves
  on your confirmation.
- "Forget my keyboard." → deletes that memory.

Toggles in **Settings → Mira Vision**: *Live Vision conversation*,
*Auto-capture for vision questions*, *Known-person recognition* (off by
default), and *Ask before saving a person* (always on).

### How matching works (MVP)

The current version is intentionally simple: the vision model compares the live
frame against your saved memories' labels/descriptions, and Mira matches by
label/keyword weighted by the model's confidence. If unsure, she says so rather
than guessing. A future improvement is multimodal embeddings for more robust
matching.

### Privacy & safety

- The camera **never starts automatically** — only after you tap to open it, and
  a red "Camera on" indicator is shown while it's live.
- **No video is persisted.** Only still thumbnails *you* capture are saved, in
  your browser's IndexedDB (managed in **Settings → Mira Vision → Manage visual
  memories**: view, rename, delete, export/import JSON).
- **Strangers are never identified.** Person recognition is **off by default**
  and only matches people you explicitly enrolled with consent. If unsure, Mira
  says "I see a person" rather than guessing an identity.
- Frames are sent to your configured vision provider (Google/OpenAI) only when
  you capture; API keys stay server-side and raw provider errors are never
  exposed to the browser.

---

## Permissions on mobile / PWA

Mira uses one **centralized permission setup**: on first run a card asks to
enable camera + microphone *together* (one `getUserMedia({ audio, video })`),
then immediately stops the tracks so nothing stays active. The grant is shared
by every feature (voice + Mira Vision), so you're asked once rather than per
module. The app remembers it was initialized (localStorage) and won't show the
card again once granted.

> Mira **cannot** bypass the browser/OS prompt — final control always stays with
> your browser. The manager only unifies *when* you're asked.

If the browser keeps re-prompting on mobile:

- Use the **same URL/domain** each time, or install the **PWA** (same HTTPS
  origin) — different origins have separate permissions.
- **Avoid private/incognito** mode; it forgets permissions on close.
- **iPhone Safari:** Settings → (this website) → Camera & Microphone → **Allow**.
- **Android Chrome:** Site settings → Camera/Microphone → **Allow**.

You can re-run the setup anytime via **Settings → Mira Vision → Re-run
permission setup**. Camera and mic are never auto-started, and a visible
indicator shows whenever they're actually active.

---

## Installing as an app (PWA)

The app ships a web manifest, generated icons, and a service worker, so it can
be installed to a phone home screen or desktop and launched standalone.

- **Install:** open the production build in Chrome/Edge (desktop: install icon
  in the address bar; mobile: "Add to Home Screen") or Safari on iOS
  ("Share → Add to Home Screen").
- **Offline:** the service worker precaches the app shell and uses
  network-first for navigations / stale-while-revalidate for assets, so the UI
  still opens without a connection. API calls (chat, TTS, Simli) naturally
  require the network.
- **Icons:** square brand icons are generated procedurally (no design tools or
  image libraries needed) — regenerate them anytime with:

  ```bash
  node scripts/generate-icons.mjs
  ```

> The service worker is registered **only in production builds** to avoid
> fighting Next.js hot-reload in development.

---

## Mobile / responsive

Tuned to feel native on phones (verified against iPhone SE and iPhone 13 sizes):

- `dvh` units instead of `100vh`, so the layout isn't cut off by the iOS
  Safari toolbar.
- `env(safe-area-inset-*)` padding so content clears the notch and home
  indicator (`viewport-fit=cover`).
- The text chat sizes to the **visual viewport**, keeping the composer above
  the on-screen keyboard.
- Controls live in normal flow (no fixed-footer overlap on short screens).

---

## What could be improved next

In rough order of impact:

1. **Streaming responses.** Switch `/api/chat` to a streaming endpoint and start
   TTS on the first complete sentence — cuts perceived latency significantly.
2. **Premium / configurable TTS.** ElevenLabs or Cartesia return native
   `pcm_16000` (no resampling, lower latency) and more lifelike prosody. The
   `.env` already has ElevenLabs placeholders; `/api/tts` is the only route that
   would change.
3. **Server-side STT** for accuracy and Firefox support — Deepgram or
   AssemblyAI streaming, replacing the Web Speech API.
4. **Persisted preferences.** Volume, voice, mic mode, and avatar mode are
   currently per-session; persist them alongside memory in `localStorage`.
5. **Wake word** so the user doesn't have to click the mic (e.g. Picovoice
   Porcupine in the browser).
6. **Headless mode for ESP32 / Pi clients** — the backend routes are stateless
   and ready for embedded clients that handle their own audio I/O.

---

## Privacy & safety

- The microphone is only active during a recognition session; its state is
  always visible via the aura and the status indicator.
- Speech-to-text runs **locally in the browser** via the Web Speech API — raw
  audio is not recorded or persisted, and only the transcribed text reaches the
  server.
- In live-avatar mode, the assistant's reply text is sent to the TTS and Simli
  services to generate her voice and video.
- Conversations and memory are stored only in the browser's `localStorage`.
  There is no backend database.
- The assistant identifies as a virtual AI if asked directly, per the system
  prompt in `app/api/chat/route.ts`.
- API keys live only in `.env.local` (server-side env vars) and are never
  shipped to the browser; the client receives only a short-lived Simli session
  token.

---

## Author

Designed and built by **Vaibhav Rajput**.

---

## License & avatar credit

Replace `public/avatar.png` with any avatar image you have rights to use, and
configure a Simli face you're licensed to use. The included image is a
placeholder for development.

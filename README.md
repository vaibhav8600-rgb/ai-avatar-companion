# AI Avatar Companion — MVP

A browser-based AI video-call companion. Open the app, see a warm human-like
avatar on screen, talk to her with your microphone, and she replies with a
natural voice — like a one-to-one video call with an assistant.

This is the **Phase 1–3 MVP** built per the project brief. It runs entirely in a
laptop or desktop browser and is structured so a Raspberry Pi / ESP32 client
can drive it over HTTP later without re-architecting the core.

---

## Quick start

```bash
# 1. Install
npm install

# 2. Configure (optional — works in demo mode without keys)
cp .env.example .env.local
# Then edit .env.local and paste your ANTHROPIC_API_KEY (or OPENAI_API_KEY)

# 3. Run
npm run dev
```

Open <http://localhost:3000> in Chrome or Edge. Click the mic button, grant
microphone permission, and speak.

> **Browser support:** speech recognition uses the Web Speech API, which works
> in Chrome, Edge, and Safari. Firefox doesn't support it — use the text input
> fallback there.

---

## What was built

| Phase | Feature | Status |
| --- | --- | --- |
| 1 | Avatar UI with state-driven aura (idle / listening / thinking / speaking / error) | ✅ |
| 1 | Push-to-talk + click-to-toggle mic input | ✅ |
| 1 | Text input fallback when mic is denied or unsupported | ✅ |
| 2 | Secure backend proxy to AI API (`/api/chat`) | ✅ |
| 2 | Conversation history maintained per session | ✅ |
| 2 | localStorage-backed memory (name, preferences, notes) | ✅ |
| 3 | Voice output via `SpeechSynthesis` with voice picker | ✅ |
| 3 | Speaking-state synced to actual audio playback | ✅ |
| 3 | Subtle mouth-region pulse during speech (cheap lip-sync stand-in) | ✅ |
| 4 | Settings panel, error handling, reduced-motion support | ✅ |

---

## How it works

```
┌──────────────┐    POST /api/chat     ┌──────────────────────┐
│   Browser    │ ───────────────────▶  │  Next.js API route   │
│              │                        │  (server-only)       │
│  Web Speech  │ ◀───────────────────  │                      │
│  STT / TTS   │      reply JSON       │  Anthropic / OpenAI  │
└──────────────┘                        └──────────────────────┘
```

- **Frontend** does speech-to-text and text-to-speech using browser APIs. No
  audio leaves the device for STT/TTS in this MVP.
- **Backend** is a single Next.js API route that holds the AI provider key
  and forwards messages with a system prompt and any user memory. No key
  is ever sent to the browser.

---

## Project structure

```
ai-avatar-companion/
├── app/
│   ├── api/chat/route.ts      # Backend proxy to AI provider (server only)
│   ├── globals.css            # Tailwind + design tokens
│   ├── layout.tsx
│   └── page.tsx               # Main UI & conversation orchestrator
├── components/
│   ├── AvatarStage.tsx        # Avatar image + state-driven aura
│   ├── StatusIndicator.tsx    # Status pill: Ready / Listening / Speaking…
│   ├── MicButton.tsx          # Mic UI (push-to-talk or click-to-talk)
│   ├── ChatTranscript.tsx     # Collapsible right-side transcript
│   ├── SettingsPanel.tsx      # Name, volume, voice, reset
│   └── ErrorBoundary.tsx
├── lib/
│   ├── apiClient.ts           # Frontend → /api/chat
│   ├── speechRecognition.ts   # Web Speech API wrapper
│   ├── speechSynthesis.ts     # SpeechSynthesis wrapper + voice picker
│   └── memoryManager.ts       # localStorage persistence
├── types/index.ts             # Shared TypeScript types
├── public/avatar.png          # The avatar image
└── .env.example               # Copy to .env.local and fill in keys
```

---

## Required APIs

You only need **one** of these:

- **Anthropic Claude** (default): get a key at <https://console.anthropic.com/>
  - Set `ANTHROPIC_API_KEY` and optionally `ANTHROPIC_MODEL` (default: `claude-sonnet-4-6`)
- **OpenAI**: get a key at <https://platform.openai.com/>
  - Set `OPENAI_API_KEY` and optionally `OPENAI_MODEL` (default: `gpt-4o-mini`)
  - Set `AI_PROVIDER=openai`

If neither key is configured, the app runs in **demo mode** with friendly mock
replies, so you can review the UI before signing up for anything.

---

## What is mocked / placeholder

- **Lip-sync** is faked: a subtle warm glow pulses over the mouth region while
  audio plays, and the avatar image scales up by ~1.5%. Real lip-sync (e.g.
  D-ID, HeyGen, or running Wav2Lip) is a Phase 5 swap — `AvatarStage` is the
  only component that needs to change.
- **Avatar image** is a single still. To upgrade to a looping idle video,
  replace `public/avatar.png` with a `.webm` / `.mp4` and switch the
  `<Image>` for a `<video autoPlay loop muted playsInline>` inside
  `AvatarStage.tsx`.
- **Voice** uses the browser's built-in `SpeechSynthesis`. Quality varies by
  OS. For premium voice, add an ElevenLabs key in `.env.local` and create
  `app/api/tts/route.ts` that proxies their stream; pipe the returned audio
  into an `<audio>` element instead of calling `speak()`.
- **No login / no account**. Memory is per-browser via `localStorage`.

---

## Controls

| Action | How |
| --- | --- |
| Start / stop listening | Click the mic button (or hold it in push-to-talk mode) |
| Stop her mid-sentence | "Stop" button appears next to the mic while she's speaking |
| Type instead of speaking | Use the text input below the mic |
| Show transcript | "Show" button next to the mic, or expand from the right edge |
| Change name / voice / volume | Gear icon top right |
| Reset everything | Settings → "Reset conversation & memory" |

Switch between push-to-talk and click-to-talk in **Settings → Mic mode**.

---

## What should be improved next

In order of impact:

1. **Real lip-sync.** Integrate D-ID Talks API (server-side) or run a small
   open-source viseme generator from the AI audio. Keep the same
   `AvatarStage` props (`state`, `interimText`); add an `audioElement` prop
   to drive viseme timing.
2. **Streaming responses.** Switch `/api/chat` to a streaming endpoint and
   start TTS on the first complete sentence — cuts perceived latency in half.
3. **Premium TTS.** ElevenLabs or Cartesia for natural prosody; current
   `SpeechSynthesis` voices are functional but generic.
4. **Server-side STT** for accuracy and Firefox support — Deepgram or
   AssemblyAI streaming.
5. **Wake word** so the user doesn't have to click the mic. `Picovoice
   Porcupine` runs in the browser.
6. **Headless mode for ESP32 / Pi clients** — expose `/api/chat` for embedded
   clients that handle their own audio I/O. The backend is already
   stateless and ready for this.

---

## Privacy & safety

- Microphone is only active during a recognition session; the state is
  visible at all times via the aura and the status indicator.
- Audio is **not recorded or persisted** — STT runs locally in the browser
  via the Web Speech API. Only the transcribed text reaches the server.
- Conversations are stored in the browser's `localStorage` only. There is no
  backend database.
- The assistant identifies as a virtual AI if asked directly, per the system
  prompt in `app/api/chat/route.ts`. No real-person voice or face is cloned.
- API keys live only in `.env.local` (server-side env vars). They are never
  shipped to the browser.

---

## License & avatar credit

Replace `public/avatar.png` with any avatar image you have rights to use. The
included image is a placeholder for development.

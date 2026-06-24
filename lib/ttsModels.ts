// Shared catalog of selectable avatar-voice models.
//
// Imported by BOTH the Settings UI (to render the dropdown) and the /api/tts
// route (as an allowlist, so the browser can't ask the server to call an
// arbitrary model). Keep this framework-agnostic — no "use client" / no
// server-only imports.

export type TtsModelKind = "tts" | "live";

export interface TtsModelOption {
  /** Empty string = "Auto": let the server use its resilient fallback chain. */
  id: string;
  label: string;
  hint?: string;
  kind: TtsModelKind;
}

export const TTS_MODEL_OPTIONS: TtsModelOption[] = [
  { id: "", label: "Auto (recommended)", hint: "Picks the best available, with fallback", kind: "tts" },
  { id: "gemini-2.5-flash-preview-tts", label: "Gemini 2.5 Flash TTS", hint: "Fast, reliable", kind: "tts" },
  { id: "gemini-3.1-flash-tts-preview", label: "Gemini 3.1 Flash TTS", hint: "Newer preview", kind: "tts" },
  { id: "gemini-2.5-pro-preview-tts", label: "Gemini 2.5 Pro TTS", hint: "Higher quality", kind: "tts" },
  {
    id: "gemini-2.5-flash-preview-native-audio-dialog",
    label: "Gemini 2.5 Flash Native Audio (Live)",
    hint: "Most natural; realtime Live API",
    kind: "live",
  },
];

/** Valid, selectable model ids (excludes the empty "Auto" sentinel). */
export const TTS_MODEL_IDS: string[] = TTS_MODEL_OPTIONS.map((o) => o.id).filter(Boolean);

/** Whether a model id is one the client is allowed to request. */
export function isAllowedTtsModel(id: string | undefined | null): id is string {
  return typeof id === "string" && TTS_MODEL_IDS.includes(id);
}

// --- Gemini prebuilt voice personas (used by the live avatar) ---

export interface GeminiVoiceOption {
  /** Empty string = "Default": use the server's GEMINI_TTS_VOICE. */
  id: string;
  label: string;
}

// A curated set of Gemini's prebuilt voices with their character.
export const GEMINI_VOICE_OPTIONS: GeminiVoiceOption[] = [
  { id: "", label: "Default" },
  { id: "Kore", label: "Kore — Firm" },
  { id: "Aoede", label: "Aoede — Breezy" },
  { id: "Puck", label: "Puck — Upbeat" },
  { id: "Zephyr", label: "Zephyr — Bright" },
  { id: "Charon", label: "Charon — Informative" },
  { id: "Leda", label: "Leda — Youthful" },
  { id: "Fenrir", label: "Fenrir — Excitable" },
  { id: "Orus", label: "Orus — Firm" },
  { id: "Callirrhoe", label: "Callirrhoe — Easy-going" },
  { id: "Autonoe", label: "Autonoe — Bright" },
  { id: "Enceladus", label: "Enceladus — Breathy" },
  { id: "Sulafat", label: "Sulafat — Warm" },
];

/** Valid, selectable voice ids (excludes the empty "Default" sentinel). */
export const GEMINI_VOICE_IDS: string[] = GEMINI_VOICE_OPTIONS.map((o) => o.id).filter(Boolean);

/** Whether a voice id is one the client is allowed to request. */
export function isAllowedGeminiVoice(id: string | undefined | null): id is string {
  return typeof id === "string" && GEMINI_VOICE_IDS.includes(id);
}

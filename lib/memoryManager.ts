// Tiny localStorage-backed persistence for user-level memory.
// Kept deliberately small: just the things the assistant should remember
// across sessions. Sensitive data should never be stored here.

import type { UserMemory } from "@/types";

const MEMORY_KEY = "aac:memory:v1";
const HISTORY_KEY = "aac:history:v1";

export function loadMemory(): UserMemory {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    return raw ? (JSON.parse(raw) as UserMemory) : {};
  } catch {
    return {};
  }
}

export function saveMemory(memory: UserMemory): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // ignore quota / privacy-mode errors
  }
}

export function clearMemory(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(MEMORY_KEY);
}

// --- conversation history (in-session, but persisted for convenience) ---

import type { ChatMessage } from "@/types";

export function loadHistory(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as ChatMessage[]) : [];
  } catch {
    return [];
  }
}

export function saveHistory(history: ChatMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    // Cap history size to keep localStorage small.
    const capped = history.slice(-100);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(capped));
  } catch {
    // ignore
  }
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(HISTORY_KEY);
}

// --- avatar voice model preference ---

const TTS_MODEL_KEY = "aac:ttsModel:v1";

export function loadTtsModel(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(TTS_MODEL_KEY) || "";
  } catch {
    return "";
  }
}

export function saveTtsModel(model: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TTS_MODEL_KEY, model);
  } catch {
    // ignore
  }
}

const GEMINI_VOICE_KEY = "aac:geminiVoice:v1";

export function loadGeminiVoice(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(GEMINI_VOICE_KEY) || "";
  } catch {
    return "";
  }
}

export function saveGeminiVoice(voice: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GEMINI_VOICE_KEY, voice);
  } catch {
    // ignore
  }
}

// --- Mira Vision: known-person recognition (off by default) ---

const KNOWN_PERSON_KEY = "aac:knownPersonRecognition:v1";

export function loadKnownPersonRecognition(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(KNOWN_PERSON_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveKnownPersonRecognition(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KNOWN_PERSON_KEY, String(enabled));
  } catch {
    // ignore
  }
}

// Generic boolean setting helper (default-aware) for Live Vision toggles.
function loadBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "true";
  } catch {
    return fallback;
  }
}

function saveBool(key: string, value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // ignore
  }
}

const LIVE_VISION_KEY = "aac:liveVision:v1";
const AUTO_CAPTURE_KEY = "aac:autoCaptureVision:v1";

export const loadLiveVision = () => loadBool(LIVE_VISION_KEY, true);
export const saveLiveVision = (v: boolean) => saveBool(LIVE_VISION_KEY, v);
export const loadAutoCaptureVision = () => loadBool(AUTO_CAPTURE_KEY, true);
export const saveAutoCaptureVision = (v: boolean) => saveBool(AUTO_CAPTURE_KEY, v);

// Preferred camera (front "user" / back "environment"), remembered across sessions.
const PREF_CAMERA_KEY = "mira_preferred_camera";

/** Returns the saved camera preference, or null if the user hasn't chosen yet. */
export function loadPreferredCamera(): "user" | "environment" | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(PREF_CAMERA_KEY);
    return v === "environment" || v === "user" ? v : null;
  } catch {
    return null;
  }
}

export function savePreferredCamera(mode: "user" | "environment"): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PREF_CAMERA_KEY, mode);
  } catch {
    // ignore
  }
}

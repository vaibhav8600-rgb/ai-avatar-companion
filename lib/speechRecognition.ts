// Thin wrapper around the browser's Web Speech API for speech-to-text.
// Falls back gracefully if the API is unavailable.

// The Web Speech API types aren't in lib.dom by default in all TS versions.
// We declare a minimal interface so the code stays typed.
interface SpeechRecognitionEvent extends Event {
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string; confidence: number };
    };
  };
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

export interface RecognitionHandlers {
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export interface RecognizerOptions {
  lang?: string;
  /**
   * Auto-finalize after this much trailing silence (ms). Used for click-to-talk
   * so natural mid-sentence pauses don't cut you off. Set to 0 for push-to-talk,
   * where the user's button release is what ends the turn.
   */
  silenceMs?: number;
}

export function createRecognizer(
  handlers: RecognitionHandlers,
  options: RecognizerOptions = {},
): SpeechRecognitionLike | null {
  if (!isSpeechRecognitionSupported()) return null;

  const { lang = "en-US", silenceMs = 0 } = options;
  const Ctor = (window.SpeechRecognition || window.webkitSpeechRecognition)!;
  const recognition = new Ctor();
  // continuous = true so the engine keeps listening across natural pauses
  // instead of finalizing (and stopping) on the first one.
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = lang;

  let latest = ""; // full transcript so far (final + interim)
  let finalized = false;
  let silenceTimer: ReturnType<typeof setTimeout> | null = null;

  const clearSilence = () => {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  };

  // Send the accumulated transcript exactly once and stop listening.
  const submit = () => {
    if (finalized) return;
    const text = latest.trim();
    if (!text) return;
    finalized = true;
    clearSilence();
    handlers.onFinal(text);
    try {
      recognition.stop();
    } catch {
      // already stopped
    }
  };

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    // Rebuild the whole transcript each time (continuous results accumulate),
    // so onFinal gets the complete sentence, not just the last segment.
    let finalT = "";
    let interimT = "";
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0].transcript;
      if (result.isFinal) finalT += transcript;
      else interimT += transcript;
    }
    latest = `${finalT}${interimT}`.trim();
    if (latest && handlers.onPartial) handlers.onPartial(latest);

    // Restart the "they've stopped talking" timer on every word.
    if (silenceMs > 0) {
      clearSilence();
      silenceTimer = setTimeout(submit, silenceMs);
    }
  };

  recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
    clearSilence();
    // Common non-fatal errors we silence; surface the rest.
    if (e.error === "no-speech" || e.error === "aborted") {
      handlers.onEnd?.();
      return;
    }
    handlers.onError?.(e.message || e.error || "Microphone error");
  };

  recognition.onend = () => {
    clearSilence();
    // If the engine ended (manual stop / push-to-talk release / its own silence
    // cutoff) and we have unsent text, send it now.
    if (!finalized && latest.trim()) submit();
    handlers.onEnd?.();
  };

  return recognition;
}

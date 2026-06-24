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

export function createRecognizer(
  handlers: RecognitionHandlers,
  lang: string = "en-US",
): SpeechRecognitionLike | null {
  if (!isSpeechRecognitionSupported()) return null;

  const Ctor = (window.SpeechRecognition || window.webkitSpeechRecognition)!;
  const recognition = new Ctor();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = lang;

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    let interim = "";
    let final = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0].transcript;
      if (result.isFinal) {
        final += transcript;
      } else {
        interim += transcript;
      }
    }
    if (interim && handlers.onPartial) handlers.onPartial(interim.trim());
    if (final) handlers.onFinal(final.trim());
  };

  recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
    // Common non-fatal errors we silence; surface the rest.
    if (e.error === "no-speech" || e.error === "aborted") {
      handlers.onEnd?.();
      return;
    }
    handlers.onError?.(e.message || e.error || "Microphone error");
  };

  recognition.onend = () => handlers.onEnd?.();

  return recognition;
}

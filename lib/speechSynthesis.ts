// Wrapper around the browser's SpeechSynthesis API for text-to-speech.
// Picks the best available female-sounding voice and exposes lifecycle hooks
// that the avatar uses to switch between speaking/idle states.

export interface SpeakOptions {
  text: string;
  voiceName?: string;
  /** 0.1–10, default 1 */
  rate?: number;
  /** 0–1, default 1 */
  volume?: number;
  /** 0–2, default 1 */
  pitch?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (msg: string) => void;
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Returns voices, waiting briefly if the list hasn't populated yet.
 * Chrome loads voices asynchronously.
 */
export function getVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!isSpeechSynthesisSupported()) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  return new Promise((resolve) => {
    const existing = synth.getVoices();
    if (existing.length > 0) {
      resolve(existing);
      return;
    }
    const handler = () => {
      synth.removeEventListener("voiceschanged", handler);
      resolve(synth.getVoices());
    };
    synth.addEventListener("voiceschanged", handler);
    // Safety timeout
    setTimeout(() => resolve(synth.getVoices()), 800);
  });
}

/** Heuristic to pick a pleasant female-sounding English voice. */
export function pickDefaultVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | undefined {
  if (voices.length === 0) return undefined;

  // Preferred named voices in priority order.
  const preferred = [
    "Google UK English Female",
    "Microsoft Aria Online",
    "Microsoft Jenny Online",
    "Samantha",
    "Karen",
    "Victoria",
    "Tessa",
  ];
  for (const name of preferred) {
    const v = voices.find((vv) => vv.name.includes(name));
    if (v) return v;
  }

  // Fall back to any English voice whose name contains "female".
  const female = voices.find(
    (v) => v.lang.startsWith("en") && /female/i.test(v.name),
  );
  if (female) return female;

  // Otherwise first English voice.
  return voices.find((v) => v.lang.startsWith("en")) || voices[0];
}

export function speak(options: SpeakOptions): void {
  if (!isSpeechSynthesisSupported()) {
    options.onError?.("Speech synthesis not supported in this browser.");
    return;
  }
  const synth = window.speechSynthesis;
  // Cancel anything currently playing so we don't queue up.
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(options.text);
  utterance.rate = options.rate ?? 1;
  utterance.volume = options.volume ?? 1;
  utterance.pitch = options.pitch ?? 1;

  utterance.onstart = () => options.onStart?.();
  utterance.onend = () => options.onEnd?.();
  utterance.onerror = (e) => options.onError?.(e.error || "Speech error");

  if (options.voiceName) {
    const voices = synth.getVoices();
    const match = voices.find((v) => v.name === options.voiceName);
    if (match) utterance.voice = match;
  }

  synth.speak(utterance);
}

export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported()) {
    window.speechSynthesis.cancel();
  }
}

import { isSpeechRecognitionSupported, createRecognizer } from "@/lib/speechRecognition";

interface Handlerful {
  onresult: ((e: unknown) => void) | null;
  onerror: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  start: jest.Mock;
  stop: jest.Mock;
  abort: jest.Mock;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
}

let lastInstance: Handlerful | null = null;

class MockRecognition {
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  start = jest.fn();
  stop = jest.fn();
  abort = jest.fn();
  continuous = false;
  interimResults = false;
  lang = "";
  addEventListener = jest.fn();
  removeEventListener = jest.fn();
  constructor() {
    lastInstance = this as unknown as Handlerful;
  }
}

// Build a Web Speech result event.
function resultEvent(segments: { transcript: string; isFinal: boolean }[]) {
  const results: Record<number, unknown> & { length: number } = { length: segments.length };
  segments.forEach((s, i) => {
    results[i] = { isFinal: s.isFinal, 0: { transcript: s.transcript, confidence: 1 } };
  });
  return { results, resultIndex: 0 };
}

function installRecognition(present = true) {
  Object.defineProperty(window, "SpeechRecognition", {
    value: present ? MockRecognition : undefined,
    configurable: true,
  });
  Object.defineProperty(window, "webkitSpeechRecognition", {
    value: undefined,
    configurable: true,
  });
}

beforeEach(() => {
  lastInstance = null;
  installRecognition(true);
});

describe("isSpeechRecognitionSupported", () => {
  it("is false when neither constructor exists", () => {
    installRecognition(false);
    expect(isSpeechRecognitionSupported()).toBe(false);
  });
  it("is true when SpeechRecognition exists", () => {
    expect(isSpeechRecognitionSupported()).toBe(true);
  });
});

describe("createRecognizer", () => {
  it("returns null when unsupported", () => {
    installRecognition(false);
    expect(createRecognizer({ onFinal: jest.fn() })).toBeNull();
  });

  it("configures continuous interim recognition", () => {
    createRecognizer({ onFinal: jest.fn() }, { lang: "en-GB" });
    expect(lastInstance?.continuous).toBe(true);
    expect(lastInstance?.interimResults).toBe(true);
    expect(lastInstance?.lang).toBe("en-GB");
  });

  it("emits partials as the transcript accumulates", () => {
    const onPartial = jest.fn();
    createRecognizer({ onFinal: jest.fn(), onPartial });
    lastInstance!.onresult!(resultEvent([{ transcript: "hello", isFinal: false }]));
    expect(onPartial).toHaveBeenLastCalledWith("hello");
    lastInstance!.onresult!(
      resultEvent([
        { transcript: "hello ", isFinal: true },
        { transcript: "world", isFinal: false },
      ]),
    );
    expect(onPartial).toHaveBeenLastCalledWith("hello world");
  });

  it("finalizes after trailing silence (click-to-talk)", () => {
    jest.useFakeTimers();
    const onFinal = jest.fn();
    createRecognizer({ onFinal }, { silenceMs: 900 });
    lastInstance!.onresult!(resultEvent([{ transcript: "what time is it", isFinal: false }]));
    expect(onFinal).not.toHaveBeenCalled();
    jest.advanceTimersByTime(900);
    expect(onFinal).toHaveBeenCalledWith("what time is it");
    expect(lastInstance!.stop).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it("ignores late result events after finalizing", () => {
    jest.useFakeTimers();
    const onFinal = jest.fn();
    const onPartial = jest.fn();
    createRecognizer({ onFinal, onPartial }, { silenceMs: 500 });
    lastInstance!.onresult!(resultEvent([{ transcript: "done", isFinal: false }]));
    jest.advanceTimersByTime(500);
    onPartial.mockClear();
    lastInstance!.onresult!(resultEvent([{ transcript: "late text", isFinal: true }]));
    expect(onPartial).not.toHaveBeenCalled();
    expect(onFinal).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it("submits any pending text when the engine ends (push-to-talk)", () => {
    const onFinal = jest.fn();
    const onEnd = jest.fn();
    createRecognizer({ onFinal, onEnd }, { silenceMs: 0 });
    lastInstance!.onresult!(resultEvent([{ transcript: "send me", isFinal: true }]));
    lastInstance!.onend!();
    expect(onFinal).toHaveBeenCalledWith("send me");
    expect(onEnd).toHaveBeenCalledWith({ finalized: true });
  });

  it("treats no-speech / aborted as a non-fatal end, not an error", () => {
    const onError = jest.fn();
    const onEnd = jest.fn();
    createRecognizer({ onFinal: jest.fn(), onError, onEnd });
    lastInstance!.onerror!({ error: "no-speech" });
    expect(onError).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledWith({ finalized: false });
  });

  it("surfaces real errors", () => {
    const onError = jest.fn();
    createRecognizer({ onFinal: jest.fn(), onError });
    lastInstance!.onerror!({ error: "audio-capture", message: "mic broken" });
    expect(onError).toHaveBeenCalledWith("mic broken");
  });
});

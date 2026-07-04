import {
  isSpeechSynthesisSupported,
  pickDefaultVoice,
  speak,
  stopSpeaking,
  getVoices,
} from "@/lib/speechSynthesis";

type V = { name: string; lang: string };
const voice = (name: string, lang = "en-US"): V => ({ name, lang });

function installSynth(voices: V[] = []) {
  const synth = {
    speak: jest.fn(),
    cancel: jest.fn(),
    resume: jest.fn(),
    getVoices: jest.fn(() => voices),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
  class Utterance {
    text: string;
    rate = 1;
    volume = 1;
    pitch = 1;
    voice: unknown = null;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    constructor(t: string) {
      this.text = t;
    }
  }
  (globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance =
    Utterance;
  return synth;
}

describe("pickDefaultVoice (pure)", () => {
  it("returns undefined for an empty list", () => {
    expect(pickDefaultVoice([] as unknown as SpeechSynthesisVoice[])).toBeUndefined();
  });

  it("prefers a named premium voice", () => {
    const voices = [voice("Some Robot"), voice("Samantha"), voice("Google UK English Female")];
    const v = pickDefaultVoice(voices as unknown as SpeechSynthesisVoice[]);
    expect(v?.name).toBe("Google UK English Female"); // highest priority in the list
  });

  it("falls back to an English 'female' voice, then any English voice", () => {
    expect(pickDefaultVoice([voice("Zoe Female")] as unknown as SpeechSynthesisVoice[])?.name).toBe(
      "Zoe Female",
    );
    expect(
      pickDefaultVoice([
        voice("Daniel", "en-GB"),
        voice("Amélie", "fr-FR"),
      ] as unknown as SpeechSynthesisVoice[])?.name,
    ).toBe("Daniel");
  });
});

describe("speechSynthesis wrappers", () => {
  it("reports support based on window.speechSynthesis", () => {
    installSynth();
    expect(isSpeechSynthesisSupported()).toBe(true);
  });

  it("speak cancels prior speech, sets options, and speaks", () => {
    const synth = installSynth([voice("Samantha")]);
    const onEnd = jest.fn();
    speak({ text: "hello", volume: 0.5, voiceName: "Samantha", onEnd });
    expect(synth.cancel).toHaveBeenCalled();
    expect(synth.speak).toHaveBeenCalledTimes(1);
    const utt = synth.speak.mock.calls[0][0];
    expect(utt.text).toBe("hello");
    expect(utt.volume).toBe(0.5);
    utt.onend?.();
    expect(onEnd).toHaveBeenCalled();
  });

  it("speak reports an error when unsupported", () => {
    installSynth(); // ensure the property exists + is configurable, then remove it
    delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
    expect(isSpeechSynthesisSupported()).toBe(false);
    const onError = jest.fn();
    speak({ text: "x", onError });
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/not supported/i));
  });

  it("stopSpeaking cancels when supported", () => {
    const synth = installSynth();
    stopSpeaking();
    expect(synth.cancel).toHaveBeenCalled();
  });

  it("getVoices resolves immediately when voices are present", async () => {
    installSynth([voice("Samantha")]);
    await expect(getVoices()).resolves.toHaveLength(1);
  });
});

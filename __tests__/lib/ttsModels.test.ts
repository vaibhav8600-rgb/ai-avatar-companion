import {
  TTS_MODEL_OPTIONS,
  TTS_MODEL_IDS,
  isAllowedTtsModel,
  GEMINI_VOICE_OPTIONS,
  GEMINI_VOICE_IDS,
  isAllowedGeminiVoice,
} from "@/lib/ttsModels";

describe("ttsModels", () => {
  it("exposes an Auto option with an empty id", () => {
    expect(TTS_MODEL_OPTIONS[0].id).toBe("");
    expect(GEMINI_VOICE_OPTIONS[0].id).toBe("");
  });

  it("id lists exclude the empty sentinel", () => {
    expect(TTS_MODEL_IDS).not.toContain("");
    expect(GEMINI_VOICE_IDS).not.toContain("");
    expect(TTS_MODEL_IDS.length).toBe(TTS_MODEL_OPTIONS.length - 1);
  });

  it("isAllowedTtsModel validates against the allowlist", () => {
    expect(isAllowedTtsModel("gemini-2.5-flash-preview-tts")).toBe(true);
    expect(isAllowedTtsModel("")).toBe(false);
    expect(isAllowedTtsModel(undefined)).toBe(false);
    expect(isAllowedTtsModel("evil-model")).toBe(false);
  });

  it("isAllowedGeminiVoice validates against the allowlist", () => {
    expect(isAllowedGeminiVoice("Kore")).toBe(true);
    expect(isAllowedGeminiVoice("")).toBe(false);
    expect(isAllowedGeminiVoice(null)).toBe(false);
    expect(isAllowedGeminiVoice("Nope")).toBe(false);
  });
});

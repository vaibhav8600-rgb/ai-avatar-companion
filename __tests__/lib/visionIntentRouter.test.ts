import { detectVisionIntent } from "@/lib/visionIntentRouter";

describe("detectVisionIntent", () => {
  it("treats ordinary conversation as normal_chat with no camera", () => {
    const r = detectVisionIntent("How are you doing today?");
    expect(r.intent).toBe("normal_chat");
    expect(r.needsCamera).toBe(false);
  });

  it("empty input is normal_chat", () => {
    expect(detectVisionIntent("").intent).toBe("normal_chat");
  });

  it.each([
    "What do you see?",
    "Can you see this?",
    "What's in my hand?",
    "Describe what you see",
    "look at this",
  ])("classifies %j as describe_current_view (needs camera)", (phrase) => {
    const r = detectVisionIntent(phrase);
    expect(r.intent).toBe("describe_current_view");
    expect(r.needsCamera).toBe(true);
  });

  it("remembers an object with a label, keeping the possessive", () => {
    const r = detectVisionIntent("remember this as my black keyboard");
    expect(r.intent).toBe("remember_current_object");
    expect(r.targetType).toBe("object");
    expect(r.needsCamera).toBe(true);
    expect(r.label).toBe("my black keyboard");
  });

  it("handles the statement form 'this is my X' as remembering an object", () => {
    const r = detectVisionIntent("this is my guitar");
    expect(r.intent).toBe("remember_current_object");
    expect(r.label).toBe("my guitar");
  });

  it("remembering a person is consent-gated and extracts the name", () => {
    const r = detectVisionIntent("remember this person as John");
    expect(r.intent).toBe("remember_current_person");
    expect(r.targetType).toBe("person");
    expect(r.needsConfirmation).toBe(true);
    expect(r.needsCamera).toBe(true);
    expect(r.label).toBe("John");
  });

  it("recognizes a known person from 'who is this?'", () => {
    const r = detectVisionIntent("Who is this?");
    expect(r.intent).toBe("recognize_known_person");
    expect(r.targetType).toBe("person");
    expect(r.needsCamera).toBe(true);
  });

  it("recognizes the current object view from 'what is this?'", () => {
    const r = detectVisionIntent("What is this?");
    expect(r.intent).toBe("recognize_current_view");
    expect(r.targetType).toBe("object");
  });

  it("forgets a memory without needing the camera", () => {
    const r = detectVisionIntent("forget my keyboard");
    expect(r.intent).toBe("forget_visual_memory");
    expect(r.needsCamera).toBe(false);
    expect(r.label).toBe("keyboard");
  });
});

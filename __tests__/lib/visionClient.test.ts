import { buildRecognitionPrompt, buildCandidates, matchMemory } from "@/lib/visionClient";
import type { VisualMemory, VisionResult } from "@/types";

function mem(over: Partial<VisualMemory> = {}): VisualMemory {
  return {
    id: over.id ?? crypto.randomUUID?.() ?? Math.random().toString(36),
    type: "object",
    label: "thing",
    description: "a thing",
    thumbnailBase64: "data:image/jpeg;base64,AAA",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: [],
    consented: false,
    confidenceThreshold: 0.6,
    ...over,
  };
}

function result(over: Partial<VisionResult> = {}): VisionResult {
  return {
    description: "",
    objects: [],
    peopleCount: 0,
    textVisible: "",
    safetyNotes: "",
    confidence: 0.5,
    ...over,
  };
}

describe("buildRecognitionPrompt", () => {
  it("handles no saved objects", () => {
    const p = buildRecognitionPrompt([], "object");
    expect(p).toMatch(/no saved objects/i);
  });

  it("never guesses identity when no people are enrolled", () => {
    const p = buildRecognitionPrompt([], "person");
    expect(p).toMatch(/do not guess identity/i);
  });

  it("lists saved objects the user has taught", () => {
    const p = buildRecognitionPrompt([mem({ label: "guitar", description: "acoustic" })], "object");
    expect(p).toContain("guitar");
    expect(p).toContain("acoustic");
    expect(p).toMatch(/taught me before/i);
  });
});

describe("buildCandidates", () => {
  it("keeps only the requested type with a thumbnail, mapped to label+image", () => {
    const memories = [
      mem({ label: "keyboard", type: "object" }),
      mem({ label: "mug", type: "object", thumbnailBase64: "" }), // no thumb → dropped
      mem({ label: "Rohan", type: "person" }),
    ];
    const candidates = buildCandidates(memories, "object");
    expect(candidates).toEqual([{ label: "keyboard", imageBase64: "data:image/jpeg;base64,AAA" }]);
  });

  it("caps the number of candidates", () => {
    const memories = Array.from({ length: 10 }, (_, i) => mem({ label: `o${i}` }));
    expect(buildCandidates(memories, "object", 3)).toHaveLength(3);
  });
});

describe("matchMemory", () => {
  const memories = [
    mem({ label: "guitar", type: "object" }),
    mem({ label: "mechanical keyboard", type: "object" }),
    mem({ label: "Rohan", type: "person" }),
  ];

  it("prefers the model's direct image match (matchedLabel) and floors confidence", () => {
    const match = matchMemory(
      result({ matchedLabel: "guitar", confidence: 0.4 }),
      memories,
      "object",
    );
    expect(match?.memory.label).toBe("guitar");
    expect(match?.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it("falls back to text overlap on the description/objects", () => {
    const match = matchMemory(
      result({ description: "I see a mechanical keyboard on the desk", confidence: 0.8 }),
      memories,
      "object",
    );
    expect(match?.memory.label).toBe("mechanical keyboard");
  });

  it("matches on a significant word of the label", () => {
    const match = matchMemory(
      result({ objects: ["keyboard"], confidence: 0.9 }),
      memories,
      "object",
    );
    expect(match?.memory.label).toBe("mechanical keyboard");
  });

  it("returns null when nothing matches", () => {
    expect(matchMemory(result({ description: "a banana" }), memories, "object")).toBeNull();
  });

  it("respects the requested type (won't match an object against people)", () => {
    const match = matchMemory(result({ matchedLabel: "guitar" }), memories, "person");
    expect(match).toBeNull();
  });
});

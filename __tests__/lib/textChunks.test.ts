import { splitIntoSpeechChunks } from "@/lib/textChunks";

describe("splitIntoSpeechChunks", () => {
  it("returns an empty array for empty or whitespace-only input", () => {
    expect(splitIntoSpeechChunks("")).toEqual([]);
    expect(splitIntoSpeechChunks("   \n\t  ")).toEqual([]);
  });

  it("returns a single chunk for one short sentence", () => {
    expect(splitIntoSpeechChunks("Hello there.")).toEqual(["Hello there."]);
  });

  it("collapses runs of whitespace and trims each chunk", () => {
    const chunks = splitIntoSpeechChunks("Hi   there.\n\nHow    are you?");
    for (const c of chunks) {
      expect(c).toBe(c.trim());
      expect(c).not.toMatch(/\s{2,}/); // no double spaces
      expect(c.length).toBeGreaterThan(0);
    }
  });

  it("preserves the full text across chunks (join reconstructs the cleaned input)", () => {
    const input =
      "First sentence here. Second one follows. Third and final sentence wraps up the thought nicely.";
    const chunks = splitIntoSpeechChunks(input);
    expect(chunks.join(" ")).toBe(input);
  });

  it("emits a small first chunk so audio can start fast, then more", () => {
    const input =
      "Hi there friend, this is a longer opening line. Then a good amount more content follows here so the second chunk fills up nicely with words.";
    const chunks = splitIntoSpeechChunks(input);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // The first sentence flushes early (>= firstMinLen 25, well under later minLen 160).
    expect(chunks[0].length).toBeGreaterThanOrEqual(25);
    expect(chunks[0].length).toBeLessThan(160);
  });

  it("splits an over-long single sentence on a word boundary under maxLen", () => {
    const longWordy = "word ".repeat(120).trim() + "."; // ~600 chars, no sentence breaks
    const chunks = splitIntoSpeechChunks(longWordy);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(220);
  });

  it("respects custom length options", () => {
    const chunks = splitIntoSpeechChunks("one two three four five six seven eight", {
      firstMinLen: 5,
      minLen: 10,
      maxLen: 20,
    });
    expect(chunks.length).toBeGreaterThan(1);
  });
});

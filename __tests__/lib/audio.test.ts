import { base64ToUint8, decodeToSimliPcm } from "@/lib/audio";

// Helper: build a base64 PCM16 clip from sample values.
function pcm16Base64(samples: number[]): string {
  const buf = new Uint8Array(samples.length * 2);
  const view = new DataView(buf.buffer);
  samples.forEach((s, i) => view.setInt16(i * 2, s, true));
  let bin = "";
  buf.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

describe("base64ToUint8", () => {
  it("decodes base64 into the original bytes", () => {
    const b64 = btoa("ABC");
    expect(Array.from(base64ToUint8(b64))).toEqual([65, 66, 67]);
  });

  it("handles empty input", () => {
    expect(base64ToUint8("")).toHaveLength(0);
  });
});

describe("decodeToSimliPcm (same-rate fast path, no Web Audio needed)", () => {
  it("round-trips PCM16 bytes (±1) when source and target rates match", async () => {
    const samples = [0, 1000, -1000, 32767, -32768];
    const out = await decodeToSimliPcm(pcm16Base64(samples), 16000, 16000);
    expect(out).toHaveLength(samples.length * 2);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    const decoded = samples.map((_, i) => view.getInt16(i * 2, true));
    // int16 → float (÷32768) → int16 (×32767 for +) is within 1 LSB; the
    // negative full-scale is preserved exactly.
    expect(decoded[0]).toBe(0);
    expect(Math.abs(decoded[1] - 1000)).toBeLessThanOrEqual(1);
    expect(Math.abs(decoded[3] - 32767)).toBeLessThanOrEqual(1);
    expect(decoded[4]).toBe(-32768);
  });

  it("returns an empty buffer for empty audio", async () => {
    const out = await decodeToSimliPcm("", 24000, 16000);
    expect(out).toHaveLength(0);
  });
});

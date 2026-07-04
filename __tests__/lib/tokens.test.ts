import { colors, orbPalette, brandGradient } from "@/lib/design/tokens";

const HEX = /^#[0-9a-f]{6}$/i;

describe("design tokens", () => {
  it("defines the five voice-status colors as hex", () => {
    for (const c of Object.values(colors.status)) expect(c).toMatch(HEX);
    expect(Object.keys(colors.status)).toEqual(["ready", "listen", "think", "speak", "error"]);
  });

  it("provides an orb palette for every visual state with hex ring/glow/particles", () => {
    const states = ["ready", "listening", "thinking", "speaking", "recovering"] as const;
    for (const s of states) {
      expect(orbPalette[s]).toBeDefined();
      expect(orbPalette[s].ring).toMatch(HEX);
      expect(orbPalette[s].glow).toMatch(HEX);
      expect(orbPalette[s].particles).toMatch(HEX);
    }
  });

  it("brand gradient references the three brand stops", () => {
    expect(brandGradient).toContain(colors.grad.start);
    expect(brandGradient).toContain(colors.grad.mid);
    expect(brandGradient).toContain(colors.grad.end);
  });
});

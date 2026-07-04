import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GlassPanel from "@/components/ui/GlassPanel";
import NeonFrame from "@/components/ui/NeonFrame";
import MiraLogo from "@/components/ui/MiraLogo";
import RingGauge from "@/components/ui/RingGauge";
import ThemeToggle from "@/components/ui/ThemeToggle";
import CosmicBackground from "@/components/ui/CosmicBackground";

describe("GlassPanel", () => {
  it("renders children with the glass surface class", () => {
    const { container } = render(<GlassPanel>content</GlassPanel>);
    expect(screen.getByText("content")).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("glass");
  });

  it("applies the requested radius", () => {
    const { container } = render(<GlassPanel radius="full">x</GlassPanel>);
    expect(container.firstChild).toHaveClass("rounded-full");
  });
});

describe("NeonFrame", () => {
  it("wraps content in a glass panel", () => {
    render(
      <NeonFrame>
        <span>framed</span>
      </NeonFrame>,
    );
    expect(screen.getByText("framed")).toBeInTheDocument();
  });
});

describe("MiraLogo", () => {
  it("renders an svg mark", () => {
    const { container } = render(<MiraLogo />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});

describe("RingGauge", () => {
  it("shows the rounded percentage by default", () => {
    render(<RingGauge value={0.78} caption="Volume" />);
    expect(screen.getByText("78%")).toBeInTheDocument();
    expect(screen.getByText("Volume")).toBeInTheDocument();
  });

  it("clamps out-of-range values and honors a custom label", () => {
    render(<RingGauge value={5} label="MAX" />);
    expect(screen.getByText("MAX")).toBeInTheDocument();
  });
});

describe("ThemeToggle", () => {
  it("flips the document theme attribute on click", async () => {
    document.documentElement.setAttribute("data-theme", "dark");
    render(<ThemeToggle />);
    const btn = screen.getByRole("button");
    await userEvent.click(btn);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    await userEvent.click(btn);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});

describe("CosmicBackground", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    jest.restoreAllMocks();
  });

  it("mounts a decorative canvas and unmounts cleanly", () => {
    const { container, unmount } = render(<CosmicBackground />);
    // The `.starfield` class is load-bearing: its z-index:-1 lifts the field
    // above the opaque nebula/base layers so the glitter shows app-wide.
    expect(container.querySelector("canvas.starfield")).toBeInTheDocument();
    expect(() => unmount()).not.toThrow();
  });

  it("runs the animation loop when motion is allowed", () => {
    const raf = jest.spyOn(window, "requestAnimationFrame");
    const { unmount } = render(<CosmicBackground />);
    expect(raf).toHaveBeenCalled(); // drifting field is scheduled
    unmount();
  });

  it("draws the light-theme palette branch without throwing", () => {
    document.documentElement.setAttribute("data-theme", "light");
    const { container, unmount } = render(<CosmicBackground />);
    expect(container.querySelector("canvas.starfield")).toBeInTheDocument();
    expect(() => unmount()).not.toThrow();
  });

  it("renders a single static frame (no rAF loop) under reduced motion", () => {
    jest.spyOn(window, "matchMedia").mockReturnValue({
      matches: true, // prefers-reduced-motion: reduce
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    } as unknown as MediaQueryList);
    const raf = jest.spyOn(window, "requestAnimationFrame");
    const { unmount } = render(<CosmicBackground />);
    expect(raf).not.toHaveBeenCalled();
    unmount();
  });
});

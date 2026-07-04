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
  it("mounts a decorative canvas and unmounts cleanly", () => {
    const { container, unmount } = render(<CosmicBackground />);
    expect(container.querySelector("canvas.starfield")).toBeInTheDocument();
    expect(() => unmount()).not.toThrow();
  });
});

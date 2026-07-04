// Avoid loading the real R3F/WebGL canvas (needs WebGL, absent in jsdom).
jest.mock("@/components/avatar/OrbCanvas", () => ({
  __esModule: true,
  default: () => null,
}));

import { render, screen } from "@testing-library/react";
import AvatarStage from "@/components/AvatarStage";
import AvatarOrb, { avatarToOrb } from "@/components/AvatarOrb";

describe("avatarToOrb mapping", () => {
  it("maps avatar states onto the five visual orb states", () => {
    expect(avatarToOrb("idle")).toBe("ready");
    expect(avatarToOrb("listening")).toBe("listening");
    expect(avatarToOrb("thinking")).toBe("thinking");
    expect(avatarToOrb("looking")).toBe("thinking");
    expect(avatarToOrb("recognizing")).toBe("thinking");
    expect(avatarToOrb("speaking")).toBe("speaking");
    expect(avatarToOrb("error")).toBe("recovering");
    expect(avatarToOrb("recognized")).toBe("ready");
  });
});

describe("AvatarOrb", () => {
  it("renders its portrait children", () => {
    render(
      <AvatarOrb state="listening">
        <div data-testid="portrait">face</div>
      </AvatarOrb>,
    );
    expect(screen.getByTestId("portrait")).toBeInTheDocument();
  });
});

describe("AvatarStage", () => {
  it("shows the still portrait image", () => {
    render(<AvatarStage state="idle" />);
    expect(screen.getByAltText("Mira avatar")).toBeInTheDocument();
  });
});

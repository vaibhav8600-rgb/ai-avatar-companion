import { render, screen, act } from "@testing-library/react";
import InstallAppPrompt from "@/components/InstallAppPrompt";

function setUA(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
}

describe("InstallAppPrompt", () => {
  it("renders nothing when the app isn't installable", () => {
    setUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120");
    const { container } = render(<InstallAppPrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers the install chip on iOS Safari (manual add-to-home-screen)", () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17 Safari");
    render(<InstallAppPrompt />);
    expect(screen.getByRole("button", { name: /install app/i })).toBeInTheDocument();
  });

  it("shows the install card with steps when the chip is tapped (iOS)", async () => {
    setUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17 Safari");
    render(<InstallAppPrompt />);
    await act(async () => {
      screen.getByRole("button", { name: /install app/i }).click();
    });
    expect(screen.getByText(/Add Mira to your Home Screen/i)).toBeInTheDocument();
    expect(screen.getByText(/Works offline/i)).toBeInTheDocument();
  });
});

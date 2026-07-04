// Keep the R3F/WebGL canvas out of the render (jsdom has no WebGL).
jest.mock("@/components/avatar/OrbCanvas", () => ({ __esModule: true, default: () => null }));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Page from "@/app/page";

describe("Page (voice-call orchestrator)", () => {
  it("renders the core call screen: name, status, and mic", async () => {
    render(<Page />);
    // Mira's name appears in the header.
    expect(await screen.findAllByText("Mira")).not.toHaveLength(0);
    // The primary mic control is present.
    expect(screen.getByRole("button", { name: /start listening/i })).toBeInTheDocument();
    // The text fallback composer is present.
    expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument();
  });

  it("opens Settings from the header", async () => {
    render(<Page />);
    await userEvent.click(screen.getByRole("button", { name: /open settings/i }));
    expect(await screen.findByText("Customize your Mira experience")).toBeInTheDocument();
  });

  it("toggles the theme from the header", async () => {
    document.documentElement.setAttribute("data-theme", "dark");
    render(<Page />);
    await userEvent.click(screen.getByRole("button", { name: /switch to light mode/i }));
    await waitFor(() => expect(document.documentElement.getAttribute("data-theme")).toBe("light"));
  });
});

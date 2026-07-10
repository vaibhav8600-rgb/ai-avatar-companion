// Keep the R3F/WebGL canvas out of the render (jsdom has no WebGL).
jest.mock("@/components/avatar/OrbCanvas", () => ({ __esModule: true, default: () => null }));

import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Page from "@/app/page";

// The call view probes /api/live-token on mount (Gemini Live is the primary
// voice mode). Answer "not configured" so the page settles into classic mode
// silently — exactly the no-key production behavior.
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 424,
    json: async () => ({ error: "gemini_live_not_configured" }),
  }) as unknown as typeof fetch;
});

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

  it("stays on the classic pipeline when Gemini Live isn't configured", async () => {
    render(<Page />);
    // The voice-mode badge reports Classic — no error UI, no dead state.
    expect(await screen.findByText("Classic")).toBeInTheDocument();
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
  });

  it("never clobbers persisted memory/history during mount (StrictMode)", async () => {
    // Regression: the save effects' first run used to write the initial
    // {}/[] defaults over localStorage before the restore state committed —
    // dev StrictMode's second pass then read the clobbered values, minting
    // the Live token with no user name and no history.
    localStorage.setItem("aac:memory:v1", JSON.stringify({ userName: "Vaibhav" }));
    localStorage.setItem(
      "aac:history:v1",
      JSON.stringify([
        { id: "1", role: "user", content: "hello", timestamp: "2026-07-10T10:00:00Z" },
      ]),
    );
    try {
      render(
        <StrictMode>
          <Page />
        </StrictMode>,
      );
      await screen.findByText("Classic"); // mount + effects fully settled
      expect(JSON.parse(localStorage.getItem("aac:memory:v1")!)).toEqual({
        userName: "Vaibhav",
      });
      expect(JSON.parse(localStorage.getItem("aac:history:v1")!)).toHaveLength(1);
    } finally {
      localStorage.clear();
    }
  });

  it("reaches Live mode under StrictMode (dev double-mount) when configured", async () => {
    // Regression: the eager-connect effect used a run-once ref guard with no
    // cleanup; StrictMode's mount→cleanup→mount left dev permanently classic.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        token: "auth_tokens/tok",
        model: "gemini-test-live",
        systemPrompt: "You are Mira.",
      }),
    }) as unknown as typeof fetch;

    // Scriptable socket that auto-opens and acks the setup message.
    class AutoWS {
      static OPEN = 1;
      readyState = 0;
      onopen: (() => void) | null = null;
      onmessage: ((ev: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: ((ev: { code: number; reason: string }) => void) | null = null;
      constructor() {
        setTimeout(() => {
          this.readyState = 1;
          this.onopen?.();
        }, 0);
      }
      send(data: string) {
        if (JSON.parse(data).setup) {
          setTimeout(() => this.onmessage?.({ data: JSON.stringify({ setupComplete: {} }) }), 0);
        }
      }
      close() {
        if (this.readyState === 3) return;
        this.readyState = 3;
        this.onclose?.({ code: 1000, reason: "" });
      }
    }
    const realWS = (globalThis as { WebSocket?: unknown }).WebSocket;
    (globalThis as { WebSocket: unknown }).WebSocket = AutoWS;
    try {
      render(
        <StrictMode>
          <Page />
        </StrictMode>,
      );
      expect(await screen.findByText("Live")).toBeInTheDocument();
    } finally {
      (globalThis as { WebSocket: unknown }).WebSocket = realWS;
    }
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

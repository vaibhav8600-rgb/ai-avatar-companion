import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VoiceMic from "@/components/voice/VoiceMic";
import Waveform from "@/components/voice/Waveform";
import CaptionBar from "@/components/voice/CaptionBar";
import ThinkingIndicator from "@/components/voice/ThinkingIndicator";
import OfflineBanner from "@/components/voice/OfflineBanner";
import VoiceModePill from "@/components/voice/VoiceModePill";

describe("VoiceMic", () => {
  it("fires onPress on click when idle", async () => {
    const onPress = jest.fn();
    render(<VoiceMic state="idle" onPress={onPress} />);
    await userEvent.click(screen.getByRole("button", { name: /start listening/i }));
    expect(onPress).toHaveBeenCalled();
  });

  it("labels itself as stop while listening", () => {
    render(<VoiceMic state="listening" onPress={jest.fn()} />);
    expect(screen.getByRole("button", { name: /stop listening/i })).toBeInTheDocument();
  });
});

describe("Waveform", () => {
  it("renders a canvas and cleans up its RAF loop", () => {
    const { container, unmount } = render(<Waveform tone="amber" width={100} height={40} />);
    expect(container.querySelector("canvas")).toBeInTheDocument();
    expect(() => unmount()).not.toThrow();
  });
});

describe("CaptionBar", () => {
  it("shows the user's words while listening", () => {
    render(<CaptionBar mode="listening" text="what's on my calendar" />);
    expect(screen.getByText(/what's on my calendar/)).toBeInTheDocument();
    expect(screen.getByText("You:")).toBeInTheDocument();
  });

  it("shows Mira's reply while speaking", () => {
    render(<CaptionBar mode="speaking" text="Here you go" assistantName="Mira" />);
    expect(screen.getByText("Mira:")).toBeInTheDocument();
  });
});

describe("ThinkingIndicator", () => {
  it("announces analysis", () => {
    render(<ThinkingIndicator />);
    expect(screen.getByText(/Analyzing your request/i)).toBeInTheDocument();
  });
});

describe("VoiceModePill", () => {
  it("shows Live with the realtime tooltip", () => {
    render(<VoiceModePill mode="live" />);
    const pill = screen.getByText("Live");
    expect(pill).toBeInTheDocument();
    expect(pill.closest("span[title]")).toHaveAttribute(
      "title",
      expect.stringMatching(/Gemini Live/i),
    );
  });

  it("shows Classic for the fallback pipeline", () => {
    render(<VoiceModePill mode="classic" />);
    expect(screen.getByText("Classic")).toBeInTheDocument();
  });
});

describe("OfflineBanner", () => {
  it("shows the offline message and a Retry when a handler is given", async () => {
    const onRetry = jest.fn();
    render(<OfflineBanner onRetry={onRetry} />);
    expect(screen.getByText(/currently offline/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("omits Retry without a handler", () => {
    render(<OfflineBanner />);
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });
});

import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsPanel from "@/components/SettingsPanel";

// Render + flush the async getVoices() mount effect inside act() so its
// setVoices state update doesn't trip the "not wrapped in act(...)" warning.
async function renderPanel(props: Parameters<typeof SettingsPanel>[0]) {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<SettingsPanel {...props} />);
  });
  return result;
}

function makeProps() {
  return {
    open: true,
    onClose: jest.fn(),
    memory: { userName: "Vaibhav" },
    onMemoryChange: jest.fn(),
    volume: 0.78,
    onVolumeChange: jest.fn(),
    voiceName: undefined,
    onVoiceChange: jest.fn(),
    pushToTalk: false,
    onPushToTalkChange: jest.fn(),
    handsFree: false,
    onHandsFreeChange: jest.fn(),
    captionsEnabled: false,
    onCaptionsChange: jest.fn(),
    liveAvatarSupported: true,
    liveAvatarEnabled: false,
    onLiveAvatarChange: jest.fn(),
    ttsModel: "",
    onTtsModelChange: jest.fn(),
    geminiVoice: "",
    onGeminiVoiceChange: jest.fn(),
    knownPersonRecognition: false,
    onKnownPersonRecognitionChange: jest.fn(),
    liveVisionEnabled: true,
    onLiveVisionChange: jest.fn(),
    autoCaptureVision: true,
    onAutoCaptureVisionChange: jest.fn(),
    onResetPermissions: jest.fn(),
    onResetConversation: jest.fn(),
    onExportConversation: jest.fn(),
    onImportConversation: jest.fn(),
  };
}

describe("SettingsPanel", () => {
  it("renders nothing when closed", async () => {
    const { container } = await renderPanel({ ...makeProps(), open: false });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the settings rows when open", async () => {
    await renderPanel(makeProps());
    expect(screen.getByText("Customize your Mira experience")).toBeInTheDocument();
    expect(screen.getByText("Your Name")).toBeInTheDocument();
    expect(screen.getByText("Volume")).toBeInTheDocument();
    expect(screen.getByText("Conversation Backup")).toBeInTheDocument();
  });

  it("exports the conversation via the Export button", async () => {
    const props = makeProps();
    await renderPanel(props);
    await userEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(props.onExportConversation).toHaveBeenCalled();
  });

  it("toggles hands-free through its switch", async () => {
    const props = makeProps();
    await renderPanel(props);
    await userEvent.click(screen.getByRole("switch", { name: /hands-free/i }));
    expect(props.onHandsFreeChange).toHaveBeenCalledWith(true);
  });

  it("closes via the close button", async () => {
    const props = makeProps();
    await renderPanel(props);
    await userEvent.click(screen.getByRole("button", { name: /close settings/i }));
    expect(props.onClose).toHaveBeenCalled();
  });
});

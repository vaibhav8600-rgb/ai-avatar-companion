import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CameraPanel from "@/components/CameraPanel";

function makeProps() {
  return {
    videoRef: createRef<HTMLVideoElement>(),
    status: "active" as const,
    error: null,
    assistantName: "Mira",
    busy: false,
    liveVision: true,
    visionStatus: "Camera ready",
    capture: jest.fn(() => "data:image/jpeg;base64,AAA"),
    onLook: jest.fn(),
    onTeachObjectSave: jest.fn(),
    onTeachPersonSave: jest.fn(),
    onClose: jest.fn(),
    avatarState: "idle" as const,
    pushToTalk: false,
    interimText: "",
    onMicPress: jest.fn(),
    onMicRelease: jest.fn(),
    currentFacingMode: "environment" as const,
    canSwitchCamera: false,
    isSwitchingCamera: false,
    onSwitchCamera: jest.fn(),
  };
}

describe("CameraPanel", () => {
  it("renders the Mira Vision header and focus cards", () => {
    render(<CameraPanel {...makeProps()} />);
    expect(screen.getByText("Vision")).toBeInTheDocument();
    expect(screen.getByText("Look")).toBeInTheDocument();
    expect(screen.getByText("Teach Object")).toBeInTheDocument();
    expect(screen.getByText("Teach Person")).toBeInTheDocument();
  });

  it("triggers Look when the camera is active", async () => {
    const props = makeProps();
    render(<CameraPanel {...props} />);
    await userEvent.click(screen.getByText("Look"));
    expect(props.onLook).toHaveBeenCalled();
  });

  it("closes via the close button", async () => {
    const props = makeProps();
    render(<CameraPanel {...props} />);
    // Exact match hits the header's aria-label "Close camera" (not the
    // "Close Camera" focus card, which has different casing).
    await userEvent.click(screen.getByRole("button", { name: "Close camera" }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("enters the Teach Object flow with a capture step", async () => {
    render(<CameraPanel {...makeProps()} />);
    await userEvent.click(screen.getByText("Teach Object"));
    expect(await screen.findByText(/Teach Mira to remember objects/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^capture$/i })).toBeInTheDocument();
  });
});

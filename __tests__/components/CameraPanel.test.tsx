import { createRef } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
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

  // The mobile "bigger, vertical" preview is driven by the .cam-frame class
  // (tall on phones, aspect-honoring on desktop) + a --cam-aspect CSS var. The
  // media-query sizing itself is CSS (jsdom can't evaluate it), but the class
  // hook and the JS that feeds the var from the stream ARE unit-testable.
  it("sizes the live preview via the cam-frame class and a 16:9 --cam-aspect default", () => {
    const { container } = render(<CameraPanel {...makeProps()} />);
    const frame = container.querySelector(".cam-frame") as HTMLElement | null;
    expect(frame).not.toBeNull();
    expect(frame!.style.getPropertyValue("--cam-aspect")).toBe(String(16 / 9));
  });

  it("adopts the stream's real aspect ratio from video metadata (portrait stream)", () => {
    const { container } = render(<CameraPanel {...makeProps()} />);
    const video = container.querySelector("video") as HTMLVideoElement;
    // jsdom videos report 0×0; define real dimensions before firing the event.
    Object.defineProperty(video, "videoWidth", { value: 1080, configurable: true });
    Object.defineProperty(video, "videoHeight", { value: 1920, configurable: true });
    fireEvent.loadedMetadata(video);
    const frame = container.querySelector(".cam-frame") as HTMLElement;
    expect(frame.style.getPropertyValue("--cam-aspect")).toBe(String(1080 / 1920));
  });
});

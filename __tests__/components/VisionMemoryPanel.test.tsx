import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import VisionMemoryPanel from "@/components/VisionMemoryPanel";
import { saveMemory } from "@/lib/visualMemory";

beforeEach(() => {
  Object.defineProperty(globalThis, "indexedDB", { value: new IDBFactory(), configurable: true });
});

const baseProps = {
  onClose: jest.fn(),
  knownPersonRecognition: false,
  onKnownPersonRecognitionChange: jest.fn(),
};

describe("VisionMemoryPanel", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<VisionMemoryPanel {...baseProps} open={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the empty state for objects when there are no memories", async () => {
    render(<VisionMemoryPanel {...baseProps} open />);
    expect(screen.getByText("Visual Memory")).toBeInTheDocument();
    expect(await screen.findByText(/Nothing learned yet/i)).toBeInTheDocument();
  });

  it("lists saved object memories", async () => {
    await saveMemory({
      type: "object",
      label: "keyboard",
      thumbnailBase64: "data:image/jpeg;base64,AAA",
    });
    render(<VisionMemoryPanel {...baseProps} open />);
    expect(await screen.findByText("keyboard")).toBeInTheDocument();
  });

  it("switches to the People tab", async () => {
    render(<VisionMemoryPanel {...baseProps} open />);
    await userEvent.click(screen.getByRole("button", { name: /^people$/i }));
    expect(await screen.findByText(/No known people yet/i)).toBeInTheDocument();
  });

  it("closes via the close button", async () => {
    const onClose = jest.fn();
    render(<VisionMemoryPanel {...baseProps} onClose={onClose} open />);
    await userEvent.click(screen.getByRole("button", { name: /^close$/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

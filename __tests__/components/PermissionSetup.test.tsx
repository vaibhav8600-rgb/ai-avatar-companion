jest.mock("@/lib/permissionManager", () => ({
  requestCameraAndMic: jest.fn(),
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PermissionSetup from "@/components/PermissionSetup";
import { requestCameraAndMic } from "@/lib/permissionManager";

const mockRequest = requestCameraAndMic as jest.Mock;

describe("PermissionSetup", () => {
  beforeEach(() => mockRequest.mockReset());

  it("renders nothing when closed", () => {
    const { container } = render(
      <PermissionSetup open={false} onGranted={jest.fn()} onDismiss={jest.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the welcome + permission cards when open", () => {
    render(<PermissionSetup open onGranted={jest.fn()} onDismiss={jest.fn()} />);
    expect(screen.getByText(/Welcome to/i)).toBeInTheDocument();
    expect(screen.getByText("Microphone Access")).toBeInTheDocument();
    expect(screen.getByText("Camera Access")).toBeInTheDocument();
  });

  it("calls onGranted after a successful request", async () => {
    mockRequest.mockResolvedValue({ granted: true });
    const onGranted = jest.fn();
    render(<PermissionSetup open onGranted={onGranted} onDismiss={jest.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /enable camera \+ microphone/i }));
    await waitFor(() => expect(onGranted).toHaveBeenCalled());
  });

  it("shows the blocked state when permission is denied", async () => {
    mockRequest.mockResolvedValue({ granted: false, reason: "denied" });
    render(<PermissionSetup open onGranted={jest.fn()} onDismiss={jest.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /enable camera \+ microphone/i }));
    expect(await screen.findByText(/Permissions are blocked/i)).toBeInTheDocument();
  });

  it("dismisses via 'Not now'", async () => {
    const onDismiss = jest.fn();
    render(<PermissionSetup open onGranted={jest.fn()} onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole("button", { name: /not now/i }));
    expect(onDismiss).toHaveBeenCalled();
  });
});

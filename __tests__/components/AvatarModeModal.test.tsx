import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AvatarModeModal from "@/components/AvatarModeModal";

const baseProps = {
  onClose: jest.fn(),
  liveAvatarEnabled: false,
  onLiveAvatarChange: jest.fn(),
};

describe("AvatarModeModal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(<AvatarModeModal {...baseProps} open={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows both avatar modes when open", () => {
    render(<AvatarModeModal {...baseProps} open />);
    expect(screen.getByRole("heading", { name: "Avatar Mode" })).toBeInTheDocument();
    expect(screen.getByText(/Live Lip-Synced Avatar/i)).toBeInTheDocument();
    expect(screen.getByText(/Still Image Fallback/i)).toBeInTheDocument();
  });

  it("saves the selected preference and closes", async () => {
    const onLiveAvatarChange = jest.fn();
    const onClose = jest.fn();
    render(
      <AvatarModeModal
        {...baseProps}
        open
        liveAvatarEnabled={false}
        onLiveAvatarChange={onLiveAvatarChange}
        onClose={onClose}
      />,
    );
    // Select the live card, then save.
    await userEvent.click(screen.getByText(/Live Lip-Synced Avatar/i));
    await userEvent.click(screen.getByRole("button", { name: /save preference/i }));
    expect(onLiveAvatarChange).toHaveBeenCalledWith(true);
    expect(onClose).toHaveBeenCalled();
  });
});

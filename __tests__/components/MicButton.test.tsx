import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MicButton from "@/components/MicButton";

describe("MicButton", () => {
  it("click-to-toggle fires onPress on click", async () => {
    const onPress = jest.fn();
    render(<MicButton state="idle" onPress={onPress} />);
    await userEvent.click(screen.getByRole("button", { name: /start listening/i }));
    expect(onPress).toHaveBeenCalled();
  });

  it("push-to-talk fires onPress on pointerdown and onRelease on pointerup", () => {
    const onPress = jest.fn();
    const onRelease = jest.fn();
    render(<MicButton state="idle" pushToTalk onPress={onPress} onRelease={onRelease} />);
    const btn = screen.getByRole("button");
    fireEvent.pointerDown(btn);
    expect(onPress).toHaveBeenCalled();
    fireEvent.pointerUp(btn);
    expect(onRelease).toHaveBeenCalled();
  });

  it("is disabled while thinking", () => {
    render(<MicButton state="thinking" onPress={jest.fn()} />);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});

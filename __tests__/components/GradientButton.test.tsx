import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GradientButton from "@/components/ui/GradientButton";

describe("GradientButton", () => {
  it("renders its children and fires onClick", async () => {
    const onClick = jest.fn();
    render(<GradientButton onClick={onClick}>Save Preference</GradientButton>);
    const btn = screen.getByRole("button", { name: /save preference/i });
    await userEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire onClick when disabled", async () => {
    const onClick = jest.fn();
    render(
      <GradientButton onClick={onClick} disabled>
        Nope
      </GradientButton>,
    );
    await userEvent.click(screen.getByRole("button", { name: /nope/i }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("supports the submit type and an aria-label", () => {
    render(
      <GradientButton type="submit" aria-label="send">
        →
      </GradientButton>,
    );
    const btn = screen.getByRole("button", { name: "send" });
    expect(btn).toHaveAttribute("type", "submit");
  });
});

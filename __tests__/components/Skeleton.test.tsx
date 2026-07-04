import { render } from "@testing-library/react";
import Skeleton, { CardSkeleton } from "@/components/ui/Skeleton";

describe("Skeleton", () => {
  it("renders the shimmer base class and is decorative (aria-hidden)", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass("skeleton");
    expect(el).toHaveAttribute("aria-hidden");
  });

  it("applies a custom rounded utility and extra classes", () => {
    const { container } = render(<Skeleton rounded="rounded-full" className="h-4 w-4" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass("rounded-full", "h-4", "w-4");
  });

  it("CardSkeleton renders multiple skeleton blocks", () => {
    const { container } = render(<CardSkeleton />);
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThanOrEqual(2);
  });
});

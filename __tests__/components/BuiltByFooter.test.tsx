import { render, screen } from "@testing-library/react";
import BuiltByFooter from "@/components/ui/BuiltByFooter";

describe("BuiltByFooter", () => {
  it("always shows the byline", () => {
    render(<BuiltByFooter />);
    expect(screen.getByText("Built by Vaibhav Rajput")).toBeInTheDocument();
  });

  it("omits the product title by default", () => {
    render(<BuiltByFooter />);
    expect(screen.queryByText(/AI Avatar Companion/)).not.toBeInTheDocument();
  });

  it("shows the product title when requested", () => {
    render(<BuiltByFooter withTitle />);
    expect(screen.getByText(/Mira — AI Avatar Companion/)).toBeInTheDocument();
  });
});

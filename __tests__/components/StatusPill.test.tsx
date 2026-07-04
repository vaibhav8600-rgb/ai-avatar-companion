import { render, screen } from "@testing-library/react";
import StatusPill from "@/components/ui/StatusPill";

describe("StatusPill", () => {
  it("renders the default label for each status", () => {
    render(<StatusPill status="ready" />);
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("shows the listening label", () => {
    render(<StatusPill status="listening" />);
    expect(screen.getByText("Listening")).toBeInTheDocument();
  });

  it("lets the caller override the label", () => {
    render(<StatusPill status="thinking" label="Working…" />);
    expect(screen.getByText("Working…")).toBeInTheDocument();
    expect(screen.queryByText("Thinking…")).not.toBeInTheDocument();
  });

  it("carries the status text color class", () => {
    const { container } = render(<StatusPill status="offline" />);
    expect(container.firstChild).toHaveClass("text-status-error");
  });
});

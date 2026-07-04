import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatView from "@/components/ChatView";
import type { ChatMessage } from "@/types";

const message = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: crypto.randomUUID(),
  role: "user",
  content: "hi",
  timestamp: new Date().toISOString(),
  ...over,
});

const baseProps = {
  assistantName: "Mira",
  thinking: false,
  onSend: jest.fn(),
  onBack: jest.fn(),
};

describe("ChatView", () => {
  it("renders existing messages as bubbles", () => {
    render(<ChatView {...baseProps} messages={[message({ content: "hello world" })]} />);
    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  it("shows an empty-state prompt with no messages", () => {
    render(<ChatView {...baseProps} messages={[]} />);
    expect(screen.getByText(/Say hello to Mira/i)).toBeInTheDocument();
  });

  it("sends typed text and clears the input", async () => {
    const onSend = jest.fn();
    render(<ChatView {...baseProps} onSend={onSend} messages={[]} />);
    const input = screen.getByPlaceholderText("Type a message…") as HTMLInputElement;
    await userEvent.type(input, "how are you");
    await userEvent.click(screen.getByRole("button", { name: /send message/i }));
    expect(onSend).toHaveBeenCalledWith("how are you", undefined);
    expect(input.value).toBe("");
  });

  it("renders a shared image attachment inline", () => {
    render(
      <ChatView
        {...baseProps}
        messages={[message({ content: "look", imageBase64: "data:image/png;base64,AAA" })]}
      />,
    );
    expect(screen.getByAltText("Shared attachment")).toBeInTheDocument();
  });

  it("calls onBack from the header", async () => {
    const onBack = jest.fn();
    render(<ChatView {...baseProps} onBack={onBack} messages={[]} />);
    await userEvent.click(screen.getByRole("button", { name: /back to call/i }));
    expect(onBack).toHaveBeenCalled();
  });
});

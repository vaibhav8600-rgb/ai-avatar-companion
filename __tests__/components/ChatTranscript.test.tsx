import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatTranscript from "@/components/ChatTranscript";
import type { ChatMessage } from "@/types";

const message = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: crypto.randomUUID(),
  role: "user",
  content: "hi",
  timestamp: new Date().toISOString(),
  ...over,
});

const messages = [
  message({ role: "user", content: "hello there" }),
  message({ role: "assistant", content: "general kenobi" }),
];

describe("ChatTranscript", () => {
  it("renders the transcript header and message cards when expanded", () => {
    render(
      <ChatTranscript messages={messages} expanded onToggle={jest.fn()} assistantName="Mira" />,
    );
    expect(screen.getByText("Transcript")).toBeInTheDocument();
    expect(screen.getByText("hello there")).toBeInTheDocument();
    expect(screen.getByText("general kenobi")).toBeInTheDocument();
  });

  it("filters messages by the search box", async () => {
    render(
      <ChatTranscript messages={messages} expanded onToggle={jest.fn()} assistantName="Mira" />,
    );
    await userEvent.type(screen.getByPlaceholderText("Search transcript"), "kenobi");
    expect(screen.queryByText("hello there")).not.toBeInTheDocument();
    expect(screen.getByText("general kenobi")).toBeInTheDocument();
  });

  it("does not render the panel when collapsed", () => {
    render(
      <ChatTranscript
        messages={messages}
        expanded={false}
        onToggle={jest.fn()}
        assistantName="Mira"
      />,
    );
    expect(screen.queryByText("Transcript")).not.toBeInTheDocument();
  });
});

import {
  loadMemory,
  saveMemory,
  clearMemory,
  loadHistory,
  saveHistory,
  clearHistory,
  exportConversation,
  importConversation,
} from "@/lib/memoryManager";
import type { ChatMessage } from "@/types";

const msg = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: crypto.randomUUID?.() ?? Math.random().toString(36),
  role: "user",
  content: "hi",
  timestamp: new Date().toISOString(),
  ...over,
});

beforeEach(() => localStorage.clear());

describe("user memory persistence", () => {
  it("round-trips memory through localStorage", () => {
    saveMemory({ userName: "Vaibhav", notes: ["likes coffee"] });
    expect(loadMemory()).toEqual({ userName: "Vaibhav", notes: ["likes coffee"] });
  });

  it("returns an empty object when nothing is saved", () => {
    expect(loadMemory()).toEqual({});
  });

  it("clears memory", () => {
    saveMemory({ userName: "X" });
    clearMemory();
    expect(loadMemory()).toEqual({});
  });

  it("survives corrupt JSON without throwing", () => {
    localStorage.setItem("aac:memory:v1", "{not json");
    expect(loadMemory()).toEqual({});
  });
});

describe("conversation history persistence", () => {
  it("round-trips history", () => {
    const h = [msg({ content: "one" }), msg({ role: "assistant", content: "two" })];
    saveHistory(h);
    expect(loadHistory()).toHaveLength(2);
    expect(loadHistory()[0].content).toBe("one");
  });

  it("caps stored history to the last 100 messages", () => {
    saveHistory(Array.from({ length: 150 }, (_, i) => msg({ content: `m${i}` })));
    const loaded = loadHistory();
    expect(loaded).toHaveLength(100);
    expect(loaded[0].content).toBe("m50"); // oldest 50 dropped
    expect(loaded[99].content).toBe("m149");
  });

  it("clears history", () => {
    saveHistory([msg()]);
    clearHistory();
    expect(loadHistory()).toEqual([]);
  });
});

describe("conversation export / import", () => {
  it("exports a versioned backup containing messages and memory", () => {
    saveMemory({ userName: "Vaibhav" });
    saveHistory([msg({ content: "hello" })]);
    const parsed = JSON.parse(exportConversation());
    expect(parsed.kind).toBe("mira-conversation");
    expect(parsed.version).toBe(1);
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.memory).toEqual({ userName: "Vaibhav" });
    expect(typeof parsed.exportedAt).toBe("string");
  });

  it("imports a wrapped backup, returning messages and memory", () => {
    const json = JSON.stringify({
      kind: "mira-conversation",
      version: 1,
      messages: [msg({ content: "restored" })],
      memory: { userName: "Imported" },
    });
    const { messages, memory } = importConversation(json);
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe("restored");
    expect(memory).toEqual({ userName: "Imported" });
  });

  it("accepts a bare message array (no memory)", () => {
    const { messages, memory } = importConversation(JSON.stringify([msg({ content: "bare" })]));
    expect(messages[0].content).toBe("bare");
    expect(memory).toBeUndefined();
  });

  it("filters out malformed messages and preserves the image field", () => {
    const json = JSON.stringify({
      messages: [
        msg({ content: "good", imageBase64: "data:image/png;base64,AAA" }),
        { role: "bogus", content: 123 }, // invalid → dropped
        { nonsense: true }, // invalid → dropped
      ],
    });
    const { messages } = importConversation(json);
    expect(messages).toHaveLength(1);
    expect(messages[0].imageBase64).toBe("data:image/png;base64,AAA");
  });

  it("throws on non-conversation JSON", () => {
    expect(() => importConversation(JSON.stringify({ foo: "bar" }))).toThrow();
  });

  it("throws when no valid messages are present", () => {
    expect(() => importConversation(JSON.stringify({ messages: [{ bad: 1 }] }))).toThrow();
  });

  it("throws on invalid JSON text", () => {
    expect(() => importConversation("{not json")).toThrow();
  });

  it("generates an id for messages missing one", () => {
    const { messages } = importConversation(
      JSON.stringify({ messages: [{ role: "user", content: "no id", timestamp: "t" }] }),
    );
    expect(typeof messages[0].id).toBe("string");
    expect(messages[0].id.length).toBeGreaterThan(0);
  });
});

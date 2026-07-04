import { perfStart, perfMark, perfFlush } from "@/lib/perf";

describe("perf instrumentation", () => {
  it("logs a stage summary between start and flush (enabled outside production)", () => {
    const debug = jest.spyOn(console, "debug").mockImplementation(() => {});
    perfStart();
    perfMark("chat");
    perfMark("first-audio");
    perfFlush();
    expect(debug).toHaveBeenCalledTimes(1);
    expect(debug.mock.calls[0][0]).toMatch(/\[mira latency\]/);
    expect(debug.mock.calls[0][0]).toMatch(/chat=\d+ms/);
    expect(debug.mock.calls[0][0]).toMatch(/first-audio=\d+ms/);
    debug.mockRestore();
  });

  it("marks and flush are no-ops when no turn is active", () => {
    const debug = jest.spyOn(console, "debug").mockImplementation(() => {});
    perfFlush(); // nothing active
    perfMark("orphan");
    perfFlush();
    expect(debug).not.toHaveBeenCalled();
    debug.mockRestore();
  });
});

import { IDBFactory } from "fake-indexeddb";
import {
  saveMemory,
  listMemories,
  getMemory,
  updateMemory,
  deleteMemory,
  searchMemories,
  exportMemories,
  importMemories,
} from "@/lib/visualMemory";

// Fresh database per test.
beforeEach(() => {
  Object.defineProperty(globalThis, "indexedDB", { value: new IDBFactory(), configurable: true });
});

const obj = (label: string) => ({
  type: "object" as const,
  label,
  description: `${label} desc`,
  thumbnailBase64: "data:image/jpeg;base64,AAA",
});

describe("visualMemory CRUD (IndexedDB)", () => {
  it("saves and lists a memory with sensible defaults", async () => {
    const saved = await saveMemory(obj("keyboard"));
    expect(saved.id).toBeTruthy();
    expect(saved.consented).toBe(true); // objects are consented by default
    expect(saved.confidenceThreshold).toBe(0.75);

    const all = await listMemories();
    expect(all).toHaveLength(1);
    expect(all[0].label).toBe("keyboard");
  });

  it("defaults people to NOT consented unless specified", async () => {
    const person = await saveMemory({
      type: "person",
      label: "Rohan",
      thumbnailBase64: "data:image/jpeg;base64,AAA",
    });
    expect(person.consented).toBe(false);
  });

  it("gets a memory by id", async () => {
    const saved = await saveMemory(obj("mug"));
    expect((await getMemory(saved.id))?.label).toBe("mug");
    expect(await getMemory("missing")).toBeUndefined();
  });

  it("updates a memory, preserving id and createdAt", async () => {
    const saved = await saveMemory(obj("lamp"));
    const updated = await updateMemory(saved.id, { label: "desk lamp" });
    expect(updated?.id).toBe(saved.id);
    expect(updated?.createdAt).toBe(saved.createdAt);
    expect(updated?.label).toBe("desk lamp");
    expect((await getMemory(saved.id))?.label).toBe("desk lamp");
  });

  it("returns undefined when updating a missing memory", async () => {
    expect(await updateMemory("nope", { label: "x" })).toBeUndefined();
  });

  it("deletes a memory", async () => {
    const saved = await saveMemory(obj("plant"));
    await deleteMemory(saved.id);
    expect(await listMemories()).toHaveLength(0);
  });

  it("searches by label, description, and tags", async () => {
    await saveMemory({ ...obj("guitar"), tags: ["music"] });
    await saveMemory(obj("notebook"));
    expect((await searchMemories("guitar")).map((m) => m.label)).toEqual(["guitar"]);
    expect((await searchMemories("music")).map((m) => m.label)).toEqual(["guitar"]);
    expect(await searchMemories("")).toHaveLength(2); // empty query returns all
  });

  it("exports and re-imports memories (merge by id)", async () => {
    await saveMemory(obj("keyboard"));
    const json = await exportMemories();
    Object.defineProperty(globalThis, "indexedDB", { value: new IDBFactory(), configurable: true });
    const count = await importMemories(json);
    expect(count).toBe(1);
    expect(await listMemories()).toHaveLength(1);
  });

  it("import rejects non-array JSON and skips invalid entries", async () => {
    await expect(importMemories(JSON.stringify({ not: "array" }))).rejects.toThrow();
    const count = await importMemories(
      JSON.stringify([{ id: "1", label: "ok", type: "object" }, { junk: true }]),
    );
    expect(count).toBe(1);
  });
});

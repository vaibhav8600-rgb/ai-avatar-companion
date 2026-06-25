// Client-side visual memory store for Mira Vision.
//
// Images/thumbnails can be large, so these live in IndexedDB (not localStorage,
// which is small and synchronous). Small settings stay in localStorage
// elsewhere. All functions are no-ops / empty on the server.

import type { VisualMemory, VisualMemoryType } from "@/types";

const DB_NAME = "aac-vision";
const DB_VERSION = 1;
const STORE = "memories";

function hasIndexedDB(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("label", "label", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const store = transaction.objectStore(STORE);
        const request = run(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => db.close();
      }),
  );
}

export interface NewVisualMemory {
  type: VisualMemoryType;
  label: string;
  description?: string;
  thumbnailBase64: string;
  extraThumbnails?: string[];
  tags?: string[];
  consented?: boolean;
  confidenceThreshold?: number;
}

export async function saveMemory(input: NewVisualMemory): Promise<VisualMemory> {
  const now = new Date().toISOString();
  const record: VisualMemory = {
    id: crypto.randomUUID(),
    type: input.type,
    label: input.label.trim(),
    description: input.description?.trim() || "",
    thumbnailBase64: input.thumbnailBase64,
    extraThumbnails: input.extraThumbnails,
    createdAt: now,
    updatedAt: now,
    tags: input.tags || [],
    consented: input.consented ?? input.type !== "person",
    confidenceThreshold: input.confidenceThreshold ?? 0.75,
  };
  if (!hasIndexedDB()) return record;
  await tx("readwrite", (s) => s.put(record));
  return record;
}

export async function listMemories(): Promise<VisualMemory[]> {
  if (!hasIndexedDB()) return [];
  const all = await tx<VisualMemory[]>("readonly", (s) => s.getAll() as IDBRequest<VisualMemory[]>);
  return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getMemory(id: string): Promise<VisualMemory | undefined> {
  if (!hasIndexedDB()) return undefined;
  return tx<VisualMemory | undefined>("readonly", (s) => s.get(id) as IDBRequest<VisualMemory | undefined>);
}

export async function searchMemories(query: string): Promise<VisualMemory[]> {
  const q = query.trim().toLowerCase();
  const all = await listMemories();
  if (!q) return all;
  return all.filter(
    (m) =>
      m.label.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.tags.some((t) => t.toLowerCase().includes(q)),
  );
}

export async function deleteMemory(id: string): Promise<void> {
  if (!hasIndexedDB()) return;
  await tx("readwrite", (s) => s.delete(id));
}

export async function updateMemory(
  id: string,
  patch: Partial<Omit<VisualMemory, "id" | "createdAt">>,
): Promise<VisualMemory | undefined> {
  const existing = await getMemory(id);
  if (!existing) return undefined;
  const updated: VisualMemory = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  if (!hasIndexedDB()) return updated;
  await tx("readwrite", (s) => s.put(updated));
  return updated;
}

/** Export all memories as a JSON string. */
export async function exportMemories(): Promise<string> {
  const all = await listMemories();
  return JSON.stringify(all, null, 2);
}

/** Import memories from a JSON string (merge by id). Returns count imported. */
export async function importMemories(json: string): Promise<number> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Invalid JSON");
  }
  if (!Array.isArray(parsed)) throw new Error("Expected an array of memories");
  let count = 0;
  for (const item of parsed as VisualMemory[]) {
    if (item && item.id && item.label && item.type) {
      if (hasIndexedDB()) await tx("readwrite", (s) => s.put(item));
      count++;
    }
  }
  return count;
}

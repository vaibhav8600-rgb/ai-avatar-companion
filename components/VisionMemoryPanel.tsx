"use client";

// Manage Mira's learned visual memories (objects + known people).
// Lists thumbnails, allows rename/notes edits, delete, and JSON export/import.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  listMemories,
  deleteMemory,
  updateMemory,
  exportMemories,
  importMemories,
} from "@/lib/visualMemory";
import type { VisualMemory } from "@/types";

interface VisionMemoryPanelProps {
  open: boolean;
  onClose: () => void;
  knownPersonRecognition: boolean;
  onKnownPersonRecognitionChange: (v: boolean) => void;
}

export default function VisionMemoryPanel({
  open,
  onClose,
  knownPersonRecognition,
  onKnownPersonRecognitionChange,
}: VisionMemoryPanelProps) {
  const [memories, setMemories] = useState<VisualMemory[]>([]);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    listMemories()
      .then(setMemories)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  if (!open) return null;

  const objects = memories.filter((m) => m.type === "object");
  const people = memories.filter((m) => m.type === "person");
  const others = memories.filter((m) => m.type !== "object" && m.type !== "person");

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this visual memory?")) return;
    await deleteMemory(id);
    refresh();
  };

  const handleRename = async (m: VisualMemory) => {
    const label = prompt("Rename memory", m.label);
    if (label === null) return;
    const description = prompt("Edit notes/description", m.description) ?? m.description;
    await updateMemory(m.id, { label: label.trim() || m.label, description });
    refresh();
  };

  const handleExport = async () => {
    const json = await exportMemories();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mira-vision-memories.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const count = await importMemories(text);
      alert(`Imported ${count} memories.`);
      refresh();
    } catch {
      alert("Couldn't import that file.");
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-ink-900/70 backdrop-blur-sm animate-fade-up p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md max-h-[90dvh] flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-800/95 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between px-6 py-4 border-b border-white/[0.05]">
          <h2 className="font-display text-lg text-cream-50">Vision memory</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid place-items-center h-7 w-7 rounded-full hover:bg-white/[0.06] text-cream-100/60"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="transcript-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Known-person recognition toggle */}
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm text-cream-100/80">Known-person recognition</span>
            <input
              type="checkbox"
              checked={knownPersonRecognition}
              onChange={(e) => onKnownPersonRecognitionChange(e.target.checked)}
              className="accent-signal-500 h-4 w-4"
            />
          </label>
          <p className="text-[10px] leading-relaxed text-cream-100/40 -mt-3">
            Only matches people you&apos;ve enrolled with consent. Strangers are
            never identified.
          </p>

          {loading && <p className="text-sm text-cream-100/40">Loading…</p>}
          {!loading && memories.length === 0 && (
            <p className="text-sm text-cream-100/40 italic">
              Nothing learned yet. Open the camera and use “Teach object”.
            </p>
          )}

          {objects.length > 0 && (
            <MemoryGroup title="Objects" items={objects} onDelete={handleDelete} onRename={handleRename} />
          )}
          {people.length > 0 && (
            <MemoryGroup title="Known people" items={people} onDelete={handleDelete} onRename={handleRename} />
          )}
          {others.length > 0 && (
            <MemoryGroup title="Other" items={others} onDelete={handleDelete} onRename={handleRename} />
          )}

          <div className="flex gap-2 pt-2 border-t border-white/[0.05]">
            <button
              type="button"
              onClick={handleExport}
              className="flex-1 px-3 py-2 rounded-lg text-xs bg-white/[0.04] border border-white/[0.08] text-cream-100/70 hover:bg-white/[0.06]"
            >
              Export JSON
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex-1 px-3 py-2 rounded-lg text-xs bg-white/[0.04] border border-white/[0.08] text-cream-100/70 hover:bg-white/[0.06]"
            >
              Import JSON
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleImport(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function MemoryGroup({
  title,
  items,
  onDelete,
  onRename,
}: {
  title: string;
  items: VisualMemory[];
  onDelete: (id: string) => void;
  onRename: (m: VisualMemory) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-[0.18em] text-cream-100/40">{title}</p>
      {items.map((m) => (
        <div key={m.id} className="flex items-center gap-3 rounded-lg bg-white/[0.03] border border-white/[0.06] p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m.thumbnailBase64} alt={m.label} className="h-12 w-12 shrink-0 rounded-md object-cover border border-white/10" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-cream-100 truncate">{m.label}</p>
            <p className="text-[10px] text-cream-100/40">
              {new Date(m.createdAt).toLocaleDateString()}
              {m.description ? ` · ${m.description.slice(0, 40)}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRename(m)}
            className="text-[11px] text-cream-100/60 hover:text-cream-100 px-2"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(m.id)}
            className="text-[11px] text-red-400/80 hover:text-red-400 px-2"
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  );
}

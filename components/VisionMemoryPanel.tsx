"use client";

// Manage Mira's learned visual memories (objects + known people).
// Restyled to mockup image 1: tabs, search / sort / grid-list toggle, thumbnail
// cards with relative "Saved …" time + overflow menu, JSON export/import, and a
// clear-all bar. All storage logic (IndexedDB via lib/visualMemory) unchanged.

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listMemories,
  deleteMemory,
  updateMemory,
  exportMemories,
  importMemories,
} from "@/lib/visualMemory";
import { CardSkeleton } from "@/components/ui/Skeleton";
import type { VisualMemory } from "@/types";

interface VisionMemoryPanelProps {
  open: boolean;
  onClose: () => void;
  knownPersonRecognition: boolean;
  onKnownPersonRecognitionChange: (v: boolean) => void;
}

type Tab = "objects" | "people";
type Sort = "newest" | "oldest" | "name";

export default function VisionMemoryPanel({
  open,
  onClose,
  knownPersonRecognition,
  onKnownPersonRecognitionChange,
}: VisionMemoryPanelProps) {
  const [memories, setMemories] = useState<VisualMemory[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("objects");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [grid, setGrid] = useState(true);
  const [menuId, setMenuId] = useState<string | null>(null);
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
  useEffect(() => {
    if (open) setMenuId(null);
  }, [open, tab]);

  const items = useMemo(() => {
    const base = memories.filter((m) =>
      tab === "people" ? m.type === "person" : m.type !== "person",
    );
    const q = query.trim().toLowerCase();
    const filtered = q ? base.filter((m) => m.label.toLowerCase().includes(q)) : base;
    return [...filtered].sort((a, b) => {
      if (sort === "name") return a.label.localeCompare(b.label);
      const da = +new Date(a.createdAt),
        db = +new Date(b.createdAt);
      return sort === "oldest" ? da - db : db - da;
    });
  }, [memories, tab, query, sort]);

  if (!open) return null;

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this visual memory?")) return;
    await deleteMemory(id);
    setMenuId(null);
    refresh();
  };
  const handleRename = async (m: VisualMemory) => {
    setMenuId(null);
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
      const count = await importMemories(await file.text());
      alert(`Imported ${count} memories.`);
      refresh();
    } catch {
      alert("Couldn't import that file.");
    }
  };
  const handleClearAll = async () => {
    if (!confirm("Delete ALL visual memories on this device?")) return;
    await Promise.all(memories.map((m) => deleteMemory(m.id)));
    refresh();
  };

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-cosmic-base/70 p-4 backdrop-blur-sm animate-fade-up"
      onClick={onClose}
    >
      <div className="relative w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-panel bg-brand-gradient opacity-40 blur-md"
        />
        <div className="glass relative flex max-h-[92dvh] flex-col overflow-hidden rounded-panel">
          {/* Header */}
          <header className="flex items-start justify-between gap-3 px-6 py-5">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-ink-primary">Visual Memory</h2>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-cyan/10 px-2.5 py-1 text-xs text-accent-cyan">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent-cyan" /> Local-only memory
                </span>
              </div>
              <p className="text-sm text-ink-secondary">
                Manage what Mira remembers locally on this device.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-10 w-10 place-items-center rounded-full glass text-ink-secondary hover:text-ink-primary"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </header>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 px-6">
            <div className="flex rounded-full border border-white/10 bg-white/[0.03] p-1 text-sm">
              {(["objects", "people"] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`relative rounded-full px-4 py-1.5 font-medium capitalize ${tab === t ? "text-onbrand" : "text-ink-secondary hover:text-ink-primary"}`}
                >
                  {tab === t && (
                    <motion.span
                      layoutId="mem-tab"
                      className="absolute inset-0 rounded-full bg-brand-gradient"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <span className="relative">{t}</span>
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={handleExport}
                className="rounded-full glass px-3 py-1.5 text-xs text-ink-secondary hover:text-ink-primary"
              >
                Export JSON
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-full glass px-3 py-1.5 text-xs text-ink-secondary hover:text-ink-primary"
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

          {/* Search + sort + view */}
          <div className="flex items-center gap-2 px-6 py-4">
            <div className="glass flex flex-1 items-center gap-2 rounded-full px-3 py-2">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="text-ink-muted"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search memories"
                className="flex-1 bg-transparent text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none"
              />
            </div>
            <div className="relative">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="appearance-none rounded-full glass px-3 py-2 pr-8 text-xs text-ink-secondary focus:outline-none"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="name">Name</option>
              </select>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
            <div className="flex rounded-full glass p-1">
              <button
                type="button"
                onClick={() => setGrid(true)}
                aria-label="Grid view"
                className={`grid h-7 w-7 place-items-center rounded-full ${grid ? "bg-brand-gradient text-onbrand" : "text-ink-secondary"}`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="14" y="14" width="7" height="7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setGrid(false)}
                aria-label="List view"
                className={`grid h-7 w-7 place-items-center rounded-full ${!grid ? "bg-brand-gradient text-onbrand" : "text-ink-secondary"}`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                >
                  <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                </svg>
              </button>
            </div>
          </div>

          {/* People-only: recognition toggle */}
          {tab === "people" && (
            <div className="mx-6 mb-3 flex items-center justify-between gap-3 rounded-card border border-white/10 bg-white/[0.03] p-3">
              <div>
                <p className="text-sm text-ink-primary">Known-person recognition</p>
                <p className="text-xs text-ink-muted">
                  Only matches people you enrolled with consent. Strangers are never identified.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={knownPersonRecognition}
                onClick={() => onKnownPersonRecognitionChange(!knownPersonRecognition)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${knownPersonRecognition ? "bg-brand-gradient" : "bg-white/10"}`}
              >
                <motion.span
                  layout
                  className="absolute top-1 h-5 w-5 rounded-full bg-onbrand"
                  style={{ left: knownPersonRecognition ? 24 : 4 }}
                />
              </button>
            </div>
          )}

          {/* Grid / list */}
          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-2">
            {loading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <CardSkeleton key={i} />
                ))}
              </div>
            ) : items.length === 0 ? (
              <p className="py-8 text-center text-sm italic text-ink-muted">
                {query
                  ? "No matching memories."
                  : tab === "people"
                    ? "No known people yet. Use “Teach Person” in the camera."
                    : "Nothing learned yet. Open the camera and use “Teach Object”."}
              </p>
            ) : (
              <motion.div
                layout
                className={grid ? "grid grid-cols-2 gap-3 sm:grid-cols-3" : "space-y-2"}
              >
                <AnimatePresence>
                  {items.map((m, i) => (
                    <MemoryCard
                      key={m.id}
                      m={m}
                      grid={grid}
                      index={i}
                      menuOpen={menuId === m.id}
                      onMenu={() => setMenuId(menuId === m.id ? null : m.id)}
                      onRename={() => handleRename(m)}
                      onDelete={() => handleDelete(m.id)}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            )}
          </div>

          {/* Bottom bar */}
          <footer className="flex flex-col gap-3 border-t border-white/[0.06] px-6 py-4 sm:flex-row sm:items-center">
            <p className="flex-1 text-xs text-ink-muted">
              Memory is stored locally in your browser. Your data never leaves your device.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClearAll}
                className="rounded-full border border-status-error/50 px-4 py-2 text-sm font-medium text-status-error hover:bg-status-error/10"
              >
                Clear All Memory
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

function MemoryCard({
  m,
  grid,
  index,
  menuOpen,
  onMenu,
  onRename,
  onDelete,
}: {
  m: VisualMemory;
  grid: boolean;
  index: number;
  menuOpen: boolean;
  onMenu: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const saved = relTime(m.createdAt);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      whileHover={{ y: -3 }}
      className={`group relative overflow-hidden rounded-card border border-white/10 bg-white/[0.03] transition-shadow hover:shadow-glow-violet ${grid ? "" : "flex items-center gap-3 p-2"}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={m.thumbnailBase64}
        alt={m.label}
        className={grid ? "h-28 w-full object-cover" : "h-14 w-14 shrink-0 rounded-lg object-cover"}
      />
      <div className={grid ? "p-3" : "min-w-0 flex-1"}>
        <p className="truncate text-sm font-medium text-ink-primary">{m.label}</p>
        <p className="text-xs text-ink-muted">Saved {saved}</p>
      </div>
      <button
        type="button"
        onClick={onMenu}
        aria-label="More"
        className={`grid h-7 w-7 place-items-center rounded-full text-ink-secondary hover:bg-white/10 hover:text-ink-primary ${grid ? "absolute right-2 top-2 bg-cosmic-base/60" : ""}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute right-2 top-10 z-10 w-28 overflow-hidden rounded-xl glass"
          >
            <button
              type="button"
              onClick={onRename}
              className="block w-full px-3 py-2 text-left text-sm text-ink-primary hover:bg-white/10"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="block w-full px-3 py-2 text-left text-sm text-status-error hover:bg-status-error/10"
            >
              Delete
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function relTime(iso: string): string {
  const diff = Date.now() - +new Date(iso);
  const day = 86400000;
  if (diff < day) return "today";
  const days = Math.floor(diff / day);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString();
}

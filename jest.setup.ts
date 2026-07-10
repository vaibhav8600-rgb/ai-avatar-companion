// Runs before each test file. Extends `expect` with DOM matchers and installs
// the browser-API shims jsdom is missing. DOM shims are guarded so this file is
// safe under the `node` test environment (used for server-route tests) too.
import "@testing-library/jest-dom";
import "fake-indexeddb/auto";
import { webcrypto, randomUUID } from "node:crypto";

/* ---- crypto.randomUUID (memoryManager, visualMemory, page) ---- */
if (!globalThis.crypto || typeof globalThis.crypto.randomUUID !== "function") {
  try {
    Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  } catch {
    try {
      Object.defineProperty(globalThis.crypto, "randomUUID", {
        value: () => randomUUID(),
        configurable: true,
      });
    } catch {
      /* affected tests guard for a string id */
    }
  }
}

/* ---- structuredClone (fake-indexeddb needs it; jsdom lacks it) ---- */
if (typeof globalThis.structuredClone !== "function") {
  globalThis.structuredClone = (val: unknown) => JSON.parse(JSON.stringify(val));
}

/* ---- Never touch real Upstash Redis from unit tests: force apiGuard's
   in-memory rate-limit fallback by clearing the env before modules load. ---- */
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

/* ---- Never mint real Gemini Live tokens from unit tests (next/jest loads
   .env.local): tests that exercise /api/live-token set these explicitly and
   mock fetch. ---- */
delete process.env.ENABLE_GEMINI_LIVE;
delete process.env.GOOGLE_API_KEY;

/* ---- DOM-only shims (skipped under the node test environment) ---- */
if (typeof window !== "undefined") {
  // matchMedia (theme, reduced-motion, responsive hooks)
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }),
    });
  }

  // Resize / Intersection observers
  class MockObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MockObserver;
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = MockObserver;

  // Canvas 2D context stub (Waveform / CosmicBackground draw loops)
  const gradientStub = { addColorStop: jest.fn() };
  const ctx2dStub = new Proxy(
    {
      canvas: {} as HTMLCanvasElement,
      createLinearGradient: () => gradientStub,
      createRadialGradient: () => gradientStub,
      getImageData: () => ({ data: [] }),
    },
    {
      get(target: Record<string, unknown>, prop: string) {
        if (prop in target) return target[prop];
        return () => undefined; // any other 2d method → no-op
      },
    },
  );
  HTMLCanvasElement.prototype.getContext = jest.fn((type: string) =>
    type === "2d" ? ctx2dStub : null,
  ) as unknown as HTMLCanvasElement["getContext"];

  // HTMLMediaElement play/pause (AvatarStage video/audio)
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: jest.fn().mockResolvedValue(undefined),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: jest.fn(),
  });

  // scrollIntoView
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = jest.fn();
  }

  // Blob URL helpers (JSON export/download handlers)
  if (!URL.createObjectURL) {
    URL.createObjectURL = jest.fn(() => "blob:mock");
    URL.revokeObjectURL = jest.fn();
  }
}

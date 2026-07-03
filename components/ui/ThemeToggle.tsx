"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

/**
 * Light/dark toggle. The initial theme is applied before hydration by the
 * inline script in app/layout.tsx (localStorage "mira-theme", falling back to
 * the OS preference), so this component only reads and flips the attribute.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  // Render a stable placeholder until mounted to avoid hydration mismatch.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  const toggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("mira-theme", next);
    } catch {
      /* storage unavailable — theme just won't persist */
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      className={`grid h-10 w-10 place-items-center rounded-full glass text-ink-secondary hover:text-ink-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-violet/70 ${className}`}
    >
      {theme === "light" ? (
        /* moon */
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      ) : (
        /* sun */
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )}
    </button>
  );
}

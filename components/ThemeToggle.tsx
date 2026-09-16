"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

/**
 * Dark mode toggle. The initial class is set by the inline script in app/layout.tsx;
 * localStorage is written only when the user toggles (never on first visit).
 * State lives in the <html> class; a MutationObserver keeps React in sync.
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
const readDark = () => document.documentElement.classList.contains("dark");
const serverDark = () => false;

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, readDark, serverDark);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // Private mode or blocked storage: the toggle still works for this visit.
    }
  }

  const label = dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
  return (
    <button
      type="button"
      className="icon-btn"
      data-plain="true"
      aria-label={label}
      title={label}
      onClick={toggle}
    >
      {dark ? (
        <Sun size={20} strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <Moon size={20} strokeWidth={1.75} aria-hidden="true" />
      )}
    </button>
  );
}

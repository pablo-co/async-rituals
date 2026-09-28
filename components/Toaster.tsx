"use client";

import { Check } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { toastText, withoutToast } from "@/lib/toasts";

/**
 * The toast region (DESIGN.md v1.1): bottom-right on desktop, top on phones, 4 s, at most 3, announced politely.
 * A tiny external store holds the toasts so any client component can call `showToast`; server actions reach it
 * through `?toast=…` (lib/toasts.ts), which this component reads once and then removes from the address.
 */
type Toast = { id: number; text: string };

const DURATION_MS = 4000;
const MAX = 3;
let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function showToast(text: string): void {
  const id = nextId++;
  toasts = [...toasts, { id, text }].slice(-MAX);
  emit();
  window.setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, DURATION_MS);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => toasts;
const NONE: Toast[] = [];
const serverSnapshot = () => NONE; // must be the same array every call (React caches by identity)

export function Toaster() {
  const current = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const query = useSearchParams().toString();
  const pathname = usePathname();
  const router = useRouter();
  // The query already turned into a toast: React runs effects twice in development, and the address is only
  // cleaned after the replace lands. Reset once the address has no toast, so the next identical action shows again.
  const handled = useRef<string | null>(null);

  useEffect(() => {
    const clean = withoutToast(pathname, query);
    if (clean === null) {
      handled.current = null;
      return;
    }
    if (handled.current === query) return;
    handled.current = query;
    const text = toastText(Object.fromEntries(new URLSearchParams(query).entries()));
    if (text) showToast(text);
    router.replace(clean, { scroll: false });
  }, [query, pathname, router]);

  return (
    <div className="toast-region" aria-live="polite">
      {current.map((t) => (
        <div key={t.id} className="toast" data-tone="success" role="status">
          <Check size={18} strokeWidth={1.75} aria-hidden="true" />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "success" | "warning" | "error" | "info";

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className="badge" data-tone={tone === "neutral" ? undefined : tone}>
      {children}
    </span>
  );
}

import { Check, CircleAlert, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

export type AlertTone = "success" | "warning" | "error" | "info";

// Full class names on purpose: Tailwind only emits utilities it can read in source.
const CLASSES: Record<AlertTone, string> = {
  success: "alert-inline alert-success",
  warning: "alert-inline alert-warning",
  error: "alert-inline alert-error",
  info: "alert-inline alert-info",
};

const ICONS = { success: Check, warning: TriangleAlert, error: CircleAlert, info: Info };

/** Inline alert (DESIGN.md v1.2). Sits above the section it applies to; says what happened and what to do. */
export function Alert({ tone, children }: { tone: AlertTone; children: ReactNode }) {
  const Icon = ICONS[tone];
  return (
    <div className={CLASSES[tone]} role={tone === "error" ? "alert" : "status"}>
      <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

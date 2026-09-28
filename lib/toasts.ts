import { formatLongDate } from "@/lib/format";

/**
 * Confirmations after a server action (DESIGN.md "Toast": to confirm what was done; an error that needs a decision
 * stays an inline alert). The action redirects with `?toast={code}` plus its values; the Toaster shows the text
 * and removes these keys from the address so a reload does not repeat it.
 */
export const TOAST_KEYS = ["toast", "next", "channel", "until"] as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function toastText(params: Record<string, string | undefined>): string | null {
  switch (params.toast) {
    case "saved":
      return `Guardado. El próximo juego sale el ${params.next || "próximo día del ritmo"} por la mañana.`;
    case "published":
      return `Publicado en #${params.channel || "el canal"}.`;
    case "paused":
      return params.until && DATE.test(params.until) ? `Pausado hasta el ${formatLongDate(params.until)}.` : "Pausado.";
    case "unpaused":
      return "Pausa quitada.";
    case "vetoed":
      return "Vetado. Se rellena en la próxima generación.";
    default:
      return null;
  }
}

/** The address without the toast keys (null when nothing had to be removed). */
export function withoutToast(pathname: string, search: string): string | null {
  const params = new URLSearchParams(search);
  if (!params.has("toast")) return null;
  for (const key of TOAST_KEYS) params.delete(key);
  const rest = params.toString();
  return rest ? `${pathname}?${rest}` : pathname;
}

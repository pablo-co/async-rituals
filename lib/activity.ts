/** Texts of the Actividad page (aggregates only: never a name). */
import type { AdminActivity, RecentGame } from "@/lib/db/types";
import { formatSlotDate } from "@/lib/format";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Onboarding does not exist until milestone 5: "0 de 7 con onboarding" read as a failure, so it only shows once someone answered. */
export function summaryLine(activity: AdminActivity): string {
  const parts = [
    plural(activity.games_published, "juego publicado", "juegos publicados"),
    `${plural(activity.members, "persona", "personas")} en el ritual`,
  ];
  if (activity.onboarded > 0) parts.push(`${activity.onboarded} de ${activity.members} contestaron «Cuéntanos de ti»`);
  return parts.join(" · ");
}

/** Esto o aquello has no right answer, so it never says "acertaron". */
export function gameMeta(game: RecentGame): string {
  const day = formatSlotDate(game.slot_date);
  if (game.status === "skipped") return `${day} · saltado`;
  const answers = plural(game.answers, "respuesta", "respuestas");
  if (game.type === "this_or_that" || game.status === "posted") return `${day} · ${answers}`;
  return `${day} · ${answers} · ${game.correct} ${game.correct === 1 ? "acertó" : "acertaron"}`;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GameAdmin } from "@/lib/db/types";
import { DbError } from "@/lib/errors";
import { formatLongDate } from "@/lib/format";
import { GAME_LABELS, type GameType } from "@/lib/games/types";
import { QUEUE_TARGET } from "./fill";

/**
 * What the admin does to the queue from Cola (D-2C, hito 6):
 *
 *   Vetar ──▶ sheet (focus on Cancelar) ──▶ vetoGame: queued → vetoed (only while still queued) ──▶ "por rellenar"
 *   Generar otra semana ──▶ fillTeam({ target: nextWeekTarget }) in after() ──▶ Cola polls until `want` rows exist
 *
 * A veto never calls the AI: the date is free again and the next fill (tick or button) puts a new game there.
 */
export const QUEUE_MAX = 10;

/** Only while still queued: a game already posting or posted is not the admin's to take back. */
export async function vetoGame(db: SupabaseClient, teamId: string, gameId: string): Promise<GameType | null> {
  const { data, error } = await db
    .from("games")
    .update({ status: "vetoed" })
    .eq("id", gameId)
    .eq("team_id", teamId)
    .eq("status", "queued")
    .select("type");
  if (error) throw new DbError(error.message, error.code);
  const rows = (data ?? []) as { type: GameType }[];
  return rows[0]?.type ?? null;
}

/** One more week of the team's cadence, never past QUEUE_MAX (nor below the usual target). */
export function nextWeekTarget(futureGames: number, cadence: number): number {
  return Math.min(QUEUE_MAX, Math.max(QUEUE_TARGET, futureGames + cadence));
}

/** Pending games (not vetoed, not recaps): what "La cola ya tiene 10 juegos" counts. */
export function pendingGames(games: readonly Pick<GameAdmin, "type" | "status">[]): number {
  return games.filter((g) => g.status !== "vetoed" && g.type !== "recap").length;
}

/** A vetoed row shows "por rellenar" only until a new game takes its date. */
export function visibleQueue<T extends Pick<GameAdmin, "type" | "status" | "slot_date">>(games: readonly T[]): T[] {
  const kind = (g: Pick<GameAdmin, "type">) => (g.type === "recap" ? "recap" : "game");
  return games.filter(
    (g) =>
      g.status !== "vetoed" ||
      !games.some((o) => o !== g && o.status !== "vetoed" && o.slot_date === g.slot_date && kind(o) === kind(g)),
  );
}

/** Sheet title (D-2C): the question when the admin may see it; the template and day when the content is hidden. */
export function vetoTitle(game: Pick<GameAdmin, "type" | "slot_date" | "preview">): string {
  if (game.preview && game.type !== "recap") return `¿Vetar «${game.preview}»?`;
  return `¿Vetar el ${GAME_LABELS[game.type]} del ${formatLongDate(game.slot_date)}?`;
}

export function vetoBody(game: Pick<GameAdmin, "type" | "slot_date">): string {
  if (game.type === "recap") return `Ese viernes (${formatLongDate(game.slot_date)}) no sale el recap.`;
  return "Se quita de la cola. El siguiente relleno pone otro juego ese día.";
}

/** Longest pause Conectar accepts: a vacation or an offsite, not a way to switch the ritual off (that is Slack's uninstall). */
export const PAUSE_MAX_DAYS = 90;

/**
 * Validates "Pausar hasta el {fecha}, incluido" against today in the team's timezone (plan CEO 3).
 * Returns the ISO date to store, or the reason it was refused.
 */
export function checkPauseDate(value: string, today: string): { until: string } | { error: "pause_date" | "pause_past" | "pause_long" } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return { error: "pause_date" };
  if (value < today) return { error: "pause_past" };
  const days = (Date.parse(`${value}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  if (days > PAUSE_MAX_DAYS) return { error: "pause_long" };
  return { until: value };
}

/** An expired pause (before today) is not a pause any more; the next post clears it and says "Ya volvimos". */
export function activePause(pausedUntil: string | null, today: string): string | null {
  return pausedUntil && pausedUntil >= today ? pausedUntil : null;
}

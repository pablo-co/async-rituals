import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemberRow } from "@/lib/db/types";
import { TemplateError } from "@/lib/errors";
import { logEvent } from "@/lib/events";
import { header, section } from "@/lib/slack/blocks";
import { strings } from "@/lib/slack/strings";
import { escapeSlackText } from "@/lib/slack/text";
import { addDays, weekStartOf } from "@/lib/time";
import type { GameTemplate } from "./template";

/**
 * Friday recap (D-1A, plan CEO 2). Not part of the rotation: `ensureRecaps` (lib/queue/fill.ts) queues one
 * per Friday at 18:00 local, the tick posts it after that evening's reveals, and it stays `posted` forever
 * (claim 'reveal' excludes recaps). Fixed order:
 *
 *   1. Momento de la semana   week_moment()   decorative: fails soft (event, line omitted)
 *   2. Racha más larga        recap_data      only when the longest live streak is ≥ 2
 *   3. Puntos de la semana    recap_data      top 3 (ties at the cut included, 5 names max)
 *   4. "{n} de {m} jugaron esta semana."
 *
 * A week without revealed games posts nothing: render throws TemplateError("no_answers") → skipped(no_answers).
 */
export interface RecapData {
  week_start: string;
  week_end: string;
  revealed: number;
  played: number;
  members: number;
  top: { member_id: string; points: number }[];
  streak: number;
  streak_member_ids: string[];
}

export interface WeekMoment {
  game_id: string;
  type: "guess_who" | "two_truths";
  member_id: string;
  text: string;
  fooled: number;
  total: number;
}

const TOP = 3;
const TOP_MAX_WITH_TIES = 5;
const MIN_STREAK = 2;

function nameOf(members: readonly MemberRow[], id: string): string | null {
  const member = members.find((m) => m.id === id);
  return member ? escapeSlackText(member.display_name) : null;
}

/** Top 3 by points; whoever ties with the third also makes it, up to 5 names. */
export function topRows(data: RecapData, members: readonly MemberRow[]): { name: string; points: number }[] {
  const named = data.top
    .map((r) => ({ name: nameOf(members, r.member_id), points: Number(r.points) }))
    .filter((r): r is { name: string; points: number } => r.name !== null && r.points > 0);
  if (named.length <= TOP) return named;
  const cut = named[TOP - 1].points;
  return named.filter((r, i) => i < TOP || r.points === cut).slice(0, TOP_MAX_WITH_TIES);
}

export function recapLines(data: RecapData, moment: WeekMoment | null, members: readonly MemberRow[]): string[] {
  const lines: string[] = [];

  if (moment && moment.fooled > 0) {
    const name = nameOf(members, moment.member_id);
    if (name) {
      const text = escapeSlackText(moment.text);
      lines.push(
        moment.type === "two_truths"
          ? strings.recap.momentTwoTruths(text, name, moment.fooled, moment.total)
          : strings.recap.momentGuessWho(text, name, moment.fooled, moment.total),
      );
    }
  }

  if (data.streak >= MIN_STREAK) {
    const names = data.streak_member_ids.map((id) => nameOf(members, id)).filter((n): n is string => n !== null);
    if (names.length > 0) lines.push(strings.recap.streak(names.sort((a, b) => a.localeCompare(b, "es")), data.streak));
  }

  const top = topRows(data, members);
  if (top.length > 0) lines.push(strings.recap.top(top));

  lines.push(strings.recap.played(data.played, data.members));
  return lines;
}

async function loadMoment(db: SupabaseClient, teamId: string, from: string, to: string): Promise<WeekMoment | null> {
  const { data, error } = await db.rpc("week_moment", { p_team_id: teamId, p_from: from, p_to: to });
  if (error) throw new Error(error.message);
  return (data as WeekMoment | null) ?? null;
}

export const recap: GameTemplate = {
  type: "recap",

  async generate() {
    return null; // queued by ensureRecaps, never by the rotation
  },

  async render(ctx, game, members) {
    const weekStart = weekStartOf(game.slot_date);
    const { data, error } = await ctx.db.rpc("recap_data", { p_team_id: ctx.team.id, p_week_start: weekStart });
    if (error) throw new TemplateError(`recap_data: ${error.message}`, "template_error");
    const week = data as RecapData | null;
    if (!week || Number(week.revealed) === 0) throw new TemplateError("Semana sin juegos revelados", "no_answers");

    let moment: WeekMoment | null = null;
    try {
      moment = await loadMoment(ctx.db, ctx.team.id, weekStart, addDays(weekStart, 4));
    } catch (e) {
      await logEvent(ctx.db, {
        teamId: ctx.team.id,
        kind: "decoration_failed",
        gameId: game.id,
        detail: { line: "week_moment", message: (e instanceof Error ? e.message : String(e)).slice(0, 300) },
      });
    }

    return {
      blocks: [header(strings.header("recap")), section(recapLines(week, moment, members).join("\n"))],
      text: strings.recap.fallback(week.played, week.members),
    };
  },

  score() {
    return new Map();
  },

  reveal() {
    throw new TemplateError("El recap no se revela", "template_error");
  },

  closed() {
    return { blocks: [header(strings.header("recap"))], text: strings.header("recap") };
  },
};

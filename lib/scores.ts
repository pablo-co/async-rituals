import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnswerRow, MemberRow } from "@/lib/db/types";
import { DbError } from "@/lib/errors";
import { escapeSlackText } from "@/lib/slack/text";
import { strings } from "@/lib/slack/strings";

/**
 * Points and streaks live in SQL (supabase/migrations/0002_scores.sql); this file only reads them.
 *
 *   revealGame ──▶ streakMilestoneLine: member_streaks (before this game) + 1 for everyone who answered it
 *                  → "Ana y Luis: 5 seguidos" when someone lands exactly on 5, 10 or 25
 */
export const STREAK_MILESTONES: readonly number[] = [5, 10, 25];

/** Current streak per active member, as of the last revealed game. */
export async function memberStreaks(db: SupabaseClient, teamId: string): Promise<Map<string, number>> {
  const { data, error } = await db.rpc("member_streaks", { p_team_id: teamId });
  if (error) throw new DbError(error.message, error.code);
  return new Map(((data ?? []) as { member_id: string; streak: number }[]).map((r) => [r.member_id, Number(r.streak)]));
}

/**
 * Who reaches a milestone with the game being revealed. The game is still `revealing` (it becomes
 * `revealed` after the thread), so member_streaks does not count it yet: each person who answered adds 1.
 */
export function milestoneGroups(
  answers: readonly AnswerRow[],
  streaks: ReadonlyMap<string, number>,
  members: readonly MemberRow[],
): { names: string[]; count: number }[] {
  const byCount = new Map<number, string[]>();
  for (const answer of answers) {
    const member = members.find((m) => m.id === answer.member_id);
    if (!member || member.left_at || member.opted_out) continue;
    const reached = (streaks.get(member.id) ?? 0) + 1;
    if (!STREAK_MILESTONES.includes(reached)) continue;
    byCount.set(reached, [...(byCount.get(reached) ?? []), escapeSlackText(member.display_name)]);
  }
  return [...byCount.entries()]
    .sort(([a], [b]) => b - a)
    .map(([count, names]) => ({ count, names: [...names].sort((x, y) => x.localeCompare(y, "es")) }));
}

/** The single milestone line for the reveal thread, or null when nobody reached one. */
export async function streakMilestoneLine(
  db: SupabaseClient,
  teamId: string,
  answers: readonly AnswerRow[],
  members: readonly MemberRow[],
): Promise<string | null> {
  if (answers.length === 0) return null;
  const groups = milestoneGroups(answers, await memberStreaks(db, teamId), members);
  return groups.length === 0 ? null : strings.streakMilestones(groups);
}

import { TemplateError } from "@/lib/errors";
import type { TemplateContext } from "./template";

/**
 * Fresh material for the fact-based templates (plan CEO, "hecho fresco"): unused, not retired, from an active
 * member, and not reserved by a game of the same type still in the queue (a veto frees it by itself).
 * The spotlight is spread: members with the fewest reserved games go first, random among them.
 */
export interface FreshFact {
  id: string;
  member_id: string;
  payload: Record<string, unknown>;
}

export async function pickFreshFact(
  ctx: TemplateContext,
  kind: "fact" | "two_truths",
  gameType: "guess_who" | "two_truths",
): Promise<FreshFact | null> {
  const { db, team } = ctx;
  const { data: reservedRows, error: reservedError } = await db
    .from("games")
    .select("payload")
    .eq("team_id", team.id)
    .eq("type", gameType)
    .in("status", ["queued", "posting"]);
  if (reservedError) throw new TemplateError(reservedError.message, "template_error");
  const reserved = new Set((reservedRows ?? []).map((r) => (r.payload as { fact_id?: string }).fact_id).filter(Boolean));

  const { data: facts, error } = await db
    .from("facts")
    .select("id, member_id, payload, created_at, members!inner(team_id, left_at, opted_out)")
    .eq("kind", kind)
    .is("used_at", null)
    .eq("retired", false)
    .eq("members.team_id", team.id)
    .is("members.left_at", null)
    .eq("members.opted_out", false)
    .order("created_at");
  if (error) throw new TemplateError(error.message, "template_error");

  const candidates = ((facts ?? []) as FreshFact[]).filter((f) => !reserved.has(f.id));
  if (candidates.length === 0) return null;

  const reservedByMember = new Map<string, number>();
  for (const row of reservedRows ?? []) {
    const id = (row.payload as { featured_member_id?: string }).featured_member_id;
    if (id) reservedByMember.set(id, (reservedByMember.get(id) ?? 0) + 1);
  }
  const load = (f: FreshFact) => reservedByMember.get(f.member_id) ?? 0;
  const least = Math.min(...candidates.map(load));
  const pool = candidates.filter((c) => load(c) === least);
  return pool[Math.floor(Math.random() * pool.length)];
}

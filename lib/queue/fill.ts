import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeamRow } from "@/lib/db/types";
import { DbError } from "@/lib/errors";
import { logEvent } from "@/lib/events";
import { availableRotation, TEMPLATES } from "@/lib/games/registry";
import type { GeneratedGame, TemplateContext } from "@/lib/games/template";
import type { Run } from "@/lib/runs";
import { localParts, nextSlotDates, slotScheduledFor, type Cadence } from "@/lib/time";

/** Keep 8 future slots; the tick refills when fewer than 3 remain. */
export const QUEUE_TARGET = 8;
export const QUEUE_LOW = 3;

/** Candidate dates minus the ones that already have an active game, up to `needed`. */
export function pickSlotDates(candidates: string[], taken: Set<string>, needed: number): string[] {
  const out: string[] = [];
  for (const date of candidates) {
    if (out.length >= needed) break;
    if (!taken.has(date)) out.push(date);
  }
  return out;
}

export async function futureQueue(db: SupabaseClient, team: TeamRow, now: Date) {
  const today = localParts(now, team.timezone).date;
  const { data, error } = await db
    .from("games")
    .select("id, slot_date, type, status, is_sample")
    .eq("team_id", team.id)
    .gte("slot_date", today)
    .in("status", ["queued", "posting"]);
  if (error) throw new DbError(error.message, error.code);
  return (data ?? []) as { id: string; slot_date: string; type: string; status: string; is_sample: boolean }[];
}

/**
 * Generates the games missing to reach QUEUE_TARGET future slots (design doc "la cola").
 * Never today after 10:00 local, never weekends, never inside a pause. A template without
 * material is skipped for that slot; the next template in the rotation takes it.
 */
export async function fillTeam(
  db: SupabaseClient,
  team: TeamRow,
  now: Date,
  run?: Run,
): Promise<{ created: number; empty: number }> {
  if (!team.channel_id) return { created: 0, empty: 0 };

  const future = (await futureQueue(db, team, now)).filter((g) => g.type !== "recap");
  const needed = QUEUE_TARGET - future.length;
  if (needed <= 0) return { created: 0, empty: 0 };

  const candidates = nextSlotDates({
    from: now,
    tz: team.timezone,
    cadence: team.cadence_per_week as Cadence,
    count: QUEUE_TARGET + 10,
    pausedUntil: team.paused_until,
  });
  const dates = pickSlotDates(candidates, new Set(future.map((g) => g.slot_date)), needed);

  const { count, error: countError } = await db
    .from("games")
    .select("id", { count: "exact", head: true })
    .eq("team_id", team.id)
    .neq("type", "recap");
  if (countError) throw new DbError(countError.message, countError.code);

  let index = count ?? 0;
  let created = 0;
  let empty = 0;
  const ctx: TemplateContext = { db, team, now };

  for (const slotDate of dates) {
    let generated: GeneratedGame | null = null;
    for (const type of availableRotation(index)) {
      const template = TEMPLATES[type]!;
      try {
        generated = await template.generate(ctx, { slotDate });
      } catch (error) {
        await logEvent(db, {
          teamId: team.id,
          runId: run?.id,
          kind: "generation_failed",
          detail: { type, message: (error instanceof Error ? error.message : String(error)).slice(0, 300) },
        });
        generated = null;
      }
      if (generated) break;
    }
    index += 1;
    if (!generated) {
      empty += 1;
      continue;
    }
    const { error } = await db.from("games").insert({
      team_id: team.id,
      type: generated.type,
      payload: generated.payload,
      slot_date: slotDate,
      scheduled_for: slotScheduledFor(slotDate, team.timezone).toISOString(),
      content_hash: generated.contentHash,
      is_sample: generated.isSample ?? false,
    });
    if (error) {
      if (error.code === "23505") continue; // a concurrent fill took this slot: fine
      throw new DbError(error.message, error.code);
    }
    created += 1;
  }

  await logEvent(db, { teamId: team.id, runId: run?.id, kind: "fill_run", detail: { count: created, empty } });
  return { created, empty };
}

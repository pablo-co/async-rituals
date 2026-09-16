import type { SupabaseClient } from "@supabase/supabase-js";

export interface EventInput {
  teamId?: string | null;
  runId?: string | null;
  kind: string;
  gameId?: string | null;
  detail?: Record<string, unknown>;
}

/** Append-only log. Never put tokens or member names in `detail`. A failed log never breaks the caller. */
export async function logEvent(db: SupabaseClient, event: EventInput): Promise<void> {
  const { error } = await db.from("events").insert({
    team_id: event.teamId ?? null,
    run_id: event.runId ?? null,
    kind: event.kind,
    game_id: event.gameId ?? null,
    detail: event.detail ?? {},
  });
  if (error) console.error(`logEvent(${event.kind}) falló: ${error.message}`);
}

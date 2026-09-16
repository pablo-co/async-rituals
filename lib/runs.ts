import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { TeamRow } from "@/lib/db/types";
import { logEvent } from "@/lib/events";

/** One tick or fill run (E-1E): every event carries run_id; one team's error never stops the others. */
export interface Run {
  id: string;
  kind: "tick" | "fill";
  startedAt: Date;
  teams: number;
  errors: number;
  counts: Record<string, number>;
}

export function startRun(kind: Run["kind"], now: Date = new Date()): Run {
  return { id: randomUUID(), kind, startedAt: now, teams: 0, errors: 0, counts: {} };
}

export function count(run: Run, key: string, by = 1): void {
  run.counts[key] = (run.counts[key] ?? 0) + by;
}

export async function activeTeams(db: SupabaseClient): Promise<TeamRow[]> {
  const { data, error } = await db.from("teams").select("*").is("disconnected_at", null).order("created_at");
  if (error) throw new Error(`teams: ${error.message}`);
  return (data ?? []) as TeamRow[];
}

export async function forEachTeam(
  db: SupabaseClient,
  run: Run,
  fn: (team: TeamRow) => Promise<void>,
  teams?: TeamRow[],
): Promise<void> {
  const list = teams ?? (await activeTeams(db));
  for (const team of list) {
    run.teams += 1;
    try {
      await fn(team);
    } catch (error) {
      run.errors += 1;
      await logEvent(db, {
        teamId: team.id,
        runId: run.id,
        kind: "team_error",
        detail: {
          name: error instanceof Error ? error.name : "Error",
          message: (error instanceof Error ? error.message : String(error)).slice(0, 300),
        },
      });
    }
  }
}

export async function finishRun(db: SupabaseClient, run: Run): Promise<Run> {
  await logEvent(db, {
    runId: run.id,
    kind: `${run.kind}_run`,
    detail: { ...run.counts, teams: run.teams, errors: run.errors, ms: Date.now() - run.startedAt.getTime() },
  });
  return run;
}

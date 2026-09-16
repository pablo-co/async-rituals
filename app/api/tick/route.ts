import { authorizedCron } from "@/lib/cron";
import { logEvent } from "@/lib/events";
import { getSlackClient } from "@/lib/slack/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { runTick } from "@/lib/tick";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Hourly (24 crons in vercel.json). The state machine lives in lib/tick.ts. */
export async function GET(request: Request) {
  if (!authorizedCron(request)) return new Response("unauthorized", { status: 401 });
  const db = createAdminClient();
  try {
    const run = await runTick({ db, now: new Date(), slackFor: (team) => getSlackClient(db, team.id) });
    return Response.json({ ok: true, run_id: run.id, teams: run.teams, errors: run.errors, ...run.counts });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logEvent(db, { kind: "tick_failed", detail: { message: message.slice(0, 300) } });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

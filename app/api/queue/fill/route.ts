import { after } from "next/server";
import { authorizedCron } from "@/lib/cron";
import { findTeamByAdmin } from "@/lib/db/teams";
import { logEvent } from "@/lib/events";
import { fillTeam } from "@/lib/queue/fill";
import { activeTeams, finishRun, forEachTeam, startRun, count } from "@/lib/runs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Tops up the queue: every team with the cron secret, or the signed-in admin's team. */
export async function POST(request: Request) {
  const db = createAdminClient();
  const now = new Date();

  if (authorizedCron(request)) {
    const run = startRun("fill", now);
    await forEachTeam(db, run, async (team) => {
      const r = await fillTeam(db, team, now, run);
      count(run, "generated", r.created);
    }, await activeTeams(db));
    await finishRun(db, run);
    return Response.json({ ok: true, run_id: run.id, ...run.counts });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const team = await findTeamByAdmin(db, user.id);
  if (!team || !team.channel_id) return Response.json({ ok: false, error: "sin canal" }, { status: 400 });

  // The web never waits for the AI: 202 now, generation in the background, the queue page polls.
  after(async () => {
    try {
      await fillTeam(db, team, now);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await logEvent(db, { teamId: team.id, kind: "fill_failed", detail: { message: message.slice(0, 300) } });
    }
  });
  return Response.json({ ok: true, started: true }, { status: 202 });
}

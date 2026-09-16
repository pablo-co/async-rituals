"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/db/session";
import { logEvent } from "@/lib/events";
import { fillTeam } from "@/lib/queue/fill";
import { startRun, finishRun } from "@/lib/runs";
import { getSlackClient } from "@/lib/slack/client";
import { describeSlackError } from "@/lib/slack/errors";
import { syncMembers } from "@/lib/slack/members";
import { welcomeText } from "@/lib/slack/messages/welcome";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { postGame } from "@/lib/tick";
import { cadenceLabel, nextSlotDates, type Cadence } from "@/lib/time";
import type { GameRow, TeamRow } from "@/lib/db/types";

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const WEEKDAY_NAMES = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
function dayName(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return WEEKDAY_NAMES[wd === 0 ? 7 : wd];
}

/**
 * Canal y ritmo → Guardar (D-2B): join the channel, save, mirror members, greet the channel once
 * per channel (plan CEO 1), then generate the first week. Every failure says what to do next.
 */
export async function saveChannelAction(formData: FormData) {
  const { team } = await requireAdmin();
  if (!team || team.disconnected_at) redirect("/conectar?error=not_connected");

  const channelId = String(formData.get("channel_id") ?? "").trim();
  const cadence = Number(formData.get("cadence"));
  if (!channelId || !Number.isInteger(cadence) || cadence < 1 || cadence > 5) redirect("/conectar?error=form");

  const db = createAdminClient();
  const now = new Date();
  let outcome: "ok" | "join" | "sync" = "ok";
  let channelName: string | null = null;
  let warning: string | null = null;

  try {
    const slack = await getSlackClient(db, team.id);
    const joined = await slack.conversations.join({ channel: channelId });
    channelName = joined.channel?.name ?? null;

    const { error } = await db
      .from("teams")
      .update({ channel_id: channelId, channel_name: channelName, cadence_per_week: cadence, channel_error_at: null })
      .eq("id", team.id);
    if (error) throw new Error(error.message);

    const fresh: TeamRow = { ...team, channel_id: channelId, channel_name: channelName, cadence_per_week: cadence, channel_error_at: null };
    try {
      await syncMembers(db, slack, fresh, now);
    } catch (syncError) {
      await logEvent(db, { teamId: team.id, kind: "sync_failed", detail: describeSlackError(syncError) });
      outcome = "sync";
    }

    if (fresh.welcomed_channel_id !== channelId) {
      try {
        await slack.chat.postMessage({ channel: channelId, text: welcomeText(fresh) });
        await db.from("teams").update({ welcomed_channel_id: channelId }).eq("id", team.id);
        await logEvent(db, { teamId: team.id, kind: "welcome", detail: { cadence } });
        fresh.welcomed_channel_id = channelId;
      } catch (welcomeError) {
        await logEvent(db, { teamId: team.id, kind: "welcome_failed", detail: describeSlackError(welcomeError) });
        warning = "welcome";
      }
    }

    await fillTeam(db, fresh, now);
  } catch (error) {
    await logEvent(db, { teamId: team.id, kind: "save_channel_failed", detail: describeSlackError(error) });
    outcome = "join";
  }

  revalidatePath("/conectar");
  revalidatePath("/cola");
  revalidatePath("/actividad");

  if (outcome === "join") redirect("/conectar?error=join");
  const next = nextSlotDates({ from: now, tz: team.timezone, cadence: cadence as Cadence, count: 1, pausedUntil: team.paused_until })[0];
  const params = new URLSearchParams({ saved: "1", next: next ? dayName(next) : cadenceLabel(cadence as Cadence) });
  if (warning) params.set("warning", warning);
  if (outcome === "sync") params.set("warning", "sync");
  redirect(`/conectar?${params.toString()}`);
}

/** "Publicar el primero ahora": the first queued game gets scheduled_for = now and goes through the same post path as the tick. */
export async function publishFirstNowAction() {
  const { team } = await requireAdmin();
  if (!team || !team.channel_id || team.disconnected_at) redirect("/conectar?error=not_connected");

  const db = createAdminClient();
  const now = new Date();
  const { data: first } = await db
    .from("games")
    .select("*")
    .eq("team_id", team.id)
    .eq("status", "queued")
    .eq("is_sample", false)
    .neq("type", "recap")
    .order("scheduled_for")
    .limit(1)
    .maybeSingle();
  if (!first) redirect("/conectar?error=nothing_to_publish");

  await db.from("games").update({ scheduled_for: now.toISOString() }).eq("id", (first as GameRow).id);

  const run = startRun("tick", now);
  const { data: claimed, error } = await db.rpc("claim_due_games", { p_team_id: team.id, p_kind: "post", p_now: now.toISOString() });
  if (error) redirect(`/conectar?error=publish&detail=${encodeURIComponent(error.message)}`);

  let result: "posted" | "skipped" | "deferred" = "deferred";
  for (const game of (claimed ?? []) as GameRow[]) {
    result = await postGame({ db, now, slackFor: () => getSlackClient(db, team.id) }, run, team, game);
  }
  await finishRun(db, run);

  revalidatePath("/conectar");
  revalidatePath("/cola");
  revalidatePath("/actividad");
  if (result === "posted") redirect(`/conectar?published=1`);
  redirect(`/conectar?error=publish&detail=${result}`);
}

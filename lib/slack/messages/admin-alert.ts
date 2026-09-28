import type { WebClient } from "@slack/web-api";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logEvent } from "@/lib/events";
import { SKIP_REASON_LABELS } from "@/lib/events/labels";
import { formatLongDate } from "@/lib/format";
import { GAME_LABELS, type GameType, type SkipReason } from "@/lib/games/types";
import { describeSlackError } from "@/lib/slack/errors";
import { strings } from "@/lib/slack/strings";

/**
 * The private DM to the admin (plan CEO 5). Aggregates only: it never names a member.
 *
 *   capped (one per team every 7 days, teams.material_alert_sent_at; reset when a new fact arrives):
 *     no_material    fill put another game where Adivina quién / Dos verdades had nothing fresh   (a)
 *     featured_gone  tick skipped a game whose protagonist left or opted out                    (b)
 *     skipped        a template error or a Slack refusal skipped a game                          (d)
 *     generation     a fill created nothing because the AI failed                                (d)
 *   always (the admin has to act, and they cannot repeat on their own):
 *     channel        channel_error on its null → date transition                                 (c)
 *     uncertain      post_uncertain: the attempt is never repeated (E-1B)
 *
 * A failed DM is logged (admin_alert_failed) and never stops the tick or the fill.
 */
export type AdminAlert =
  | { kind: "no_material"; type: "guess_who" | "two_truths"; slotDate: string }
  | { kind: "featured_gone"; type: "guess_who" | "two_truths"; slotDate: string; remaining: number }
  | { kind: "skipped"; type: GameType; slotDate: string; reason: SkipReason }
  | { kind: "generation"; failures: number; queued: number }
  | { kind: "channel"; channel: string }
  | { kind: "uncertain"; slotDate: string };

const CAP_MS = 7 * 24 * 60 * 60 * 1000;

export function isCapped(alert: AdminAlert): boolean {
  return alert.kind !== "channel" && alert.kind !== "uncertain";
}

export function adminAlertText(alert: AdminAlert): string {
  const a = strings.admin;
  switch (alert.kind) {
    case "no_material": {
      const tt = alert.type === "two_truths";
      return a.noMaterial(GAME_LABELS[alert.type], formatLongDate(alert.slotDate), tt ? a.twoTruthsMaterial.none : a.factsMaterial.none, tt ? a.askTwoTruths : a.askFact);
    }
    case "featured_gone": {
      const tt = alert.type === "two_truths";
      const remaining = tt ? a.twoTruthsMaterial.left(alert.remaining) : a.factsMaterial.left(alert.remaining);
      return a.featuredGone(GAME_LABELS[alert.type], formatLongDate(alert.slotDate), remaining, tt ? a.askTwoTruths : a.askFact);
    }
    case "skipped":
      return a.skipped(GAME_LABELS[alert.type], formatLongDate(alert.slotDate), SKIP_REASON_LABELS[alert.reason]);
    case "generation":
      return a.generationFailed(alert.failures, alert.queued);
    case "channel":
      return a.channelError(alert.channel);
    case "uncertain":
      return a.postUncertain(formatLongDate(alert.slotDate));
  }
}

export async function sendAdminAlert(
  db: SupabaseClient,
  slack: WebClient,
  teamId: string,
  alert: AdminAlert,
  now: Date,
  runId?: string,
): Promise<"sent" | "capped" | "no_admin" | "failed"> {
  // Fresh read: an alert sent earlier in this same run already moved material_alert_sent_at (one per run).
  const { data: team } = await db.from("teams").select("admin_slack_user_id, material_alert_sent_at").eq("id", teamId).single();
  const row = team as { admin_slack_user_id: string | null; material_alert_sent_at: string | null } | null;
  if (!row?.admin_slack_user_id) return "no_admin";
  const capped = isCapped(alert);
  if (capped && row.material_alert_sent_at && now.getTime() - new Date(row.material_alert_sent_at).getTime() < CAP_MS) return "capped";

  try {
    await slack.chat.postMessage({ channel: row.admin_slack_user_id, text: adminAlertText(alert), unfurl_links: false });
  } catch (error) {
    await logEvent(db, { teamId, runId, kind: "admin_alert_failed", detail: { alert: alert.kind, ...describeSlackError(error) } });
    return "failed";
  }
  if (capped) await db.from("teams").update({ material_alert_sent_at: now.toISOString() }).eq("id", teamId);
  await logEvent(db, { teamId, runId, kind: "admin_alert", detail: { alert: alert.kind } });
  return "sent";
}

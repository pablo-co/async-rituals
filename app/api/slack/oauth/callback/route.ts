import { NextResponse } from "next/server";
import { findTeamByAdmin, findTeamBySlackId } from "@/lib/db/teams";
import type { TeamRow } from "@/lib/db/types";
import { logEvent } from "@/lib/events";
import { slackClientFor } from "@/lib/slack/client";
import { describeSlackError } from "@/lib/slack/errors";
import { syncMembers } from "@/lib/slack/members";
import { oauthRedirectUri, verifyState } from "@/lib/slack/oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Slack sends the admin back here. Order matters:
 * state (CSRF + account) → session matches → exchange code → refuse another account's workspace (E-1C)
 * → upsert team → token into Vault (E-1D) → on reconnection, rejoin channel and resync members (2A).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));

  const slackDenied = url.searchParams.get("error");
  if (slackDenied) return to(`/conectar?error=${encodeURIComponent(slackDenied)}`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const secret = process.env.SLACK_SIGNING_SECRET;
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const appUrl = process.env.APP_URL;
  if (!secret || !clientId || !clientSecret || !appUrl) return to("/conectar?error=not_configured");

  const stateUserId = state ? verifyState(state, secret) : null;
  if (!stateUserId || !code) return to("/conectar?error=state");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== stateUserId) return to("/login");

  const db = createAdminClient();

  let access;
  try {
    access = await slackClientFor("").oauth.v2.access({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: oauthRedirectUri(appUrl),
    });
  } catch (error) {
    await logEvent(db, { kind: "oauth_failed", detail: describeSlackError(error) });
    return to("/conectar?error=oauth");
  }

  const slackTeamId = access.team?.id;
  const token = access.access_token;
  if (!slackTeamId || !token) return to("/conectar?error=oauth");

  const existing = await findTeamBySlackId(db, slackTeamId);
  if (existing && existing.admin_user_id !== user.id) return to("/conectar?error=already_connected");

  const mine = await findTeamByAdmin(db, user.id);
  if (mine && mine.slack_team_id !== slackTeamId) return to("/conectar?error=already_has_team");

  const { data: teamRow, error } = await db
    .from("teams")
    .upsert(
      {
        slack_team_id: slackTeamId,
        slack_team_name: access.team?.name ?? null,
        bot_user_id: access.bot_user_id ?? null,
        admin_user_id: user.id,
        admin_slack_user_id: access.authed_user?.id ?? null,
        disconnected_at: null,
      },
      { onConflict: "slack_team_id" },
    )
    .select("*")
    .single();
  if (error || !teamRow) {
    await logEvent(db, { kind: "oauth_failed", detail: { message: error?.message ?? "upsert vacío" } });
    return to("/conectar?error=db");
  }
  const team = teamRow as TeamRow;

  const { error: tokenError } = await db.rpc("set_bot_token", { p_team_id: team.id, p_token: token });
  if (tokenError) {
    await logEvent(db, { teamId: team.id, kind: "oauth_failed", detail: { message: tokenError.message } });
    return to("/conectar?error=db");
  }

  if (existing) {
    if (team.channel_id) {
      try {
        const slack = slackClientFor(token);
        await slack.conversations.join({ channel: team.channel_id });
        await syncMembers(db, slack, team);
      } catch (resyncError) {
        await logEvent(db, { teamId: team.id, kind: "resync_failed", detail: describeSlackError(resyncError) });
      }
    }
    await logEvent(db, { teamId: team.id, kind: "reconnected" });
    return to("/conectar?reconnected=1");
  }

  await logEvent(db, { teamId: team.id, kind: "connected" });
  return to("/conectar?connected=1");
}

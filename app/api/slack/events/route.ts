import { after } from "next/server";
import { findTeamBySlackId } from "@/lib/db/teams";
import { logEvent } from "@/lib/events";
import { getSlackClient } from "@/lib/slack/client";
import { withSlackRequest } from "@/lib/slack/verify";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface SlackEvent {
  type: string;
  channel?: string;
  user?: string;
  bot_id?: string;
  subtype?: string;
}

/**
 * Event Subscriptions. url_verification is answered before the signature check (it carries
 * no secret and Slack sends it while the app is being created, before we have the secret).
 * Everything else: verified, acknowledged with 200, handled inside after().
 */
export const POST = withSlackRequest(
  async (req) => {
    if (req.kind !== "event") return;
    const body = req.event as { type?: string; team_id?: string; event?: SlackEvent };
    if (body.type !== "event_callback" || !body.team_id || !body.event) return;
    const slackTeamId = body.team_id;
    const event = body.event;

    after(async () => {
      const db = createAdminClient();
      const team = await findTeamBySlackId(db, slackTeamId);
      if (!team) return;
      const now = new Date().toISOString();

      switch (event.type) {
        case "app_uninstalled":
        case "tokens_revoked": {
          await db.from("teams").update({ disconnected_at: now }).eq("id", team.id);
          await logEvent(db, { teamId: team.id, kind: "disconnected", detail: { reason: event.type } });
          return;
        }
        case "member_joined_channel": {
          if (event.channel !== team.channel_id || !event.user || event.user === team.bot_user_id) return;
          if (event.bot_id || event.subtype) return;
          const slack = await getSlackClient(db, team.id);
          const info = await slack.users.info({ user: event.user });
          const u = info.user;
          if (!u || u.is_bot || u.deleted || u.is_app_user) return;
          await db.from("members").upsert(
            {
              team_id: team.id,
              slack_user_id: event.user,
              display_name: u.profile?.display_name || u.real_name || u.name || event.user,
              left_at: null,
            },
            { onConflict: "team_id,slack_user_id" },
          );
          await logEvent(db, { teamId: team.id, kind: "member_joined" });
          return;
        }
        case "member_left_channel": {
          if (event.channel !== team.channel_id || !event.user || event.user === team.bot_user_id) return;
          const { data: member } = await db
            .from("members")
            .select("id")
            .eq("team_id", team.id)
            .eq("slack_user_id", event.user)
            .maybeSingle();
          if (!member) return;
          await db.from("members").update({ left_at: now }).eq("id", member.id);
          await db.from("facts").update({ retired: true }).eq("member_id", member.id);
          await logEvent(db, { teamId: team.id, kind: "member_left" });
          return;
        }
        default:
          return;
      }
    });
  },
  {
    allowUnsigned: (body) => {
      try {
        const json = JSON.parse(body) as { type?: string; challenge?: string };
        if (json.type === "url_verification" && typeof json.challenge === "string") {
          return Response.json({ challenge: json.challenge });
        }
      } catch {
        // not JSON: fall through to the signed path
      }
      return null;
    },
  },
);

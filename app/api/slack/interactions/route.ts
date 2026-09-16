import { after } from "next/server";
import { handleAnswerSubmission } from "@/lib/answers";
import { findTeamBySlackId } from "@/lib/db/teams";
import { logEvent } from "@/lib/events";
import { strings } from "@/lib/slack/strings";
import { ephemeral, postToResponseUrl, withSlackRequest } from "@/lib/slack/verify";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface BlockAction {
  action_id?: string;
  value?: string;
  selected_option?: { value?: string };
}

/**
 * Interactivity. Buttons get an empty 200 right away (Slack ignores the body for block_actions);
 * the work runs inside after() and the person hears back through response_url.
 */
export const POST = withSlackRequest(async (req) => {
  if (req.kind !== "interaction") return;
  const p = req.payload as {
    type?: string;
    actions?: BlockAction[];
    user?: { id?: string; team_id?: string };
    team?: { id?: string };
    response_url?: string;
  };
  if (p.type !== "block_actions") return;

  const action = p.actions?.[0];
  const actionId = action?.action_id ?? "";
  const slackUserId = p.user?.id;
  const slackTeamId = p.team?.id ?? p.user?.team_id;
  const responseUrl = p.response_url;
  if (!action || !slackUserId || !responseUrl) return;

  if (actionId.startsWith("answer:")) {
    const gameId = actionId.slice("answer:".length);
    const choice = action.selected_option?.value ?? action.value;
    if (!choice) return;
    after(() => handleAnswerSubmission(createAdminClient(), { gameId, slackUserId, choice, responseUrl }));
    return;
  }

  if (actionId === "rejoin" && slackTeamId) {
    after(async () => {
      const db = createAdminClient();
      const team = await findTeamBySlackId(db, slackTeamId);
      if (!team) return postToResponseUrl(responseUrl, ephemeral(strings.notMember));
      await db.from("members").update({ opted_out: false }).eq("team_id", team.id).eq("slack_user_id", slackUserId);
      await logEvent(db, { teamId: team.id, kind: "member_rejoined" });
      await postToResponseUrl(responseUrl, ephemeral(strings.rejoined));
    });
  }
});

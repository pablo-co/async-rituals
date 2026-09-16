import { after } from "next/server";
import { handleAnswerSubmission } from "@/lib/answers";
import { findTeamBySlackId } from "@/lib/db/teams";
import { logEvent } from "@/lib/events";
import { handleViewSubmission, openPlayModal } from "@/lib/play";
import { getSlackClient } from "@/lib/slack/client";
import { strings } from "@/lib/slack/strings";
import { ephemeral, postToResponseUrl, withSlackRequest } from "@/lib/slack/verify";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface BlockAction {
  action_id?: string;
  value?: string;
  selected_option?: { value?: string };
}

interface InteractionPayload {
  type?: string;
  trigger_id?: string;
  actions?: BlockAction[];
  user?: { id?: string; team_id?: string };
  team?: { id?: string };
  response_url?: string;
  view?: { callback_id?: string; private_metadata?: string; state?: { values?: Record<string, unknown> } };
}

/**
 * Interactivity, three shapes:
 *   answer:{game_id}  → empty 200 now, handleAnswerSubmission inside after(), reply via response_url
 *   play:{game_id}    → views.open BEFORE the 200 (trigger_id lives 3 s), then empty 200
 *   view_submission   → submit_answer synchronously, JSON response_action; the ephemeral ack runs in after()
 */
export const POST = withSlackRequest(async (req) => {
  if (req.kind !== "interaction") return;
  const p = req.payload as InteractionPayload;
  const slackUserId = p.user?.id;
  if (!slackUserId) return;

  if (p.type === "view_submission") {
    const view = p.view;
    if (!view?.callback_id) return;
    const db = createAdminClient();
    const response = await handleViewSubmission(
      db,
      {
        callbackId: view.callback_id,
        slackUserId,
        privateMetadata: view.private_metadata ?? "",
        values: view.state?.values ?? {},
      },
      after,
      (teamId) => getSlackClient(db, teamId),
    );
    return response ? Response.json(response) : undefined;
  }

  if (p.type !== "block_actions") return;
  const action = p.actions?.[0];
  const actionId = action?.action_id ?? "";
  const slackTeamId = p.team?.id ?? p.user?.team_id;
  const responseUrl = p.response_url;
  if (!action || !responseUrl) return;

  if (actionId.startsWith("answer:")) {
    const gameId = actionId.slice("answer:".length);
    const choice = action.selected_option?.value ?? action.value;
    if (!choice) return;
    after(() => handleAnswerSubmission(createAdminClient(), { gameId, slackUserId, choice, responseUrl }));
    return;
  }

  if (actionId.startsWith("play:")) {
    const gameId = actionId.slice("play:".length);
    if (!p.trigger_id) return;
    const db = createAdminClient();
    await openPlayModal(db, (teamId) => getSlackClient(db, teamId), {
      gameId,
      slackUserId,
      triggerId: p.trigger_id,
      responseUrl,
    });
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

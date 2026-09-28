import { after } from "next/server";
import { handleAnswerSubmission } from "@/lib/answers";
import { handleEraseAction } from "@/lib/commands";
import { findTeamBySlackId } from "@/lib/db/teams";
import { answerGameId } from "@/lib/slack/blocks";
import { logEvent } from "@/lib/events";
import {
  ERASE_CANCEL,
  ERASE_CONFIRM,
  FACT_ACTION,
  handleProfileSubmission,
  ONBOARDING_ACTION,
  openFactModal,
  openOnboardingModal,
  parseMemberRef,
} from "@/lib/onboarding";
import { handleViewSubmission, openPlayModal } from "@/lib/play";
import { getSlackClient } from "@/lib/slack/client";
import { strings } from "@/lib/slack/strings";
import { ephemeral, postToResponseUrl, withSlackRequest } from "@/lib/slack/verify";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface BlockAction {
  action_id?: string;
  action_ts?: string;
  value?: string;
  selected_option?: { value?: string };
}

interface InteractionPayload {
  type?: string;
  trigger_id?: string;
  container?: { channel_id?: string; message_ts?: string };
  actions?: BlockAction[];
  user?: { id?: string; team_id?: string };
  team?: { id?: string };
  response_url?: string;
  view?: { callback_id?: string; private_metadata?: string; state?: { values?: Record<string, unknown> } };
}

/**
 * Interactivity. Every branch answers Slack at once and does the work in after():
 *   answer:{game_id}[:i]  → handleAnswerSubmission, reply via response_url
 *   play:{game_id}        → openPlayModal (views.open must land ≤ 3 s after the tap either way; answering
 *                           first spares the person Slack's warning icon when we are slow)
 *   onboarding_open       → openOnboardingModal (the DM's "Contestar"; value "{team_id}:{member_id}")
 *   fact_open             → openFactModal (retry button when /rituales hecho could not open in time)
 *   erase_confirm/cancel  → handleEraseAction (/rituales borrar-mis-datos)
 *   rejoin                → opt back in
 *   view_submission       → local checks only, `clear` at once; saves + the private confirmation run in after()
 */
export const POST = withSlackRequest(async (req) => {
  const receivedAt = Date.now();
  if (req.kind !== "interaction") return;
  const p = req.payload as InteractionPayload;
  const slackUserId = p.user?.id;
  if (!slackUserId) return;

  if (p.type === "view_submission") {
    const view = p.view;
    if (!view?.callback_id) return;
    const db = createAdminClient();
    const input = {
      callbackId: view.callback_id,
      slackUserId,
      privateMetadata: view.private_metadata ?? "",
      values: view.state?.values ?? {},
    };
    const slackFor = (teamId: string) => getSlackClient(db, teamId);
    const response = handleViewSubmission(db, input, after, slackFor) ?? handleProfileSubmission(db, input, after, slackFor);
    return response ? Response.json(response) : undefined;
  }

  if (p.type !== "block_actions") return;
  const action = p.actions?.[0];
  const actionId = action?.action_id ?? "";
  const slackTeamId = p.team?.id ?? p.user?.team_id;
  const responseUrl = p.response_url;
  if (!action || !responseUrl) return;

  if (actionId.startsWith("answer:")) {
    const gameId = answerGameId(actionId);
    const choice = action.selected_option?.value ?? action.value;
    if (!gameId || !choice) return;
    after(() => handleAnswerSubmission(createAdminClient(), { gameId, slackUserId, choice, responseUrl }));
    return;
  }

  if (actionId.startsWith("play:")) {
    const gameId = actionId.slice("play:".length);
    const triggerId = p.trigger_id;
    if (!triggerId) return;
    const tapped = Number(action.action_ts);
    const clickedAt = Number.isFinite(tapped) && tapped > 0 ? Math.round(tapped * 1000) : undefined;
    after(() => {
      const db = createAdminClient();
      return openPlayModal(db, (teamId) => getSlackClient(db, teamId), { gameId, slackUserId, triggerId, responseUrl, clickedAt, receivedAt });
    });
    return;
  }

  const tapped = Number(action.action_ts);
  const clickedAt = Number.isFinite(tapped) && tapped > 0 ? Math.round(tapped * 1000) : undefined;

  if (actionId === ONBOARDING_ACTION && p.trigger_id) {
    const triggerId = p.trigger_id;
    after(() => {
      const db = createAdminClient();
      return openOnboardingModal(db, (teamId) => getSlackClient(db, teamId), {
        value: action.value,
        slackUserId,
        triggerId,
        responseUrl,
        dmChannel: p.container?.channel_id ?? null,
        dmTs: p.container?.message_ts ?? null,
        clickedAt,
        receivedAt,
      });
    });
    return;
  }

  if (actionId === FACT_ACTION && p.trigger_id) {
    const ref = parseMemberRef(action.value);
    const triggerId = p.trigger_id;
    if (!ref) return;
    after(() => {
      const db = createAdminClient();
      return openFactModal(db, (teamId) => getSlackClient(db, teamId), { ref, slackUserId, triggerId, responseUrl, clickedAt, receivedAt });
    });
    return;
  }

  if ((actionId === ERASE_CONFIRM || actionId === ERASE_CANCEL) && slackTeamId) {
    after(() =>
      handleEraseAction(createAdminClient(), { confirmed: actionId === ERASE_CONFIRM, slackTeamId, slackUserId, responseUrl }),
    );
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

import type { WebClient } from "@slack/web-api";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnswerRow, GameRow, MemberRow } from "@/lib/db/types";
import { logEvent } from "@/lib/events";
import { actions, button, section } from "@/lib/slack/blocks";
import { describeSlackError } from "@/lib/slack/errors";
import { PUZZLE_CALLBACK, puzzleModal, readPuzzleSubmission } from "@/lib/slack/modals/puzzle";
import { readTriviaSubmission, TRIVIA_CALLBACK, triviaModal, type SubmissionRead } from "@/lib/slack/modals/trivia";
import { strings } from "@/lib/slack/strings";
import { ephemeral, postToResponseUrl } from "@/lib/slack/verify";

/**
 * Modal games (trivia, puzzle), both halves:
 *
 *   "Jugar" (block_actions) ──▶ openPlayModal: checks → views.open BEFORE the 200 (trigger_id lives 3 s)
 *   Enviar (view_submission) ──▶ handleViewSubmission: submit_answer BEFORE answering
 *                                  accepted=false → response_action: errors ("Este juego ya cerró.")
 *                                  accepted=true  → response_action: clear + chat.postEphemeral (scheduled)
 */
export interface ModalMetadata {
  game_id: string;
  channel_id: string | null;
}

export type ViewResponse =
  | { response_action: "errors"; errors: Record<string, string> }
  | { response_action: "clear" };

type SlackFor = (teamId: string) => Promise<WebClient>;

async function loadGameAndMember(db: SupabaseClient, gameId: string, slackUserId: string) {
  const { data: gameRow } = await db.from("games").select("*").eq("id", gameId).maybeSingle();
  const game = gameRow as GameRow | null;
  if (!game) return { game: null, member: null };
  const { data: memberRow } = await db
    .from("members")
    .select("*")
    .eq("team_id", game.team_id)
    .eq("slack_user_id", slackUserId)
    .maybeSingle();
  return { game, member: memberRow as MemberRow | null };
}

function viewFor(game: GameRow, existing: Record<string, unknown> | null) {
  if (game.type === "trivia") return triviaModal(game, existing);
  if (game.type === "puzzle") return puzzleModal(game, existing);
  return null;
}

export async function openPlayModal(
  db: SupabaseClient,
  slackFor: SlackFor,
  input: { gameId: string; slackUserId: string; triggerId: string; responseUrl: string },
): Promise<void> {
  const reply = (text: string, blocks?: unknown[]) => postToResponseUrl(input.responseUrl, ephemeral(text, blocks));
  const { game, member } = await loadGameAndMember(db, input.gameId, input.slackUserId);
  if (!game) return reply(strings.closed);
  if (!member || member.left_at) return reply(strings.notMember);
  if (member.opted_out) {
    return reply(strings.optedOut, [section(strings.optedOut), actions("rejoin", [button("rejoin", strings.rejoinButton, "rejoin")])]);
  }
  if (game.status !== "posted") return reply(strings.closed);

  const { data: existingRow } = await db
    .from("answers")
    .select("*")
    .eq("game_id", game.id)
    .eq("member_id", member.id)
    .maybeSingle();
  const existing = (existingRow as AnswerRow | null)?.value ?? null;
  const view = viewFor(game, existing);
  if (!view) return reply(strings.closed);

  try {
    const slack = await slackFor(game.team_id);
    await slack.views.open({ trigger_id: input.triggerId, view });
  } catch (error) {
    await logEvent(db, { teamId: game.team_id, kind: "modal_failed", gameId: game.id, detail: describeSlackError(error) });
    await reply(strings.modalFailed);
  }
}

function errorOn(block: string, message: string): ViewResponse {
  return { response_action: "errors", errors: { [block]: message } };
}

export async function handleViewSubmission(
  db: SupabaseClient,
  input: { callbackId: string; slackUserId: string; privateMetadata: string; values: Record<string, unknown> },
  schedule: (task: () => Promise<void>) => void,
  slackFor: SlackFor,
): Promise<ViewResponse | null> {
  if (input.callbackId !== TRIVIA_CALLBACK && input.callbackId !== PUZZLE_CALLBACK) return null;
  const firstBlock = input.callbackId === TRIVIA_CALLBACK ? "q0" : "answer";

  let meta: ModalMetadata;
  try {
    meta = JSON.parse(input.privateMetadata) as ModalMetadata;
  } catch {
    return errorOn(firstBlock, strings.closed);
  }
  if (!meta?.game_id) return errorOn(firstBlock, strings.closed);

  const { game, member } = await loadGameAndMember(db, meta.game_id, input.slackUserId);
  if (!game) return errorOn(firstBlock, strings.closed);
  if (!member || member.left_at || member.opted_out) return errorOn(firstBlock, strings.notMember);

  const read: SubmissionRead =
    input.callbackId === TRIVIA_CALLBACK ? readTriviaSubmission(game, input.values) : readPuzzleSubmission(input.values);
  if ("errors" in read) return { response_action: "errors", errors: read.errors };

  const { data: accepted, error } = await db.rpc("submit_answer", {
    p_game_id: game.id,
    p_member_id: member.id,
    p_value: read.value,
  });
  if (error) {
    await logEvent(db, { teamId: game.team_id, kind: "answer_failed", gameId: game.id, detail: { message: error.message } });
    return errorOn(firstBlock, strings.saveFailed);
  }
  if (!accepted) return errorOn(firstBlock, strings.closed);

  const channel = meta.channel_id ?? game.slack_channel_id;
  if (channel) {
    schedule(async () => {
      const slack = await slackFor(game.team_id);
      await slack.chat.postEphemeral({ channel, user: input.slackUserId, text: read.ack });
    });
  }
  return { response_action: "clear" };
}

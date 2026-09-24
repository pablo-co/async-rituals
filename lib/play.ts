import type { WebClient } from "@slack/web-api";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GameRow, MemberRow } from "@/lib/db/types";
import { logEvent } from "@/lib/events";
import { triviaPayload } from "@/lib/games/trivia";
import { actions, button, section } from "@/lib/slack/blocks";
import { describeSlackError } from "@/lib/slack/errors";
import { PUZZLE_CALLBACK, puzzleModal, readPuzzleSubmission } from "@/lib/slack/modals/puzzle";
import { readTriviaSubmission, TRIVIA_CALLBACK, triviaModal, type SubmissionRead } from "@/lib/slack/modals/trivia";
import { strings } from "@/lib/slack/strings";
import { ephemeral, postToResponseUrl } from "@/lib/slack/verify";

/**
 * Modal games (trivia, puzzle). Slack gives us 3 seconds for both halves, and a cold start alone
 * can take 2.5 s (measured 2026-09-24), so the synchronous part does as little as possible:
 *
 *   "Jugar" (block_actions) ──▶ openPlayModal: game (1 round trip) → member + previous answer + token
 *                                (1 parallel round trip) → views.open BEFORE the 200 (trigger_id lives 3 s)
 *   Enviar (view_submission) ──▶ handleViewSubmission: only local checks → `clear` right away
 *                                 └─ after(): saveModalAnswer → submit_answer → private message with the truth:
 *                                    "Guardado: …" only when it saved; otherwise "ya cerró" / "no estás" / "no pude guardar"
 */
export interface ModalMetadata {
  game_id: string;
  channel_id: string | null;
}

export type ViewResponse =
  | { response_action: "errors"; errors: Record<string, string> }
  | { response_action: "clear" };

type SlackFor = (teamId: string) => Promise<WebClient>;

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

  const { data: gameRow } = await db.from("games").select("*").eq("id", input.gameId).maybeSingle();
  const game = gameRow as GameRow | null;
  if (!game || game.status !== "posted") return reply(strings.closed);

  // Everything else in one parallel round trip: who is asking, what they answered before, the bot token.
  const [memberRes, answerRes, slackRes] = await Promise.all([
    db.from("members").select("*").eq("team_id", game.team_id).eq("slack_user_id", input.slackUserId).maybeSingle(),
    db
      .from("answers")
      .select("value, members!inner(slack_user_id, team_id)")
      .eq("game_id", game.id)
      .eq("members.slack_user_id", input.slackUserId)
      .maybeSingle(),
    slackFor(game.team_id).then(
      (client) => ({ client, error: null as unknown }),
      (error: unknown) => ({ client: null, error }),
    ),
  ]);

  const member = memberRes.data as MemberRow | null;
  if (!member || member.left_at) return reply(strings.notMember);
  if (member.opted_out) {
    return reply(strings.optedOut, [section(strings.optedOut), actions("rejoin", [button("rejoin", strings.rejoinButton, "rejoin")])]);
  }

  const existing = ((answerRes.data as { value?: Record<string, unknown> } | null)?.value ?? null) as Record<string, unknown> | null;
  const view = viewFor(game, existing);
  if (!view) return reply(strings.closed);

  try {
    if (!slackRes.client) throw slackRes.error;
    await slackRes.client.views.open({ trigger_id: input.triggerId, view });
  } catch (error) {
    await logEvent(db, { teamId: game.team_id, kind: "modal_failed", gameId: game.id, detail: describeSlackError(error) });
    await reply(strings.modalFailed);
  }
}

function errorOn(block: string, message: string): ViewResponse {
  return { response_action: "errors", errors: { [block]: message } };
}

/**
 * Synchronous half of Enviar: parse and validate what Slack sent (no database, no Slack calls),
 * answer `clear` at once and schedule the save. Returns null for callbacks that are not games.
 */
export function handleViewSubmission(
  db: SupabaseClient,
  input: { callbackId: string; slackUserId: string; privateMetadata: string; values: Record<string, unknown> },
  schedule: (task: () => Promise<void>) => void,
  slackFor: SlackFor,
): ViewResponse | null {
  if (input.callbackId !== TRIVIA_CALLBACK && input.callbackId !== PUZZLE_CALLBACK) return null;
  const firstBlock = input.callbackId === TRIVIA_CALLBACK ? "q0" : "answer";

  let meta: ModalMetadata;
  try {
    meta = JSON.parse(input.privateMetadata) as ModalMetadata;
  } catch {
    return errorOn(firstBlock, strings.closed);
  }
  if (!meta?.game_id) return errorOn(firstBlock, strings.closed);

  const read: SubmissionRead =
    input.callbackId === TRIVIA_CALLBACK ? readTriviaSubmission(input.values) : readPuzzleSubmission(input.values);
  if ("errors" in read) return { response_action: "errors", errors: read.errors };

  schedule(() =>
    saveModalAnswer(db, slackFor, {
      gameId: meta.game_id,
      channelId: meta.channel_id,
      slackUserId: input.slackUserId,
      value: read.value,
      ack: read.ack,
    }),
  );
  return { response_action: "clear" };
}

/** Asynchronous half of Enviar: submit_answer first, then one private message that says what really happened. */
export async function saveModalAnswer(
  db: SupabaseClient,
  slackFor: SlackFor,
  input: { gameId: string; channelId: string | null; slackUserId: string; value: Record<string, unknown>; ack: string },
): Promise<void> {
  const { data: gameRow } = await db.from("games").select("*").eq("id", input.gameId).maybeSingle();
  const game = gameRow as GameRow | null;
  if (!game) return; // nowhere to answer: the game no longer exists

  const { data: memberRow } = await db
    .from("members")
    .select("*")
    .eq("team_id", game.team_id)
    .eq("slack_user_id", input.slackUserId)
    .maybeSingle();
  const member = memberRow as MemberRow | null;

  let text: string;
  if (!member || member.left_at) {
    text = strings.notMember;
  } else if (member.opted_out) {
    text = strings.optedOut;
  } else if (game.type === "trivia" && ((input.value.choices as unknown[]) ?? []).length !== triviaPayload(game).questions.length) {
    await logEvent(db, { teamId: game.team_id, kind: "answer_failed", gameId: game.id, detail: { message: "choices_mismatch" } });
    text = strings.saveFailed;
  } else {
    const { data: accepted, error } = await db.rpc("submit_answer", {
      p_game_id: game.id,
      p_member_id: member.id,
      p_value: input.value,
    });
    if (error) {
      await logEvent(db, { teamId: game.team_id, kind: "answer_failed", gameId: game.id, detail: { message: error.message } });
      text = strings.saveFailed;
    } else {
      text = accepted ? input.ack : strings.closed;
    }
  }

  const channel = input.channelId ?? game.slack_channel_id;
  if (!channel) return;
  try {
    const slack = await slackFor(game.team_id);
    await slack.chat.postEphemeral({ channel, user: input.slackUserId, text });
  } catch (error) {
    await logEvent(db, { teamId: game.team_id, kind: "ack_failed", gameId: game.id, detail: describeSlackError(error) });
  }
}

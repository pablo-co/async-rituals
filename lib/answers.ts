import type { SupabaseClient } from "@supabase/supabase-js";
import type { GameRow, MemberRow } from "@/lib/db/types";
import { logEvent } from "@/lib/events";
import { actions, button, section } from "@/lib/slack/blocks";
import { strings } from "@/lib/slack/strings";
import { ephemeral, postToResponseUrl } from "@/lib/slack/verify";

/**
 * One handler for every answer button (4A): submit_answer runs before we answer the person,
 * so "Guardado" is never a lie. Slack already got its empty 200; this runs inside after().
 */
export async function handleAnswerSubmission(
  db: SupabaseClient,
  input: { gameId: string; slackUserId: string; choice: string; responseUrl: string },
): Promise<void> {
  const reply = (text: string, blocks?: unknown[]) => postToResponseUrl(input.responseUrl, ephemeral(text, blocks));

  const { data: gameRow } = await db.from("games").select("*").eq("id", input.gameId).maybeSingle();
  const game = gameRow as GameRow | null;
  if (!game) return reply(strings.closed);

  const { data: memberRow } = await db
    .from("members")
    .select("*")
    .eq("team_id", game.team_id)
    .eq("slack_user_id", input.slackUserId)
    .maybeSingle();
  const member = memberRow as MemberRow | null;
  if (!member || member.left_at) return reply(strings.notMember);
  if (member.opted_out) {
    return reply(strings.optedOut, [
      section(strings.optedOut),
      actions("rejoin", [button("rejoin", strings.rejoinButton, "rejoin")]),
    ]);
  }
  const featuredId = (game.payload as { featured_member_id?: string }).featured_member_id;
  if (featuredId && featuredId === member.id) return reply(strings.featured);
  if (game.status !== "posted") return reply(strings.closed);

  const { data: existing } = await db
    .from("answers")
    .select("id")
    .eq("game_id", game.id)
    .eq("member_id", member.id)
    .maybeSingle();

  const { data: accepted, error } = await db.rpc("submit_answer", {
    p_game_id: game.id,
    p_member_id: member.id,
    p_value: { choice: input.choice },
  });
  if (error) {
    await logEvent(db, { teamId: game.team_id, kind: "answer_failed", gameId: game.id, detail: { message: error.message } });
    return reply("No pude guardar tu respuesta. Inténtalo de nuevo.");
  }
  if (!accepted) return reply(strings.closed);

  const label = await choiceLabel(db, game, input.choice);
  return reply(existing ? strings.ackChanged(label) : strings.ackSaved(label));
}

/** What the person picked, in words. For guess-who the choice is a member id. */
async function choiceLabel(db: SupabaseClient, game: GameRow, choice: string): Promise<string> {
  if (game.type === "guess_who" || game.type === "two_truths") {
    const { data } = await db.from("members").select("display_name").eq("id", choice).maybeSingle();
    if (data?.display_name) return data.display_name as string;
  }
  return choice;
}

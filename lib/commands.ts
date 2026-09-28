import type { WebClient } from "@slack/web-api";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findTeamBySlackId } from "@/lib/db/teams";
import type { MemberRow } from "@/lib/db/types";
import { logEvent } from "@/lib/events";
import { ERASE_CANCEL, ERASE_CONFIRM, eraseMemberData, openFactModal } from "@/lib/onboarding";
import { actions, button, section } from "@/lib/slack/blocks";
import { strings } from "@/lib/slack/strings";
import { ephemeral, postToResponseUrl, type SlashCommand } from "@/lib/slack/verify";

/**
 * `/rituales <sub>`. The route answers Slack with an empty 200 at once (a cold start plus two database reads can
 * pass Slack's 3 s, and a slow command shows the person "operation_timeout"); this runs in after() and replies
 * through response_url.
 *
 *   salir             opt-out + "Volver a entrar"
 *   hecho             modal "Un hecho nuevo" (openFactModal; if the trigger expired, a button to retry)
 *   borrar-mis-datos  warning + "Sí, borrar" (danger) / "Cancelar"; nothing is deleted until the button
 *   stats             hito 7
 *   anything else     the list of commands
 */
type SlackFor = (teamId: string) => Promise<WebClient>;

export async function handleCommand(
  db: SupabaseClient,
  slackFor: SlackFor,
  command: SlashCommand,
  timing: { receivedAt?: number } = {},
): Promise<void> {
  const reply = (text: string, blocks?: unknown[]) => postToResponseUrl(command.response_url, ephemeral(text, blocks));
  const sub = (command.text ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";

  const team = await findTeamBySlackId(db, command.team_id);
  if (!team) return reply(strings.notMember);
  const { data } = await db.from("members").select("*").eq("team_id", team.id).eq("slack_user_id", command.user_id).maybeSingle();
  const member = data as MemberRow | null;

  if (sub === "borrar-mis-datos") {
    if (!member) return reply(strings.notMember);
    return reply(strings.erase.confirm, [
      section(strings.erase.confirm),
      actions("erase", [
        button(ERASE_CONFIRM, strings.erase.yes, "erase", "danger"),
        button(ERASE_CANCEL, strings.erase.cancel, "cancel"),
      ]),
    ]);
  }

  if (!member || member.left_at) return reply(strings.notMember);

  if (sub === "salir") {
    await db.from("members").update({ opted_out: true }).eq("id", member.id);
    await logEvent(db, { teamId: team.id, kind: "member_opted_out" });
    return reply(strings.left, [section(strings.left), actions("rejoin", [button("rejoin", strings.rejoinButton, "rejoin")])]);
  }

  if (sub === "hecho") {
    return openFactModal(db, slackFor, {
      ref: { teamId: team.id, memberId: member.id },
      slackUserId: command.user_id,
      triggerId: command.trigger_id,
      responseUrl: command.response_url,
      receivedAt: timing.receivedAt,
    });
  }

  if (sub === "stats") return reply(strings.commandSoon);
  return reply(strings.help);
}

/** "Sí, borrar" / "Cancelar" under the borrar-mis-datos warning. */
export async function handleEraseAction(
  db: SupabaseClient,
  input: { confirmed: boolean; slackTeamId: string; slackUserId: string; responseUrl: string },
): Promise<void> {
  if (!input.confirmed) {
    await postToResponseUrl(input.responseUrl, { delete_original: true });
    return;
  }
  const team = await findTeamBySlackId(db, input.slackTeamId);
  try {
    if (!team) throw new Error("team not found");
    await eraseMemberData(db, { teamId: team.id, slackUserId: input.slackUserId });
    await postToResponseUrl(input.responseUrl, { replace_original: true, text: strings.erase.done });
  } catch (error) {
    if (team) {
      await logEvent(db, {
        teamId: team.id,
        kind: "erase_failed",
        detail: { message: (error instanceof Error ? error.message : String(error)).slice(0, 300) },
      });
    }
    await postToResponseUrl(input.responseUrl, { replace_original: true, text: strings.erase.failed });
  }
}

import { findTeamBySlackId } from "@/lib/db/teams";
import type { MemberRow } from "@/lib/db/types";
import { logEvent } from "@/lib/events";
import { actions, button, section } from "@/lib/slack/blocks";
import { strings } from "@/lib/slack/strings";
import { ephemeral, withSlackRequest } from "@/lib/slack/verify";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** `/rituales <subcomando>`. Hito 1: `salir`; everything else answers "pronto" (never a dead command). */
export const POST = withSlackRequest(async (req) => {
  if (req.kind !== "command") return;
  const { text, team_id, user_id } = req.command;
  const sub = (text ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";

  const db = createAdminClient();
  const team = await findTeamBySlackId(db, team_id);
  if (!team) return Response.json(ephemeral(strings.notMember));

  const { data } = await db
    .from("members")
    .select("*")
    .eq("team_id", team.id)
    .eq("slack_user_id", user_id)
    .maybeSingle();
  const member = data as MemberRow | null;
  if (!member || member.left_at) return Response.json(ephemeral(strings.notMember));

  if (sub === "salir") {
    await db.from("members").update({ opted_out: true }).eq("id", member.id);
    await logEvent(db, { teamId: team.id, kind: "member_opted_out" });
    return Response.json(
      ephemeral(strings.left, [section(strings.left), actions("rejoin", [button("rejoin", strings.rejoinButton, "rejoin")])]),
    );
  }

  return Response.json(ephemeral(strings.commandSoon));
});

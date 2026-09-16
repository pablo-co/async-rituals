import type { WebClient } from "@slack/web-api";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeamRow } from "@/lib/db/types";
import { DbError } from "@/lib/errors";

export interface ChannelOption {
  id: string;
  name: string;
}

/** Public channels the bot could post in (Conectar's select). */
export async function listPublicChannels(slack: WebClient): Promise<ChannelOption[]> {
  const out: ChannelOption[] = [];
  let cursor: string | undefined;
  do {
    const res = await slack.conversations.list({
      types: "public_channel",
      exclude_archived: true,
      limit: 200,
      cursor,
    });
    for (const c of res.channels ?? []) if (c.id && c.name) out.push({ id: c.id, name: c.name });
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Mirrors the channel into `members`: humans in → upsert (left_at cleared), humans out → left_at + facts retired.
 * Bots, deactivated accounts and Slackbot never get a row. Idempotent.
 */
export async function syncMembers(
  db: SupabaseClient,
  slack: WebClient,
  team: TeamRow,
  now: Date = new Date(),
): Promise<{ active: number; left: number }> {
  if (!team.channel_id) return { active: 0, left: 0 };

  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const res = await slack.conversations.members({ channel: team.channel_id, limit: 200, cursor });
    ids.push(...(res.members ?? []));
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);

  const people: { slack_user_id: string; display_name: string }[] = [];
  for (const id of ids) {
    if (id === team.bot_user_id || id === "USLACKBOT") continue;
    const info = await slack.users.info({ user: id });
    const u = info.user;
    if (!u || u.is_bot || u.deleted || u.is_app_user) continue;
    people.push({
      slack_user_id: id,
      display_name: u.profile?.display_name || u.real_name || u.name || id,
    });
  }

  for (const p of people) {
    const { error } = await db
      .from("members")
      .upsert(
        { team_id: team.id, slack_user_id: p.slack_user_id, display_name: p.display_name, left_at: null },
        { onConflict: "team_id,slack_user_id" },
      );
    if (error) throw new DbError(error.message, error.code);
  }

  const { data: existing, error } = await db
    .from("members")
    .select("id, slack_user_id")
    .eq("team_id", team.id)
    .is("left_at", null);
  if (error) throw new DbError(error.message, error.code);
  const present = new Set(people.map((p) => p.slack_user_id));
  const gone = (existing ?? []).filter((m) => !present.has(m.slack_user_id as string));
  for (const m of gone) {
    await db.from("members").update({ left_at: now.toISOString() }).eq("id", m.id);
    await db.from("facts").update({ retired: true }).eq("member_id", m.id);
  }
  return { active: people.length, left: gone.length };
}

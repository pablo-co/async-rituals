import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeamRow } from "./types";

export async function findTeamBySlackId(db: SupabaseClient, slackTeamId: string): Promise<TeamRow | null> {
  const { data } = await db.from("teams").select("*").eq("slack_team_id", slackTeamId).maybeSingle();
  return (data as TeamRow | null) ?? null;
}

export async function findTeamById(db: SupabaseClient, id: string): Promise<TeamRow | null> {
  const { data } = await db.from("teams").select("*").eq("id", id).maybeSingle();
  return (data as TeamRow | null) ?? null;
}

export async function findTeamByAdmin(db: SupabaseClient, adminUserId: string): Promise<TeamRow | null> {
  const { data } = await db.from("teams").select("*").eq("admin_user_id", adminUserId).maybeSingle();
  return (data as TeamRow | null) ?? null;
}

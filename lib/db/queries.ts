import type { SupabaseClient } from "@supabase/supabase-js";
import { DbError } from "@/lib/errors";
import type { AdminActivity, GameAdmin, TeamAdmin } from "./types";

/** The signed-in admin's team, or null before Slack is connected. Reads the RLS-filtered view. */
export async function getAdminTeam(supabase: SupabaseClient): Promise<TeamAdmin | null> {
  const { data, error } = await supabase.from("teams_admin").select("*").maybeSingle();
  if (error) throw new DbError(error.message, error.code);
  return (data as TeamAdmin | null) ?? null;
}

/** Upcoming slots (queued, posting, vetoed) from a date on. Never exposes payload beyond `preview`. */
export async function getQueue(
  supabase: SupabaseClient,
  teamId: string,
  fromDate: string,
): Promise<GameAdmin[]> {
  const { data, error } = await supabase
    .from("games_admin")
    .select("*")
    .eq("team_id", teamId)
    .gte("slot_date", fromDate)
    .in("status", ["queued", "posting", "vetoed"])
    .order("scheduled_for", { ascending: true });
  if (error) throw new DbError(error.message, error.code);
  return (data as GameAdmin[]) ?? [];
}

export async function getActivity(supabase: SupabaseClient, teamId: string): Promise<AdminActivity> {
  const { data, error } = await supabase.rpc("admin_activity", { p_team_id: teamId });
  if (error) throw new DbError(error.message, error.code);
  if (!data) throw new DbError("admin_activity devolvió vacío");
  return data as AdminActivity;
}

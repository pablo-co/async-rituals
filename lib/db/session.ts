import "server-only";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { findTeamByAdmin } from "./teams";
import type { TeamRow } from "./types";

/** Signed-in admin and their team row (service role, after checking the session). Redirects to /login otherwise. */
export async function requireAdmin(): Promise<{ user: User; team: TeamRow | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const team = await findTeamByAdmin(createAdminClient(), user.id);
  return { user, team };
}

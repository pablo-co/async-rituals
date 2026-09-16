import { redirect } from "next/navigation";
import { getAdminTeam } from "@/lib/db/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Landing after login: no team yet → Conectar; team with a channel → Cola. */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const team = await getAdminTeam(supabase);
  redirect(team?.channel_id ? "/cola" : "/conectar");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { requireAdmin } from "@/lib/db/session";
import { logEvent } from "@/lib/events";
import { fillTeam, futureQueue } from "@/lib/queue/fill";
import { nextWeekTarget, QUEUE_MAX, vetoGame } from "@/lib/queue/manage";
import { createAdminClient } from "@/lib/supabase/admin";

/** "Sí, vetar" in the sheet (D-2C). Only the admin's own team, only while the game is still queued. */
export async function vetoGameAction(formData: FormData) {
  const { team } = await requireAdmin();
  if (!team) redirect("/conectar?error=not_connected");
  const gameId = String(formData.get("game_id") ?? "");
  if (!gameId) redirect("/cola?error=veto");

  const db = createAdminClient();
  const type = await vetoGame(db, team.id, gameId);
  if (!type) redirect("/cola?error=veto");
  await logEvent(db, { teamId: team.id, kind: "vetoed", gameId, detail: { type } });

  revalidatePath("/cola");
  redirect("/cola?toast=vetoed");
}

/** "Generar otra semana": one more week of the cadence (max 10 future games) in the background; Cola polls. */
export async function generateWeekAction() {
  const { team } = await requireAdmin();
  if (!team || !team.channel_id || team.disconnected_at) redirect("/conectar?error=not_connected");

  const db = createAdminClient();
  const now = new Date();
  const future = (await futureQueue(db, team, now)).filter((g) => g.type !== "recap" && !g.is_sample).length;
  if (future >= QUEUE_MAX) redirect("/cola?error=full");
  const target = nextWeekTarget(future, team.cadence_per_week);

  after(async () => {
    try {
      await fillTeam(db, team, new Date(), undefined, { target });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await logEvent(db, { teamId: team.id, kind: "fill_failed", detail: { message: message.slice(0, 300) } });
    }
  });

  revalidatePath("/cola");
  redirect(`/cola?generating=1&want=${target}`);
}

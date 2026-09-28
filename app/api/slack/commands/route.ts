import { after } from "next/server";
import { handleCommand } from "@/lib/commands";
import { getSlackClient } from "@/lib/slack/client";
import { withSlackRequest } from "@/lib/slack/verify";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** `/rituales <sub>`: empty 200 right away, the work (and the reply, via response_url) in after(). See lib/commands.ts. */
export const POST = withSlackRequest(async (req) => {
  const receivedAt = Date.now();
  if (req.kind !== "command") return;
  const command = req.command;
  after(() => {
    const db = createAdminClient();
    return handleCommand(db, (teamId) => getSlackClient(db, teamId), command, { receivedAt });
  });
});

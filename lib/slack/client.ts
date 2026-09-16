import "server-only";
import { WebClient } from "@slack/web-api";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SlackError } from "@/lib/errors";

/** Short retry budget: these calls run inside serverless functions, not a long-lived worker. */
const RETRY = { retries: 2, factor: 2, minTimeout: 400, maxTimeout: 2000, randomize: true };

/** Builds a WebClient from a raw token (OAuth exchange, tests). */
export function slackClientFor(token: string): WebClient {
  return new WebClient(token, { retryConfig: RETRY, timeout: 8000 });
}

/** WebClient for a team. The token comes from Vault through get_bot_token() and is never logged. */
export async function getSlackClient(db: SupabaseClient, teamId: string): Promise<WebClient> {
  const { data, error } = await db.rpc("get_bot_token", { p_team_id: teamId });
  if (error) throw new SlackError(`get_bot_token: ${error.message}`, "no_bot_token");
  if (!data || typeof data !== "string") throw new SlackError("El equipo no tiene token de bot", "no_bot_token");
  return slackClientFor(data);
}

import { ErrorCode } from "@slack/web-api";
import { SlackError } from "@/lib/errors";

export { SlackError };

/**
 * What the rest of the code cares about (plan CEO 2A):
 *   disconnected · channel · transient (may or may not have landed; never re-post)
 *   rejected: Slack answered ok:false for our request (invalid_blocks, msg_too_long…): it certainly did not post
 *   other: not a Slack error at all (our own bug)
 */
export type SlackFailure = "disconnected" | "channel" | "transient" | "rejected" | "other";

const DISCONNECTED = new Set([
  "invalid_auth",
  "account_inactive",
  "token_revoked",
  "token_expired",
  "not_authed",
]);
const CHANNEL = new Set([
  "channel_not_found",
  "not_in_channel",
  "is_archived",
  "channel_is_archived",
]);
const TRANSIENT = new Set(["ratelimited", "internal_error", "service_unavailable", "fatal_error"]);

/** The Slack error code behind a thrown value, or null when it is not a Slack error. */
export function slackErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const e = error as { code?: string; data?: { error?: string } };
  if (e.code === ErrorCode.PlatformError) return e.data?.error ?? "platform_error";
  if (e.code === ErrorCode.RateLimitedError) return "ratelimited";
  if (e.code === ErrorCode.RequestError || e.code === ErrorCode.HTTPError) return "http";
  return null;
}

export function mapSlackError(error: unknown): SlackFailure {
  const code = slackErrorCode(error);
  if (!code) return "other";
  if (DISCONNECTED.has(code)) return "disconnected";
  if (CHANNEL.has(code)) return "channel";
  if (TRANSIENT.has(code) || code === "http") return "transient";
  if ((error as { code?: string }).code === ErrorCode.PlatformError) return "rejected";
  return "other";
}

/** Code + message for the events log, plus Slack's own validation messages (they say which field is wrong). */
export function describeSlackError(error: unknown): { code: string; message: string } {
  const code = slackErrorCode(error) ?? "unknown";
  const base = error instanceof Error ? error.message : String(error);
  const details = (error as { data?: { response_metadata?: { messages?: unknown } } } | null)?.data?.response_metadata?.messages;
  const extra = Array.isArray(details) && details.length > 0 ? ` · ${details.slice(0, 2).join(" · ")}` : "";
  return { code, message: `${base}${extra}`.slice(0, 300) };
}

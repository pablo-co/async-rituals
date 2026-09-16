import { ErrorCode } from "@slack/web-api";
import { SlackError } from "@/lib/errors";

export { SlackError };

/** Three outcomes the rest of the code cares about (plan CEO 2A). */
export type SlackFailure = "disconnected" | "channel" | "transient" | "other";

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
  return "other";
}

export function describeSlackError(error: unknown): { code: string; message: string } {
  const code = slackErrorCode(error) ?? "unknown";
  const message = error instanceof Error ? error.message : String(error);
  return { code, message: message.slice(0, 300) };
}

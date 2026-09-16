import type { WebClient } from "@slack/web-api";
import { ErrorCode } from "@slack/web-api";
import { vi } from "vitest";
import type { AnswerRow, FactRow, GameRow, MemberRow, TeamRow } from "@/lib/db/types";

/** Row factories with sane defaults. Override only what the test is about. */
export const team = (extra: Partial<TeamRow> = {}): TeamRow => ({
  id: "t1",
  slack_team_id: "T1",
  slack_team_name: "Equipo",
  bot_user_id: "UBOT",
  bot_token_secret_id: "secret-1",
  admin_user_id: "admin-1",
  admin_slack_user_id: "Um1",
  channel_id: "C1",
  channel_name: "rituales",
  welcomed_channel_id: "C1",
  cadence_per_week: 3,
  timezone: "America/Mexico_City",
  language: "es",
  paused_until: null,
  material_alert_sent_at: null,
  channel_error_at: null,
  disconnected_at: null,
  last_tick_at: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...extra,
});

export const member = (id: string, name: string, extra: Partial<MemberRow> = {}): MemberRow => ({
  id,
  team_id: "t1",
  slack_user_id: `U${id}`,
  display_name: name,
  onboarding_done: true,
  opted_out: false,
  left_at: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...extra,
});

export const fact = (id: string, memberId: string, text: string, extra: Partial<FactRow> = {}): FactRow => ({
  id,
  member_id: memberId,
  kind: "fact",
  payload: { question_key: "first_job", text },
  source: "seed",
  used_at: null,
  retired: false,
  created_at: `2026-09-01T00:00:0${id.length % 10}Z`,
  ...extra,
});

/** A queued guess-who for 2026-09-16 at 10:00 Mexico City (16:00Z). */
export const game = (extra: Partial<GameRow> = {}): GameRow => ({
  id: "g1",
  team_id: "t1",
  type: "guess_who",
  status: "queued",
  skip_reason: null,
  payload: { fact_id: "f1", featured_member_id: "m1", question_key: "first_job", text: "repartir periódicos" },
  slot_date: "2026-09-16",
  scheduled_for: "2026-09-16T16:00:00.000Z",
  post_attempted_at: null,
  posted_at: null,
  slack_channel_id: null,
  slack_ts: null,
  revealed_thread_ts: null,
  content_hash: null,
  is_sample: false,
  created_at: "2026-09-10T00:00:00Z",
  updated_at: "2026-09-10T00:00:00Z",
  ...extra,
});

export const answer = (id: string, gameId: string, memberId: string, choice: string): AnswerRow => ({
  id,
  game_id: gameId,
  member_id: memberId,
  value: { choice },
  correct_count: null,
  created_at: "2026-09-16T17:00:00Z",
  updated_at: "2026-09-16T17:00:00Z",
});

/** A Slack error the way @slack/web-api throws it (mapSlackError reads `code` + `data.error`). */
export function slackPlatformError(code: string): Error {
  const error = new Error(`An API error occurred: ${code}`) as Error & { code: string; data: { error: string } };
  error.code = ErrorCode.PlatformError;
  error.data = { error: code };
  return error;
}

export function slackRateLimitError(): Error {
  const error = new Error("A rate-limit has been reached") as Error & { code: string };
  error.code = ErrorCode.RateLimitedError;
  return error;
}

/** Recording WebClient with `chat.postMessage` and `chat.update`. Each call is queued in `calls`. */
export function fakeSlack() {
  let counter = 0;
  const calls: { method: "chat.postMessage" | "chat.update"; args: Record<string, unknown> }[] = [];
  const postMessage = vi.fn(async (args: Record<string, unknown>) => {
    calls.push({ method: "chat.postMessage", args });
    counter += 1;
    return { ok: true, ts: `17000${counter}.000100` };
  });
  const update = vi.fn(async (args: Record<string, unknown>) => {
    calls.push({ method: "chat.update", args });
    return { ok: true };
  });
  const client = { chat: { postMessage, update } } as unknown as WebClient;
  return { client, calls, postMessage, update };
}

export function blockTypes(blocks: unknown): string[] {
  return (blocks as { type: string }[]).map((b) => b.type);
}

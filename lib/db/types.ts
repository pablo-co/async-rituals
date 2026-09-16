import type { GameStatus, GameType, SkipReason } from "@/lib/games/types";

/** Rows of the admin views (what the `authenticated` role can read). Mirrors supabase/migrations. */
export interface TeamAdmin {
  id: string;
  slack_team_id: string;
  slack_team_name: string | null;
  bot_user_id: string | null;
  admin_slack_user_id: string | null;
  channel_id: string | null;
  channel_name: string | null;
  welcomed_channel_id: string | null;
  cadence_per_week: number;
  timezone: string;
  language: string;
  paused_until: string | null;
  channel_error_at: string | null;
  disconnected_at: string | null;
  last_tick_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GameAdmin {
  id: string;
  team_id: string;
  type: GameType;
  status: GameStatus;
  skip_reason: SkipReason | null;
  slot_date: string;
  scheduled_for: string;
  is_sample: boolean;
  preview: string | null;
  created_at: string;
}

export interface EventAdmin {
  id: number;
  team_id: string | null;
  run_id: string | null;
  kind: string;
  game_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface RecentGame {
  id: string;
  type: GameType;
  slot_date: string;
  status: GameStatus;
  skip_reason: SkipReason | null;
  answers: number;
  correct: number;
}

/** Result of the `admin_activity` function (aggregates only, never per person). */
export interface AdminActivity {
  members: number;
  onboarded: number;
  played_this_week: number;
  games_published: number;
  next_slot_date: string | null;
  last_tick_at: string | null;
  recent_games: RecentGame[];
  recent_events: Pick<EventAdmin, "id" | "kind" | "detail" | "created_at">[];
}

/** Full rows (service role only). Mirrors supabase/migrations/0001_init.sql. */
export interface TeamRow extends TeamAdmin {
  admin_user_id: string;
  bot_token_secret_id: string | null;
  material_alert_sent_at: string | null;
}

export interface MemberRow {
  id: string;
  team_id: string;
  slack_user_id: string;
  display_name: string;
  onboarding_done: boolean;
  opted_out: boolean;
  left_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FactRow {
  id: string;
  member_id: string;
  kind: "fact" | "two_truths";
  payload: Record<string, unknown>;
  source: "onboarding" | "seed" | "command";
  used_at: string | null;
  retired: boolean;
  created_at: string;
}

export interface GameRow {
  id: string;
  team_id: string;
  type: GameType;
  status: GameStatus;
  skip_reason: SkipReason | null;
  payload: Record<string, unknown>;
  slot_date: string;
  scheduled_for: string;
  post_attempted_at: string | null;
  posted_at: string | null;
  slack_channel_id: string | null;
  slack_ts: string | null;
  revealed_thread_ts: string | null;
  content_hash: string | null;
  is_sample: boolean;
  created_at: string;
  updated_at: string;
}

export interface AnswerRow {
  id: string;
  game_id: string;
  member_id: string;
  value: Record<string, unknown>;
  correct_count: number | null;
  created_at: string;
  updated_at: string;
}

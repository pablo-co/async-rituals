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

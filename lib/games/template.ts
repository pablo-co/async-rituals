import type { KnownBlock } from "@slack/web-api";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import type { AnswerRow, GameRow, MemberRow, TeamRow } from "@/lib/db/types";
import type { GameType } from "./types";

/**
 * The contract every game template implements (1A), and who calls each phase:
 *
 *   fill ──▶ generate(ctx, slot) ──▶ games row (queued)           null = no material → next template
 *   tick ──▶ render(ctx, game, members) ──▶ Block Kit post        TemplateError → skipped(reason)
 *   tick ──▶ score(game, answers) ──▶ answers.correct_count       (revealing)
 *   tick ──▶ reveal(input) ──▶ chat.update + thread                → revealed
 *   tick ──▶ closed(game, members) ──▶ chat.update sin botones     → skipped(no_answers)
 *
 * The tick only talks to this interface. Decorative lines (streak milestones, "ya volvimos")
 * are added by the tick and fail soft; a template throws only for its own problems.
 */
export interface TemplateContext {
  db: SupabaseClient;
  team: TeamRow;
  now: Date;
}

export interface GeneratedGame {
  type: GameType;
  payload: Record<string, unknown>;
  contentHash: string | null;
  isSample?: boolean;
}

export interface RenderedPost {
  blocks: KnownBlock[];
  text: string;
}

export interface RevealInput {
  game: GameRow;
  answers: AnswerRow[];
  members: MemberRow[];
  scores: Map<string, number | null>;
}

export interface RevealOutput extends RenderedPost {
  /** Broadcast thread reply; null when the template has nothing to add. */
  thread: string | null;
}

export interface GameTemplate {
  type: GameType;
  generate(ctx: TemplateContext, slot: { slotDate: string }): Promise<GeneratedGame | null>;
  render(ctx: TemplateContext, game: GameRow, members: MemberRow[]): Promise<RenderedPost>;
  score(game: GameRow, answers: AnswerRow[]): Map<string, number | null>;
  reveal(input: RevealInput): RevealOutput;
  closed(game: GameRow, members: MemberRow[]): RenderedPost;
  /** Human label for a button choice in the "Guardado: …" ack. Absent → the choice is a member id. */
  labelFor?(game: GameRow, choice: string): string | null;
}

/** Hash of normalized text (lowercase, no punctuation) so the same question never repeats. */
export function contentHash(text: string): string {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(normalized).digest("hex");
}

export function activeMembers(members: MemberRow[]): MemberRow[] {
  return members.filter((m) => !m.left_at && !m.opted_out);
}

export function memberName(members: MemberRow[], id: string): string {
  return members.find((m) => m.id === id)?.display_name ?? "alguien";
}

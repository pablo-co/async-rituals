export type GameType = "guess_who" | "two_truths" | "trivia" | "this_or_that" | "puzzle" | "recap";
export type GameStatus =
  | "queued"
  | "posting"
  | "posted"
  | "revealing"
  | "revealed"
  | "vetoed"
  | "skipped";
export type SkipReason =
  | "out_of_window"
  | "paused"
  | "no_answers"
  | "featured_inactive"
  | "template_error"
  | "channel_error"
  | "sample"
  | "post_uncertain";

/** Names shown to people (Slack headers, web rows). Spanish on purpose: the product speaks Spanish. */
export const GAME_LABELS: Record<GameType, string> = {
  guess_who: "Adivina quién",
  two_truths: "Dos verdades y una mentira",
  trivia: "Trivia",
  this_or_that: "Esto o aquello",
  puzzle: "Puzzle",
  recap: "Recap de la semana",
};

/** Fixed rotation per slot. A template without material is skipped and the slot takes the next one. */
export const ROTATION: readonly GameType[] = [
  "guess_who",
  "this_or_that",
  "two_truths",
  "trivia",
  "puzzle",
];

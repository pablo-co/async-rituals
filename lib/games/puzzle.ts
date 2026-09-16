import { generatePuzzle, recentPreviews } from "@/lib/ai/generate";
import { sampleGame } from "@/lib/ai/sample";
import type { GameRow } from "@/lib/db/types";
import { hasAnthropicKey } from "@/lib/env";
import { actions, button, context, header, section } from "@/lib/slack/blocks";
import { strings } from "@/lib/slack/strings";
import { escapeSlackText } from "@/lib/slack/text";
import { activeMembers, contentHash, memberName, type GameTemplate, type RevealInput } from "./template";

/**
 * Puzzle: one riddle, answered by text in a modal. `answers.value` is `{ text }`; the reveal
 * compares the normalized text against `accepted_answers` (lowercase, no accents, no punctuation,
 * no leading article). The riddle may carry emojis when it is made of them (documented exception).
 */
export interface PuzzlePayload {
  preview: string;
  prompt: string;
  answer: string;
  accepted_answers: string[];
  resumed?: boolean;
}

export function puzzlePayload(game: GameRow): PuzzlePayload {
  return game.payload as unknown as PuzzlePayload;
}

const ARTICLES = /^(el|la|los|las|un|una|unos|unas|the|a|an)\s+/;

export function normalizeAnswer(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(ARTICLES, "");
}

export function isAccepted(text: string, accepted: string[], answer: string): boolean {
  const given = normalizeAnswer(text);
  if (!given) return false;
  return [answer, ...accepted].some((a) => normalizeAnswer(a) === given);
}

export const puzzle: GameTemplate = {
  type: "puzzle",

  async generate(ctx) {
    if (!hasAnthropicKey()) return sampleGame("puzzle");
    const used = await recentPreviews(ctx.db, ctx.team.id, "puzzle");
    const content = await generatePuzzle(used);
    const payload: PuzzlePayload = {
      preview: content.prompt,
      prompt: content.prompt,
      answer: content.answer,
      accepted_answers: content.accepted_answers,
    };
    return {
      type: "puzzle",
      payload: payload as unknown as Record<string, unknown>,
      contentHash: contentHash(content.prompt),
    };
  },

  async render(_ctx, game) {
    const p = puzzlePayload(game);
    const blocks = [
      header(strings.header("puzzle")),
      section(`${escapeSlackText(p.prompt)}\n${strings.puzzle.intro}`),
      actions(`play:${game.id}`, [button(`play:${game.id}`, strings.play, game.id, "primary")]),
      context(strings.contextPending),
    ];
    if (p.resumed) blocks.push(context(strings.contextResumed));
    return { blocks, text: strings.fallback.post("puzzle") };
  },

  score(game, answers) {
    const p = puzzlePayload(game);
    const scores = new Map<string, number | null>();
    for (const a of answers) {
      const text = String((a.value as { text?: unknown }).text ?? "");
      scores.set(a.id, isAccepted(text, p.accepted_answers ?? [], p.answer) ? 1 : 0);
    }
    return scores;
  },

  reveal({ game, answers, members, scores }: RevealInput) {
    const p = puzzlePayload(game);
    const solvers = answers.filter((a) => scores.get(a.id) === 1).map((a) => escapeSlackText(memberName(members, a.member_id)));
    const eligible = activeMembers(members).length;
    const blocks = [
      header(strings.header("puzzle")),
      section(`${escapeSlackText(p.prompt)}\n\n${strings.puzzle.revealLine(escapeSlackText(p.answer))}`),
      context(strings.contextClosed(answers.length, Math.max(eligible, answers.length))),
    ];
    return { blocks, text: strings.fallback.reveal("puzzle"), thread: strings.puzzle.solved(solvers) };
  },

  closed(game) {
    const p = puzzlePayload(game);
    return {
      blocks: [header(strings.header("puzzle")), section(`${escapeSlackText(p.prompt)}\n\n${strings.closedNoAnswers}`)],
      text: strings.fallback.reveal("puzzle"),
    };
  },
};

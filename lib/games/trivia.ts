import { generateTrivia, recentPreviews } from "@/lib/ai/generate";
import { sampleGame } from "@/lib/ai/sample";
import type { GameRow } from "@/lib/db/types";
import { hasAnthropicKey } from "@/lib/env";
import { actions, button, context, header, section } from "@/lib/slack/blocks";
import { strings } from "@/lib/slack/strings";
import { escapeSlackText } from "@/lib/slack/text";
import { activeMembers, contentHash, memberName, type GameTemplate, type RevealInput } from "./template";

/**
 * Trivia: 3-5 questions answered in a modal (one "Jugar" button in the post). `answers.value`
 * is `{ choices: number[] }`, one option index per question; `correct_count` = matches.
 */
export interface TriviaQuestion {
  q: string;
  options: string[];
  correct: number;
}

export interface TriviaPayload {
  preview: string;
  title: string;
  questions: TriviaQuestion[];
  resumed?: boolean;
}

export function triviaPayload(game: GameRow): TriviaPayload {
  return game.payload as unknown as TriviaPayload;
}

export function triviaChoices(value: Record<string, unknown>): number[] {
  const choices = (value as { choices?: unknown }).choices;
  return Array.isArray(choices) ? choices.map((c) => Number(c)) : [];
}

export const trivia: GameTemplate = {
  type: "trivia",

  async generate(ctx) {
    if (!hasAnthropicKey()) return sampleGame("trivia");
    const used = await recentPreviews(ctx.db, ctx.team.id, "trivia");
    const content = await generateTrivia(used);
    const payload: TriviaPayload = { preview: content.title, title: content.title, questions: content.questions };
    return {
      type: "trivia",
      payload: payload as unknown as Record<string, unknown>,
      contentHash: contentHash(content.questions.map((q) => q.q).join(" ")),
    };
  },

  async render(_ctx, game) {
    const p = triviaPayload(game);
    const blocks = [
      header(strings.header("trivia")),
      section(`*${escapeSlackText(p.title)}*\n${strings.trivia.intro(p.questions.length)}`),
      actions(`play:${game.id}`, [button(`play:${game.id}`, strings.play, game.id, "primary")]),
      context(strings.contextPending),
    ];
    if (p.resumed) blocks.push(context(strings.contextResumed));
    return { blocks, text: strings.fallback.post("trivia") };
  },

  score(game, answers) {
    const questions = triviaPayload(game).questions;
    const scores = new Map<string, number | null>();
    for (const a of answers) {
      const choices = triviaChoices(a.value);
      const correct = questions.reduce((sum, q, i) => sum + (choices[i] === q.correct ? 1 : 0), 0);
      scores.set(a.id, correct);
    }
    return scores;
  },

  reveal({ game, answers, members, scores }: RevealInput) {
    const p = triviaPayload(game);
    const correctTexts = p.questions.map((q) => escapeSlackText(q.options[q.correct] ?? "?"));
    const perfect = answers
      .filter((a) => scores.get(a.id) === p.questions.length)
      .map((a) => escapeSlackText(memberName(members, a.member_id)));
    const eligible = activeMembers(members).length;
    const blocks = [
      header(strings.header("trivia")),
      section(`*${escapeSlackText(p.title)}*\n\n${strings.trivia.revealLine(correctTexts)}`),
      context(strings.contextClosed(answers.length, Math.max(eligible, answers.length))),
    ];
    return { blocks, text: strings.fallback.reveal("trivia"), thread: strings.trivia.perfect(perfect) };
  },

  closed(game) {
    const p = triviaPayload(game);
    return {
      blocks: [header(strings.header("trivia")), section(`*${escapeSlackText(p.title)}*\n\n${strings.closedNoAnswers}`)],
      text: strings.fallback.reveal("trivia"),
    };
  },
};

import { generateThisOrThat, recentPreviews } from "@/lib/ai/generate";
import { sampleGame } from "@/lib/ai/sample";
import type { GameRow } from "@/lib/db/types";
import { hasAnthropicKey } from "@/lib/env";
import { answerButtons, context, header, section } from "@/lib/slack/blocks";
import { strings } from "@/lib/slack/strings";
import { escapeSlackText } from "@/lib/slack/text";
import { activeMembers, contentHash, type GameTemplate, type RevealInput } from "./template";

/**
 * Esto o aquello: two buttons, no right answer, one point for playing. The quip for the
 * minority side is generated in the fill and stored in the payload (never AI at reveal time).
 */
export interface ThisOrThatPayload {
  preview: string;
  question: string;
  options: [string, string];
  quips: [string, string];
  resumed?: boolean;
}

function payloadOf(game: GameRow): ThisOrThatPayload {
  return game.payload as unknown as ThisOrThatPayload;
}

function questionLine(game: GameRow): string {
  return escapeSlackText(payloadOf(game).question);
}

function tally(answers: RevealInput["answers"]): [number, number] {
  const counts: [number, number] = [0, 0];
  for (const a of answers) {
    const choice = Number((a.value as { choice?: string }).choice);
    if (choice === 0 || choice === 1) counts[choice] += 1;
  }
  return counts;
}

export const thisOrThat: GameTemplate = {
  type: "this_or_that",

  async generate(ctx) {
    if (!hasAnthropicKey()) return sampleGame("this_or_that");
    const used = await recentPreviews(ctx.db, ctx.team.id, "this_or_that");
    const content = await generateThisOrThat(used);
    const payload: ThisOrThatPayload = {
      preview: content.question,
      question: content.question,
      options: [content.options[0], content.options[1]],
      quips: [content.quips[0], content.quips[1]],
    };
    return {
      type: "this_or_that",
      payload: payload as unknown as Record<string, unknown>,
      contentHash: contentHash(`${content.question} ${content.options.join(" ")}`),
    };
  },

  async render(_ctx, game) {
    const p = payloadOf(game);
    const actionId = `answer:${game.id}`;
    const blocks = [
      header(strings.header("this_or_that")),
      section(questionLine(game)),
      answerButtons(actionId, actionId, [
        { label: p.options[0], value: "0" },
        { label: p.options[1], value: "1" },
      ]),
      context(strings.contextPending),
    ];
    if (p.resumed) blocks.push(context(strings.contextResumed));
    return { blocks, text: strings.fallback.post("this_or_that") };
  },

  labelFor(game, choice) {
    const option = payloadOf(game).options[Number(choice)];
    return option ?? null;
  },

  /** No right answer: every score is null (1 point for playing comes from SQL, hito 3). */
  score(_game, answers) {
    return new Map(answers.map((a) => [a.id, null]));
  },

  reveal({ game, answers, members }) {
    const p = payloadOf(game);
    const [n, m] = tally(answers);
    const a = escapeSlackText(p.options[0]);
    const b = escapeSlackText(p.options[1]);
    const eligible = activeMembers(members).length;
    const blocks = [
      header(strings.header("this_or_that")),
      section(`${questionLine(game)}\n\n${strings.thisOrThat.revealLine(a, n, b, m)}`),
      context(strings.contextClosed(answers.length, Math.max(eligible, answers.length))),
    ];
    // The minority hears the quip; on a tie, side A.
    const minority = m < n ? 1 : 0;
    return { blocks, text: strings.fallback.reveal("this_or_that"), thread: escapeSlackText(p.quips[minority]) };
  },

  closed(game) {
    return {
      blocks: [header(strings.header("this_or_that")), section(`${questionLine(game)}\n\n${strings.closedNoAnswers}`)],
      text: strings.fallback.reveal("this_or_that"),
    };
  },
};

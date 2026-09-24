import type { InputBlock, ModalView, Option, PlainTextElement } from "@slack/web-api";
import type { GameRow } from "@/lib/db/types";
import { triviaChoices, triviaPayload } from "@/lib/games/trivia";
import { clampLabel, LIMITS, strings } from "@/lib/slack/strings";

/**
 * Trivia modal (D-2D): one required radio_buttons block per question. Reopening before the reveal
 * preselects what the person already answered. private_metadata carries game_id + channel_id.
 */
export const TRIVIA_CALLBACK = "trivia";

const plain = (text: string, max = 2000): PlainTextElement => ({ type: "plain_text", text: clampLabel(text, max), emoji: true });

function optionsFor(options: string[]): Option[] {
  return options.map((o, j) => ({ text: plain(o, LIMITS.option), value: String(j) }));
}

export function triviaModal(game: GameRow, existing?: Record<string, unknown> | null): ModalView {
  const p = triviaPayload(game);
  const chosen = existing ? triviaChoices(existing) : [];
  const blocks: InputBlock[] = p.questions.map((q, i) => {
    const options = optionsFor(q.options);
    const initial = Number.isInteger(chosen[i]) ? options[chosen[i]] : undefined;
    return {
      type: "input",
      block_id: `q${i}`,
      label: plain(`${i + 1}. ${q.q}`),
      element: {
        type: "radio_buttons",
        action_id: "choice",
        options,
        ...(initial ? { initial_option: initial } : {}),
      },
    };
  });
  return {
    type: "modal",
    callback_id: TRIVIA_CALLBACK,
    private_metadata: JSON.stringify({ game_id: game.id, channel_id: game.slack_channel_id }),
    title: plain(strings.header("trivia"), LIMITS.modalTitle),
    submit: plain(strings.modal.submit, LIMITS.modalTitle),
    close: plain(strings.modal.close, LIMITS.modalTitle),
    blocks,
  };
}

export type SubmissionRead = { value: Record<string, unknown>; ack: string } | { errors: Record<string, string> };

/**
 * view.state.values → { choices } or per-block errors, without touching the database (the reply to
 * Slack must be instant). Blocks are q0…qN; a gap or an empty selection is flagged on that block.
 * The save step checks the count against the game's questions.
 */
export function readTriviaSubmission(values: Record<string, unknown>): SubmissionRead {
  const indexes = Object.keys(values)
    .map((key) => /^q(\d+)$/.exec(key))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]));
  if (indexes.length === 0) return { errors: { q0: strings.modal.pickOne } };
  const last = Math.max(...indexes);
  const choices: number[] = [];
  const errors: Record<string, string> = {};
  for (let i = 0; i <= last; i += 1) {
    const block = values[`q${i}`] as { choice?: { selected_option?: { value?: string } | null } } | undefined;
    const raw = block?.choice?.selected_option?.value;
    const n = raw === undefined ? NaN : Number(raw);
    if (!Number.isInteger(n)) errors[`q${i}`] = strings.modal.pickOne;
    else choices.push(n);
  }
  if (Object.keys(errors).length > 0) return { errors };
  return { value: { choices }, ack: strings.trivia.ackSaved(choices.length) };
}

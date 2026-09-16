import type { InputBlock, ModalView, PlainTextElement, SectionBlock } from "@slack/web-api";
import type { GameRow } from "@/lib/db/types";
import { puzzlePayload } from "@/lib/games/puzzle";
import { clampLabel, LIMITS, strings } from "@/lib/slack/strings";
import { escapeSlackText } from "@/lib/slack/text";
import type { SubmissionRead } from "./trivia";

/** Puzzle modal (D-2D): the riddle, then one text input (max 80) with the normalization hint. */
export const PUZZLE_CALLBACK = "puzzle";
export const PUZZLE_MAX_LENGTH = 80;

const plain = (text: string, max = 2000): PlainTextElement => ({ type: "plain_text", text: clampLabel(text, max), emoji: true });

export function puzzleModal(game: GameRow, existing?: Record<string, unknown> | null): ModalView {
  const p = puzzlePayload(game);
  const initial = existing ? String((existing as { text?: unknown }).text ?? "") : "";
  const prompt: SectionBlock = { type: "section", text: { type: "mrkdwn", text: escapeSlackText(p.prompt) } };
  const input: InputBlock = {
    type: "input",
    block_id: "answer",
    label: plain(strings.modal.puzzleLabel),
    hint: plain(strings.modal.puzzleHint),
    element: {
      type: "plain_text_input",
      action_id: "text",
      max_length: PUZZLE_MAX_LENGTH,
      ...(initial ? { initial_value: initial } : {}),
    },
  };
  return {
    type: "modal",
    callback_id: PUZZLE_CALLBACK,
    private_metadata: JSON.stringify({ game_id: game.id, channel_id: game.slack_channel_id }),
    title: plain(strings.header("puzzle"), LIMITS.modalTitle),
    submit: plain(strings.modal.submit, LIMITS.modalTitle),
    close: plain(strings.modal.close, LIMITS.modalTitle),
    blocks: [prompt, input],
  };
}

export function readPuzzleSubmission(values: Record<string, unknown>): SubmissionRead {
  const block = values.answer as { text?: { value?: string | null } } | undefined;
  const text = String(block?.text?.value ?? "")
    .trim()
    .slice(0, PUZZLE_MAX_LENGTH);
  if (!text) return { errors: { answer: strings.modal.emptyAnswer } };
  return { value: { text }, ack: strings.puzzle.ackSaved(text) };
}

import type { InputBlock, ModalView, PlainTextElement } from "@slack/web-api";
import { ANSWER_MAX_LENGTH, QUESTIONS } from "@/lib/games/questions";
import { clampLabel, LIMITS, strings } from "@/lib/slack/strings";

/** `/rituales hecho` (plan CEO 6): one fact in third person, stored with question_key 'free'. */
export const FACT_CALLBACK = "fact";

export interface FactMetadata {
  team_id: string;
  member_id: string;
  /** Where the confirmation goes: the slash command's (or the retry button's) response_url. */
  response_url: string;
}

const plain = (text: string, max = 2000): PlainTextElement => ({ type: "plain_text", text: clampLabel(text, max), emoji: true });
const FREE = QUESTIONS.find((q) => q.key === "free")!;

export function factModal(meta: FactMetadata): ModalView {
  const input: InputBlock = {
    type: "input",
    block_id: "fact",
    label: plain(strings.fact.label),
    hint: plain(strings.fact.hint),
    element: { type: "plain_text_input", action_id: "text", max_length: ANSWER_MAX_LENGTH, placeholder: plain(FREE.placeholder, 150) },
  };
  return {
    type: "modal",
    callback_id: FACT_CALLBACK,
    private_metadata: JSON.stringify(meta),
    title: plain(strings.fact.title, LIMITS.modalTitle),
    submit: plain(strings.modal.submit, LIMITS.modalTitle),
    close: plain(strings.modal.close, LIMITS.modalTitle),
    blocks: [input],
  };
}

export function readFactSubmission(values: Record<string, unknown>): { errors: Record<string, string> } | { value: { text: string } } {
  const text = String((values.fact as { text?: { value?: string | null } } | undefined)?.text?.value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ANSWER_MAX_LENGTH);
  if (!text) return { errors: { fact: strings.fact.empty } };
  return { value: { text } };
}

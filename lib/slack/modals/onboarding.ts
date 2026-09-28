import type { ContextBlock, InputBlock, KnownBlock, ModalView, Option, PlainTextElement, SectionBlock } from "@slack/web-api";
import { ANSWER_MAX_LENGTH, QUESTIONS } from "@/lib/games/questions";
import { clampLabel, LIMITS, strings } from "@/lib/slack/strings";

/**
 * "Cuéntanos de ti" (D-7A): the 10 questions, all optional, then an optional two-truths block
 * (3 sentences + which one is the lie: all three or none). A consent line opens the modal.
 * Reopening pre-fills what the person answered and has not been used in a game yet.
 */
export const ONBOARDING_CALLBACK = "onboarding";
export const STATEMENT_MAX_LENGTH = 200;

export interface OnboardingMetadata {
  team_id: string;
  member_id: string;
  /** The DM message with the "Contestar" button: updated after saving. */
  dm_channel: string | null;
  dm_ts: string | null;
}

export interface TwoTruths {
  statements: [string, string, string];
  lie_index: number;
}

export interface OnboardingAnswers {
  facts: { question_key: string; text: string }[];
  twoTruths: TwoTruths | null;
}

const plain = (text: string, max = 2000): PlainTextElement => ({ type: "plain_text", text: clampLabel(text, max), emoji: true });
const LIE_OPTIONS: Option[] = [0, 1, 2].map((i) => ({ text: plain(strings.onboarding.lieOption(i + 1), LIMITS.option), value: String(i) }));

function textInput(blockId: string, label: string, opts: { placeholder?: string; hint: string; initial?: string; max: number }): InputBlock {
  return {
    type: "input",
    block_id: blockId,
    optional: true,
    label: plain(label),
    hint: plain(opts.hint),
    element: {
      type: "plain_text_input",
      action_id: "text",
      max_length: opts.max,
      ...(opts.placeholder ? { placeholder: plain(opts.placeholder, 150) } : {}),
      ...(opts.initial ? { initial_value: opts.initial } : {}),
    },
  };
}

export function onboardingModal(existing: OnboardingAnswers, meta: OnboardingMetadata): ModalView {
  const answerFor = (key: string) => existing.facts.find((f) => f.question_key === key)?.text;
  const consent: ContextBlock = { type: "context", elements: [{ type: "mrkdwn", text: strings.onboarding.consent }] };
  const questions: InputBlock[] = QUESTIONS.map((q) =>
    textInput(`q_${q.key}`, q.prompt, {
      placeholder: q.placeholder,
      hint: q.key === "free" ? strings.onboarding.freeHint : strings.onboarding.hint,
      initial: answerFor(q.key),
      max: ANSWER_MAX_LENGTH,
    }),
  );
  const tt = existing.twoTruths;
  const twoTruthsIntro: SectionBlock = {
    type: "section",
    text: { type: "mrkdwn", text: `${strings.onboarding.twoTruthsTitle}\n${strings.onboarding.twoTruthsHelp}` },
  };
  const statements: InputBlock[] = [0, 1, 2].map((i) =>
    textInput(`tt_${i}`, strings.onboarding.statement(i + 1), {
      hint: strings.onboarding.hint,
      initial: tt?.statements[i],
      max: STATEMENT_MAX_LENGTH,
    }),
  );
  const lie: InputBlock = {
    type: "input",
    block_id: "tt_lie",
    optional: true,
    label: plain(strings.onboarding.lieLabel),
    element: {
      type: "radio_buttons",
      action_id: "choice",
      options: LIE_OPTIONS,
      ...(tt ? { initial_option: LIE_OPTIONS[tt.lie_index] } : {}),
    },
  };
  const blocks: KnownBlock[] = [consent, ...questions, { type: "divider" }, twoTruthsIntro, ...statements, lie];
  return {
    type: "modal",
    callback_id: ONBOARDING_CALLBACK,
    private_metadata: JSON.stringify(meta),
    title: plain(strings.onboarding.title, LIMITS.modalTitle),
    submit: plain(strings.modal.submit, LIMITS.modalTitle),
    close: plain(strings.modal.close, LIMITS.modalTitle),
    blocks,
  };
}

type Values = Record<string, unknown>;
const textOf = (values: Values, blockId: string, max: number) =>
  String((values[blockId] as { text?: { value?: string | null } } | undefined)?.text?.value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** Pure: reads what Slack sent. Errors go under the block that needs fixing. */
export function readOnboardingSubmission(values: Values): { errors: Record<string, string> } | { value: OnboardingAnswers } {
  const facts = QUESTIONS.map((q) => ({ question_key: q.key, text: textOf(values, `q_${q.key}`, ANSWER_MAX_LENGTH) })).filter(
    (f) => f.text.length > 0,
  );

  const statements = [0, 1, 2].map((i) => textOf(values, `tt_${i}`, STATEMENT_MAX_LENGTH));
  const lieRaw = (values.tt_lie as { choice?: { selected_option?: { value?: string } | null } } | undefined)?.choice?.selected_option?.value;
  const lieIndex = lieRaw === undefined ? null : Number(lieRaw);
  const filled = statements.filter(Boolean).length;

  let twoTruths: TwoTruths | null = null;
  if (filled === 3 && lieIndex !== null && [0, 1, 2].includes(lieIndex)) {
    twoTruths = { statements: statements as [string, string, string], lie_index: lieIndex };
  } else if (filled > 0 || lieIndex !== null) {
    const block = filled === 3 ? "tt_lie" : `tt_${statements.findIndex((s) => !s)}`;
    return { errors: { [block]: strings.onboarding.twoTruthsIncomplete } };
  }

  if (facts.length === 0 && !twoTruths) return { errors: { [`q_${QUESTIONS[0].key}`]: strings.onboarding.nothing } };
  return { value: { facts, twoTruths } };
}

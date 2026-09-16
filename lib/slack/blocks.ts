import type {
  ActionsBlock,
  Button,
  ContextBlock,
  HeaderBlock,
  SectionBlock,
  StaticSelect,
} from "@slack/web-api";
import { clampLabel, LIMITS } from "./strings";

export interface Option {
  label: string;
  value: string;
}

export function header(text: string): HeaderBlock {
  return { type: "header", text: { type: "plain_text", text: clampLabel(text, LIMITS.header), emoji: true } };
}

export function section(mrkdwn: string): SectionBlock {
  return { type: "section", text: { type: "mrkdwn", text: mrkdwn } };
}

export function context(text: string): ContextBlock {
  return { type: "context", elements: [{ type: "mrkdwn", text }] };
}

export function button(actionId: string, label: string, value: string, style?: "primary" | "danger"): Button {
  return {
    type: "button",
    action_id: actionId,
    text: { type: "plain_text", text: clampLabel(label, LIMITS.button), emoji: true },
    value,
    ...(style ? { style } : {}),
  };
}

/** Up to 6 answer buttons (D-1A). Every button shares the action_id; the value is the choice. */
export function answerButtons(blockId: string, actionId: string, options: Option[]): ActionsBlock {
  return {
    type: "actions",
    block_id: blockId,
    elements: options.slice(0, LIMITS.actions).map((o) => button(actionId, o.label, o.value)),
  };
}

/** More than 6 options: one static_select instead of a wall of buttons. */
export function answerSelect(blockId: string, actionId: string, placeholder: string, options: Option[]): ActionsBlock {
  const select: StaticSelect = {
    type: "static_select",
    action_id: actionId,
    placeholder: { type: "plain_text", text: placeholder, emoji: true },
    options: options.map((o) => ({
      text: { type: "plain_text", text: clampLabel(o.label, LIMITS.option), emoji: true },
      value: o.value,
    })),
  };
  return { type: "actions", block_id: blockId, elements: [select] };
}

export function actions(blockId: string, elements: Button[]): ActionsBlock {
  return { type: "actions", block_id: blockId, elements };
}

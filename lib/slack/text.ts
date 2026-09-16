/**
 * Escapes member-written text before it goes into Block Kit (3A).
 * Slack's mrkdwn treats <, > and & as control characters: this turns
 * "<!channel>" or "<@U123>" into literal text instead of a mention.
 */
export function escapeSlackText(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Cuts text to a Block Kit limit, adding an ellipsis when it had to cut. */
export function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  return `${input.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

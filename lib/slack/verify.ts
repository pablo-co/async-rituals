import { createHmac, timingSafeEqual } from "node:crypto";
import { logEvent } from "@/lib/events";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * One request from Slack, end to end:
 *
 *   Slack ──POST──▶ withSlackRequest
 *                     ├─ allowUnsigned? (only the url_verification handshake)
 *                     ├─ signature v0 = HMAC-SHA256(signing secret, "v0:{ts}:{body}") · |now - ts| ≤ 5 min
 *                     ├─ parse: JSON (events) · form `payload` (interactions) · form fields (slash commands)
 *                     ├─ handler → Response (synchronous reply) or nothing (empty 200)
 *                     └─ any bug → events.handler_error + 200 (so Slack does not retry our own bugs)
 */
const FIVE_MINUTES = 60 * 5;

export function verifySlackSignature(args: {
  signingSecret: string;
  timestamp: string | null;
  signature: string | null;
  body: string;
  now?: number;
}): boolean {
  const { signingSecret, timestamp, signature, body } = args;
  if (!timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const nowSec = Math.floor((args.now ?? Date.now()) / 1000);
  if (Math.abs(nowSec - ts) > FIVE_MINUTES) return false;
  const expected = `v0=${createHmac("sha256", signingSecret).update(`v0:${timestamp}:${body}`).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Test helper and the inverse of the check above. */
export function signSlackRequest(signingSecret: string, timestamp: string, body: string): string {
  return `v0=${createHmac("sha256", signingSecret).update(`v0:${timestamp}:${body}`).digest("hex")}`;
}

export type SlashCommand = {
  command: string;
  text: string;
  team_id: string;
  user_id: string;
  channel_id: string;
  response_url: string;
  trigger_id: string;
};

export type SlackRequest =
  | { kind: "command"; command: SlashCommand }
  | { kind: "interaction"; payload: Record<string, unknown> }
  | { kind: "event"; event: Record<string, unknown> };

export function parseSlackBody(contentType: string | null, body: string): SlackRequest {
  if (contentType?.includes("application/json")) {
    return { kind: "event", event: JSON.parse(body) as Record<string, unknown> };
  }
  const form = new URLSearchParams(body);
  const payload = form.get("payload");
  if (payload) return { kind: "interaction", payload: JSON.parse(payload) as Record<string, unknown> };
  const command = Object.fromEntries(form.entries()) as unknown as SlashCommand;
  if (!command.command) throw new Error("not a slash command");
  return { kind: "command", command };
}

type Handler = (req: SlackRequest) => Promise<Response | void>;

export function withSlackRequest(
  handler: Handler,
  options: { allowUnsigned?: (body: string) => Response | null } = {},
) {
  return async function POST(request: Request): Promise<Response> {
    const body = await request.text();

    const unsigned = options.allowUnsigned?.(body);
    if (unsigned) return unsigned;

    const secret = process.env.SLACK_SIGNING_SECRET;
    if (!secret) return new Response("SLACK_SIGNING_SECRET no configurado", { status: 503 });

    const valid = verifySlackSignature({
      signingSecret: secret,
      timestamp: request.headers.get("x-slack-request-timestamp"),
      signature: request.headers.get("x-slack-signature"),
      body,
    });
    if (!valid) {
      console.warn("slack: firma inválida o timestamp fuera de ventana");
      return new Response("invalid signature", { status: 401 });
    }

    let parsed: SlackRequest;
    try {
      parsed = parseSlackBody(request.headers.get("content-type"), body);
    } catch {
      return new Response("bad payload", { status: 400 });
    }

    try {
      const response = await handler(parsed);
      return response ?? new Response(null, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("slack handler error:", message);
      try {
        await logEvent(createAdminClient(), {
          kind: "handler_error",
          detail: { name: error instanceof Error ? error.name : "Error", message: message.slice(0, 300), kind: parsed.kind },
        });
      } catch {
        // Logging must never turn into a retry storm from Slack.
      }
      return new Response(null, { status: 200 });
    }
  };
}

/** JSON reply for slash commands and response_url posts. */
export function ephemeral(text: string, blocks?: unknown[]): Record<string, unknown> {
  return { response_type: "ephemeral", replace_original: false, text, ...(blocks ? { blocks } : {}) };
}

export async function postToResponseUrl(responseUrl: string, payload: Record<string, unknown>): Promise<void> {
  const res = await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) console.warn(`response_url respondió ${res.status}`);
}

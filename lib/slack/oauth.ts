import { createHmac, timingSafeEqual } from "node:crypto";

export const SLACK_SCOPES = ["chat:write", "channels:read", "channels:join", "users:read", "im:write", "commands"];
const STATE_TTL_MS = 10 * 60 * 1000;

function hmac(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

/** `state` = admin user id + timestamp, signed. It is the CSRF guard and it ties the install to the account (3A). */
export function signState(userId: string, secret: string, now: number = Date.now()): string {
  const ts = String(now);
  return `${userId}.${ts}.${hmac(secret, `${userId}.${ts}`)}`;
}

/** The user id inside a valid, fresh state; null otherwise. */
export function verifyState(state: string, secret: string, now: number = Date.now()): string | null {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [userId, ts, sig] = parts;
  const age = now - Number(ts);
  if (!Number.isFinite(age) || age < 0 || age > STATE_TTL_MS) return null;
  const expected = Buffer.from(hmac(secret, `${userId}.${ts}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return userId;
}

export function oauthRedirectUri(appUrl: string): string {
  return `${appUrl.replace(/\/$/, "")}/api/slack/oauth/callback`;
}

export function slackAuthorizeUrl(args: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", args.clientId);
  url.searchParams.set("scope", SLACK_SCOPES.join(","));
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("state", args.state);
  return url.toString();
}

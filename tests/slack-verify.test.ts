import { describe, expect, it } from "vitest";
import { parseSlackBody, signSlackRequest, verifySlackSignature } from "@/lib/slack/verify";

const SECRET = "8f742231b10e8888abcd99yyyzzz85a5";
const NOW = 1_700_000_000_000;

describe("verifySlackSignature", () => {
  const body = "token=x&team_id=T1&command=%2Frituales&text=salir";
  const ts = String(Math.floor(NOW / 1000));
  const signature = signSlackRequest(SECRET, ts, body);

  it("accepts a fresh, correctly signed request", () => {
    expect(verifySlackSignature({ signingSecret: SECRET, timestamp: ts, signature, body, now: NOW })).toBe(true);
  });
  it("rejects a wrong secret", () => {
    expect(verifySlackSignature({ signingSecret: "otro", timestamp: ts, signature, body, now: NOW })).toBe(false);
  });
  it("rejects a tampered body", () => {
    expect(verifySlackSignature({ signingSecret: SECRET, timestamp: ts, signature, body: body + "&x=1", now: NOW })).toBe(false);
  });
  it("rejects a timestamp older than five minutes (replay)", () => {
    const old = String(Math.floor(NOW / 1000) - 301);
    const sig = signSlackRequest(SECRET, old, body);
    expect(verifySlackSignature({ signingSecret: SECRET, timestamp: old, signature: sig, body, now: NOW })).toBe(false);
  });
  it("rejects missing headers", () => {
    expect(verifySlackSignature({ signingSecret: SECRET, timestamp: null, signature, body, now: NOW })).toBe(false);
    expect(verifySlackSignature({ signingSecret: SECRET, timestamp: ts, signature: null, body, now: NOW })).toBe(false);
  });
});

describe("parseSlackBody", () => {
  it("reads slash commands", () => {
    const req = parseSlackBody("application/x-www-form-urlencoded", "command=%2Frituales&text=salir&team_id=T1&user_id=U1");
    expect(req.kind).toBe("command");
    if (req.kind === "command") expect(req.command.text).toBe("salir");
  });
  it("reads interaction payloads", () => {
    const payload = encodeURIComponent(JSON.stringify({ type: "block_actions", actions: [{ action_id: "answer:g1", value: "m1" }] }));
    const req = parseSlackBody("application/x-www-form-urlencoded", `payload=${payload}`);
    expect(req.kind).toBe("interaction");
    if (req.kind === "interaction") expect((req.payload as { type: string }).type).toBe("block_actions");
  });
  it("reads JSON events", () => {
    const req = parseSlackBody("application/json", JSON.stringify({ type: "event_callback", team_id: "T1" }));
    expect(req.kind).toBe("event");
  });
  it("rejects garbage", () => {
    expect(() => parseSlackBody("application/x-www-form-urlencoded", "hola=1")).toThrow();
  });
});

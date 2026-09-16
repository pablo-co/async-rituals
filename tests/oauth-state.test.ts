import { describe, expect, it } from "vitest";
import { signState, slackAuthorizeUrl, verifyState } from "@/lib/slack/oauth";

const SECRET = "signing-secret";
const NOW = 1_700_000_000_000;

describe("OAuth state", () => {
  it("round-trips the admin user id", () => {
    const state = signState("user-1", SECRET, NOW);
    expect(verifyState(state, SECRET, NOW + 1000)).toBe("user-1");
  });
  it("expires after ten minutes", () => {
    const state = signState("user-1", SECRET, NOW);
    expect(verifyState(state, SECRET, NOW + 10 * 60 * 1000 + 1)).toBeNull();
  });
  it("rejects tampering and other secrets", () => {
    const state = signState("user-1", SECRET, NOW);
    expect(verifyState(state.replace("user-1", "user-2"), SECRET, NOW)).toBeNull();
    expect(verifyState(state, "otro", NOW)).toBeNull();
    expect(verifyState("garbage", SECRET, NOW)).toBeNull();
  });
  it("builds the authorize URL with every scope", () => {
    const url = new URL(slackAuthorizeUrl({ clientId: "123", redirectUri: "https://x/cb", state: "s" }));
    expect(url.searchParams.get("scope")).toContain("chat:write");
    expect(url.searchParams.get("scope")).toContain("commands");
    expect(url.searchParams.get("redirect_uri")).toBe("https://x/cb");
  });
});

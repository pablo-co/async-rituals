import { ErrorCode } from "@slack/web-api";
import { describe, expect, it } from "vitest";
import { mapSlackError, slackErrorCode } from "@/lib/slack/errors";

const platform = (error: string) => Object.assign(new Error(error), { code: ErrorCode.PlatformError, data: { error } });

describe("mapSlackError", () => {
  it("maps auth problems to disconnected", () => {
    expect(mapSlackError(platform("invalid_auth"))).toBe("disconnected");
    expect(mapSlackError(platform("account_inactive"))).toBe("disconnected");
    expect(mapSlackError(platform("token_revoked"))).toBe("disconnected");
  });
  it("maps channel problems to channel", () => {
    expect(mapSlackError(platform("channel_not_found"))).toBe("channel");
    expect(mapSlackError(platform("not_in_channel"))).toBe("channel");
    expect(mapSlackError(platform("is_archived"))).toBe("channel");
  });
  it("maps rate limits and http failures to transient", () => {
    expect(mapSlackError(Object.assign(new Error("rl"), { code: ErrorCode.RateLimitedError }))).toBe("transient");
    expect(mapSlackError(Object.assign(new Error("boom"), { code: ErrorCode.HTTPError }))).toBe("transient");
    expect(mapSlackError(platform("internal_error"))).toBe("transient");
  });
  it("leaves the rest as other", () => {
    expect(mapSlackError(new Error("bug propio"))).toBe("other");
    expect(mapSlackError(platform("invalid_blocks"))).toBe("other");
    expect(slackErrorCode(null)).toBeNull();
  });
});

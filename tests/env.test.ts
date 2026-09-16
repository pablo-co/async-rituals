import { describe, expect, it } from "vitest";
import { hasSlackConfig, missingEnv, REQUIRED_ENV } from "@/lib/env";

describe("missingEnv", () => {
  it("names every missing required variable", () => {
    expect(missingEnv({})).toEqual([...REQUIRED_ENV]);
  });
  it("treats blank values as missing", () => {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "   ",
      SUPABASE_SECRET_KEY: "sb_secret",
    };
    expect(missingEnv(env)).toEqual(["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);
  });
  it("is empty when everything is set", () => {
    const env = {
      NEXT_PUBLIC_SUPABASE_URL: "u",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "k",
      SUPABASE_SECRET_KEY: "s",
    };
    expect(missingEnv(env)).toEqual([]);
  });
});

describe("hasSlackConfig", () => {
  it("needs the three Slack variables", () => {
    expect(hasSlackConfig({ SLACK_CLIENT_ID: "a", SLACK_CLIENT_SECRET: "b" })).toBe(false);
    expect(
      hasSlackConfig({ SLACK_CLIENT_ID: "a", SLACK_CLIENT_SECRET: "b", SLACK_SIGNING_SECRET: "c" }),
    ).toBe(true);
  });
});

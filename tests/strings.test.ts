import { describe, expect, it } from "vitest";
import { welcomeText } from "@/lib/slack/messages/welcome";
import { clampLabel, LIMITS, strings } from "@/lib/slack/strings";

describe("bot strings", () => {
  it("welcome names the cadence days and never a time", () => {
    const text = welcomeText({ cadence_per_week: 3, paused_until: null });
    expect(text).toContain("los lunes, miércoles y viernes por la mañana");
    expect(text).toContain("/rituales salir");
    expect(text).not.toMatch(/\d{1,2}:\d{2}/);
  });
  it("welcome mentions the pause when there is one", () => {
    expect(welcomeText({ cadence_per_week: 1, paused_until: "2026-10-05" })).toContain("a partir del 5 de octubre");
  });
  it("labels never exceed Block Kit limits", () => {
    expect(clampLabel("a".repeat(200), LIMITS.button).length).toBe(LIMITS.button);
    expect(strings.header("guess_who").length).toBeLessThanOrEqual(LIMITS.header);
  });
});

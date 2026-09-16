import { describe, expect, it } from "vitest";
import { EVENT_KINDS, eventLabel, SKIP_REASON_LABELS } from "@/lib/events/labels";

describe("eventLabel", () => {
  it("has a Spanish label for every kind", () => {
    for (const kind of EVENT_KINDS) {
      const label = eventLabel(kind, { type: "trivia", reason: "paused", count: 3, until: "2026-10-01" });
      expect(label).not.toBe(kind);
      expect(label.length).toBeGreaterThan(3);
    }
  });
  it("names the template and the reason on skips", () => {
    expect(eventLabel("skipped", { type: "guess_who", reason: "featured_inactive" })).toBe(
      `Saltó Adivina quién: ${SKIP_REASON_LABELS.featured_inactive}`,
    );
  });
  it("falls back to the raw kind for unknown events", () => {
    expect(eventLabel("something_new")).toBe("something_new");
  });
});

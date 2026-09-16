import { describe, expect, it } from "vitest";
import { availableRotation } from "@/lib/games/registry";
import { pickSlotDates } from "@/lib/queue/fill";

describe("pickSlotDates", () => {
  it("skips taken dates and stops at the needed count", () => {
    const candidates = ["2026-09-16", "2026-09-18", "2026-09-21", "2026-09-23"];
    expect(pickSlotDates(candidates, new Set(["2026-09-18"]), 2)).toEqual(["2026-09-16", "2026-09-21"]);
    expect(pickSlotDates(candidates, new Set(), 0)).toEqual([]);
  });
});

describe("availableRotation", () => {
  it("starts at the index and only keeps templates that exist today", () => {
    expect(availableRotation(0)).toEqual(["guess_who"]);
    expect(availableRotation(3)).toEqual(["guess_who"]);
    expect(availableRotation(-1)).toEqual(["guess_who"]);
  });
});

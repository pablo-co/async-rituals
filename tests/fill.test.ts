import { describe, expect, it } from "vitest";
import { availableRotation } from "@/lib/games/registry";
import { pickSlotDates, preferDifferent } from "@/lib/queue/fill";

describe("pickSlotDates", () => {
  it("skips taken dates and stops at the needed count", () => {
    const candidates = ["2026-09-16", "2026-09-18", "2026-09-21", "2026-09-23"];
    expect(pickSlotDates(candidates, new Set(["2026-09-18"]), 2)).toEqual(["2026-09-16", "2026-09-21"]);
    expect(pickSlotDates(candidates, new Set(), 0)).toEqual([]);
  });
});

describe("availableRotation", () => {
  it("starts at the index and only keeps templates that exist today (two_truths waits for hito 5)", () => {
    expect(availableRotation(0)).toEqual(["guess_who", "this_or_that", "trivia", "puzzle"]);
    expect(availableRotation(2)).toEqual(["trivia", "puzzle", "guess_who", "this_or_that"]);
    expect(availableRotation(-1)).toEqual(["puzzle", "guess_who", "this_or_that", "trivia"]);
  });
});

describe("preferDifferent", () => {
  it("moves the previous slot's type to the end so material-less slots do not repeat a template", () => {
    expect(preferDifferent(["this_or_that", "trivia", "puzzle"], "this_or_that")).toEqual(["trivia", "puzzle", "this_or_that"]);
    expect(preferDifferent(["this_or_that", "trivia"], "puzzle")).toEqual(["this_or_that", "trivia"]);
    expect(preferDifferent(["trivia"], "trivia")).toEqual(["trivia"]);
    expect(preferDifferent(["trivia", "puzzle"], null)).toEqual(["trivia", "puzzle"]);
  });
});

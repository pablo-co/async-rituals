import { describe, expect, it } from "vitest";
import {
  addDays,
  cadenceLabel,
  isValidTimezone,
  isoWeekdayOf,
  localParts,
  nextSlotDates,
  slotScheduledFor,
  zonedTimeToUtc,
} from "@/lib/time";

const CDMX = "America/Mexico_City"; // UTC-6 all year since 2022
const MADRID = "Europe/Madrid"; // UTC+2 in September (CEST)

describe("localParts", () => {
  it("reads the wall clock in the team timezone", () => {
    const p = localParts(new Date("2026-09-16T16:30:00Z"), CDMX);
    expect(p).toMatchObject({ date: "2026-09-16", hour: 10, minute: 30, isoWeekday: 3 });
  });
  it("rolls the date in a timezone ahead of UTC", () => {
    const p = localParts(new Date("2026-09-16T22:30:00Z"), MADRID);
    expect(p).toMatchObject({ date: "2026-09-17", hour: 0, minute: 30, isoWeekday: 4 });
  });
});

describe("zonedTimeToUtc", () => {
  it("10:00 in CDMX is 16:00Z", () => {
    expect(zonedTimeToUtc("2026-09-16", 10, 0, CDMX).toISOString()).toBe("2026-09-16T16:00:00.000Z");
  });
  it("10:00 in Madrid (summer) is 08:00Z", () => {
    expect(zonedTimeToUtc("2026-09-16", 10, 0, MADRID).toISOString()).toBe("2026-09-16T08:00:00.000Z");
  });
  it("10:00 in Madrid (winter) is 09:00Z", () => {
    expect(zonedTimeToUtc("2026-12-16", 10, 0, MADRID).toISOString()).toBe("2026-12-16T09:00:00.000Z");
  });
  it("slotScheduledFor defaults to the post hour", () => {
    expect(slotScheduledFor("2026-09-18", CDMX).toISOString()).toBe("2026-09-18T16:00:00.000Z");
    expect(slotScheduledFor("2026-09-18", CDMX, 18).toISOString()).toBe("2026-09-19T00:00:00.000Z");
  });
});

describe("calendar helpers", () => {
  it("adds days across month ends", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("knows ISO weekdays", () => {
    expect(isoWeekdayOf("2026-09-14")).toBe(1); // Monday
    expect(isoWeekdayOf("2026-09-20")).toBe(7); // Sunday
  });
  it("labels cadences in Spanish", () => {
    expect(cadenceLabel(3)).toBe("lunes, miércoles y viernes");
    expect(cadenceLabel(1)).toBe("miércoles");
    expect(cadenceLabel(2)).toBe("martes y jueves");
  });
  it("validates IANA zones", () => {
    expect(isValidTimezone(CDMX)).toBe(true);
    expect(isValidTimezone("Marte/Olympus")).toBe(false);
  });
});

describe("nextSlotDates", () => {
  it("includes today before 10:00 local", () => {
    // Tuesday 2026-09-15, 09:00 CDMX
    const from = new Date("2026-09-15T15:00:00Z");
    expect(nextSlotDates({ from, tz: CDMX, cadence: 3, count: 3 })).toEqual([
      "2026-09-16",
      "2026-09-18",
      "2026-09-21",
    ]);
  });
  it("never today after 10:00 local", () => {
    // Wednesday 2026-09-16, 11:00 CDMX
    const from = new Date("2026-09-16T17:00:00Z");
    expect(nextSlotDates({ from, tz: CDMX, cadence: 3, count: 3 })).toEqual([
      "2026-09-18",
      "2026-09-21",
      "2026-09-23",
    ]);
  });
  it("skips the inclusive pause", () => {
    const from = new Date("2026-09-16T17:00:00Z");
    expect(
      nextSlotDates({ from, tz: CDMX, cadence: 3, count: 3, pausedUntil: "2026-09-21" }),
    ).toEqual(["2026-09-23", "2026-09-25", "2026-09-28"]);
  });
  it("never lands on weekends", () => {
    const from = new Date("2026-09-14T00:00:00Z");
    const dates = nextSlotDates({ from, tz: CDMX, cadence: 5, count: 10 });
    expect(dates.every((d) => isoWeekdayOf(d) <= 5)).toBe(true);
  });
});

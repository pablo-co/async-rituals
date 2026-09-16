import { describe, expect, it } from "vitest";
import { formatLongDate, formatSlotDate, relativeTime } from "@/lib/format";

describe("formatSlotDate", () => {
  it("prints weekday and day in Spanish", () => {
    expect(formatSlotDate("2026-09-16")).toBe("Mié 16");
    expect(formatSlotDate("2026-09-20")).toBe("Dom 20");
  });
});

describe("formatLongDate", () => {
  it("prints day and month", () => {
    expect(formatLongDate("2026-09-16")).toBe("16 de septiembre");
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-09-16T12:00:00Z");
  it("handles minutes, hours and days", () => {
    expect(relativeTime("2026-09-16T11:59:40Z", now)).toBe("hace un momento");
    expect(relativeTime("2026-09-16T11:30:00Z", now)).toBe("hace 30 min");
    expect(relativeTime("2026-09-16T09:00:00Z", now)).toBe("hace 3 h");
    expect(relativeTime("2026-09-15T12:00:00Z", now)).toBe("ayer");
    expect(relativeTime("2026-09-12T12:00:00Z", now)).toBe("hace 4 días");
  });
});

import { describe, expect, it } from "vitest";
import { gameMeta, summaryLine } from "@/lib/activity";
import type { AdminActivity, RecentGame } from "@/lib/db/types";

const activity = (extra: Partial<AdminActivity> = {}): AdminActivity => ({
  members: 7,
  onboarded: 0,
  played_this_week: 2,
  games_published: 6,
  next_slot_date: null,
  last_tick_at: null,
  recent_games: [],
  recent_events: [],
  ...extra,
});
const recent = (extra: Partial<RecentGame>): RecentGame => ({
  id: "g1",
  type: "trivia",
  slot_date: "2026-09-24",
  status: "revealed",
  skip_reason: null,
  answers: 2,
  correct: 1,
  ...extra,
});

describe("Actividad texts", () => {
  it("does not show an onboarding count before anyone answered it", () => {
    expect(summaryLine(activity())).toBe("6 juegos publicados · 7 personas en el ritual");
    expect(summaryLine(activity({ games_published: 1, members: 1 }))).toBe("1 juego publicado · 1 persona en el ritual");
    expect(summaryLine(activity({ onboarded: 3 }))).toBe(
      "6 juegos publicados · 7 personas en el ritual · 3 de 7 contestaron «Cuéntanos de ti»",
    );
  });

  it("uses singular and plural, and never says acertaron for esto o aquello or before the reveal", () => {
    expect(gameMeta(recent({}))).toBe("Jue 24 · 2 respuestas · 1 acertó");
    expect(gameMeta(recent({ answers: 1, correct: 0 }))).toBe("Jue 24 · 1 respuesta · 0 acertaron");
    expect(gameMeta(recent({ type: "this_or_that", answers: 5, correct: 0 }))).toBe("Jue 24 · 5 respuestas");
    expect(gameMeta(recent({ status: "posted", answers: 1, correct: 0 }))).toBe("Jue 24 · 1 respuesta");
    expect(gameMeta(recent({ status: "skipped", answers: 0 }))).toBe("Jue 24 · saltado");
  });
});

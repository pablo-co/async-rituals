import { describe, expect, it } from "vitest";
import type { GameAdmin, TeamRow } from "@/lib/db/types";
import { fillTeam } from "@/lib/queue/fill";
import {
  activePause,
  checkPauseDate,
  nextWeekTarget,
  pendingGames,
  vetoBody,
  vetoGame,
  vetoTitle,
  visibleQueue,
} from "@/lib/queue/manage";
import { toastText, withoutToast } from "@/lib/toasts";
import { FakeDb } from "./helpers/fake-db";
import { game, team } from "./helpers/fixtures";

const row = (extra: Partial<GameAdmin>): GameAdmin => ({
  id: "g",
  team_id: "t1",
  type: "trivia",
  status: "queued",
  skip_reason: null,
  slot_date: "2026-09-30",
  scheduled_for: "2026-09-30T16:00:00Z",
  is_sample: false,
  preview: "Trivia de capitales",
  created_at: "",
  ...extra,
});

describe("veto", () => {
  it("only vetoes the admin's own game while it is still queued", async () => {
    const db = new FakeDb({
      teams: [team()],
      games: [game({ id: "q", status: "queued" }), game({ id: "p", status: "posted", slot_date: "2026-09-17" })],
    });
    expect(await vetoGame(db.client(), "t1", "q")).toBe("guess_who");
    expect(db.find("games", "q").status).toBe("vetoed");
    expect(await vetoGame(db.client(), "t1", "p")).toBeNull();
    expect(db.find("games", "p").status).toBe("posted");
    expect(await vetoGame(db.client(), "t2", "q")).toBeNull();
  });

  it("names the question when the admin may see it, and the template and day when it is hidden", () => {
    expect(vetoTitle(row({}))).toBe("¿Vetar «Trivia de capitales»?");
    expect(vetoTitle(row({ type: "guess_who", preview: null }))).toBe("¿Vetar el Adivina quién del 30 de septiembre?");
    expect(vetoTitle(row({ type: "recap", preview: null, slot_date: "2026-10-02" }))).toBe("¿Vetar el Recap de la semana del 2 de octubre?");
    expect(vetoBody(row({}))).toBe("Se quita de la cola. El siguiente relleno pone otro juego ese día.");
    expect(vetoBody(row({ type: "recap", slot_date: "2026-10-02" }))).toBe("Ese viernes (2 de octubre) no sale el recap.");
  });

  it("shows 'por rellenar' only until a new game takes the date, and counts pending games without recaps", () => {
    const vetoed = row({ id: "v", status: "vetoed" });
    const refill = row({ id: "n", slot_date: "2026-09-30" });
    const recap = row({ id: "r", type: "recap", slot_date: "2026-10-02", preview: null });
    const vetoedRecap = row({ id: "vr", type: "recap", status: "vetoed", slot_date: "2026-10-09", preview: null });
    expect(visibleQueue([vetoed, recap]).map((g) => g.id)).toEqual(["v", "r"]);
    expect(visibleQueue([vetoed, refill, recap, vetoedRecap]).map((g) => g.id)).toEqual(["n", "r", "vr"]);
    expect(pendingGames([vetoed, refill, recap])).toBe(1);
  });

  it("asks for one more week of the cadence, never more than 10", () => {
    expect(nextWeekTarget(4, 3)).toBe(8);
    expect(nextWeekTarget(8, 3)).toBe(10);
    expect(nextWeekTarget(9, 5)).toBe(10);
  });
});

describe("pause dates", () => {
  const today = "2026-09-28";
  it("accepts today up to 90 days ahead, inclusive", () => {
    expect(checkPauseDate("2026-09-28", today)).toEqual({ until: "2026-09-28" });
    expect(checkPauseDate("2026-12-27", today)).toEqual({ until: "2026-12-27" });
    expect(checkPauseDate("2026-12-28", today)).toEqual({ error: "pause_long" });
    expect(checkPauseDate("2026-09-27", today)).toEqual({ error: "pause_past" });
    expect(checkPauseDate("", today)).toEqual({ error: "pause_date" });
    expect(checkPauseDate("mañana", today)).toEqual({ error: "pause_date" });
  });
  it("an expired pause is no pause", () => {
    expect(activePause("2026-09-28", today)).toBe("2026-09-28");
    expect(activePause("2026-09-27", today)).toBeNull();
    expect(activePause(null, today)).toBeNull();
  });
});

describe("toasts", () => {
  it("says what was done, in Spanish", () => {
    expect(toastText({ toast: "saved", next: "miércoles" })).toBe("Guardado. El próximo juego sale el miércoles por la mañana.");
    expect(toastText({ toast: "published", channel: "rituales-bot" })).toBe("Publicado en #rituales-bot.");
    expect(toastText({ toast: "paused", until: "2026-10-05" })).toBe("Pausado hasta el 5 de octubre.");
    expect(toastText({ toast: "unpaused" })).toBe("Pausa quitada.");
    expect(toastText({ toast: "vetoed" })).toBe("Vetado. Se rellena en la próxima generación.");
    expect(toastText({ toast: "nope" })).toBeNull();
  });
  it("removes only its own keys from the address", () => {
    expect(withoutToast("/cola", "toast=saved&next=lunes&generating=1")).toBe("/cola?generating=1");
    expect(withoutToast("/conectar", "toast=unpaused")).toBe("/conectar");
    expect(withoutToast("/cola", "generating=1")).toBeNull();
  });
});

describe("fillTeam", () => {
  it("fills up to a custom target and reports the turns that had no material", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const db = new FakeDb({ teams: [team({ cadence_per_week: 5 })] });
    const now = new Date("2026-09-28T15:00:00Z"); // Monday 09:00 CDMX
    const result = await fillTeam(db.client(), db.find<TeamRow>("teams", "t1"), now, undefined, { target: 10 });
    expect(result.created).toBe(10);
    expect(db.table("games").filter((g) => g.type !== "recap")).toHaveLength(10);
    expect(result.missing.map((m) => m.type)).toEqual(expect.arrayContaining(["guess_who", "two_truths"]));
    expect(result.failures).toBe(0);
  });
});

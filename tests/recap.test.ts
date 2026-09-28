import { describe, expect, it } from "vitest";
import type { GameRow, TeamRow } from "@/lib/db/types";
import { TemplateError } from "@/lib/errors";
import { recap, recapLines, topRows, type RecapData, type WeekMoment } from "@/lib/games/recap";
import { ensureRecaps } from "@/lib/queue/fill";
import { FakeDb } from "./helpers/fake-db";
import { blockTypes, game, member, team } from "./helpers/fixtures";

const members = [member("m1", "Ana"), member("m2", "Beto"), member("m3", "Luis"), member("m4", "Dana"), member("m5", "<Eva>")];

const week = (extra: Partial<RecapData> = {}): RecapData => ({
  week_start: "2026-09-14",
  week_end: "2026-09-18",
  revealed: 3,
  played: 4,
  members: 5,
  top: [
    { member_id: "m1", points: 12 },
    { member_id: "m2", points: 9 },
    { member_id: "m3", points: 7 },
  ],
  streak: 6,
  streak_member_ids: ["m2"],
  ...extra,
});
const moment = (extra: Partial<WeekMoment> = {}): WeekMoment => ({
  game_id: "g1",
  type: "guess_who",
  member_id: "m4",
  text: "quedarse encerrada en un IKEA",
  fooled: 4,
  total: 5,
  ...extra,
});

describe("recap lines (D-1A fixed order)", () => {
  it("moment, longest streak, top 3 of the week, then who played", () => {
    expect(recapLines(week(), moment(), members)).toEqual([
      "*Momento de la semana:* «quedarse encerrada en un IKEA» era de Dana, que engañó a 4 de 5.",
      "*Racha más larga:* Beto, 6 juegos seguidos.",
      "*Puntos de la semana:* Ana 12 · Beto 9 · Luis 7.",
      "4 de 5 jugaron esta semana.",
    ]);
  });

  it("uses the lie for dos verdades and never names someone who is gone", () => {
    const lie = recapLines(week(), moment({ type: "two_truths", text: "nadé con tiburones" }), members)[0];
    expect(lie).toBe("*Momento de la semana:* la mentira de Dana, «nadé con tiburones», engañó a 4 de 5.");
    const gone = recapLines(week(), moment({ member_id: "m9" }), members);
    expect(gone[0]).toMatch(/^\*Racha/);
  });

  it("skips the moment when nobody was fooled, and short streaks", () => {
    const lines = recapLines(week({ streak: 1 }), moment({ fooled: 0 }), members);
    expect(lines).toEqual(["*Puntos de la semana:* Ana 12 · Beto 9 · Luis 7.", "4 de 5 jugaron esta semana."]);
  });

  it("names every tie for the longest streak, sorted", () => {
    expect(recapLines(week({ streak_member_ids: ["m3", "m1"] }), null, members)[0]).toBe(
      "*Racha más larga:* Ana y Luis, 6 juegos seguidos.",
    );
  });

  it("keeps whoever ties with third place, up to five names, and escapes names and facts", () => {
    const tied = week({
      top: [
        { member_id: "m1", points: 9 },
        { member_id: "m2", points: 7 },
        { member_id: "m3", points: 5 },
        { member_id: "m4", points: 5 },
        { member_id: "m5", points: 3 },
      ],
    });
    expect(topRows(tied, members).map((r) => r.name)).toEqual(["Ana", "Beto", "Luis", "Dana"]);
    const lines = recapLines(week({ top: [{ member_id: "m5", points: 3 }] }), moment({ text: "<b>x</b>" }), members);
    expect(lines[0]).toContain("«&lt;b&gt;x&lt;/b&gt;»");
    expect(lines[2]).toBe("*Puntos de la semana:* &lt;Eva&gt; 3.");
  });
});

describe("recap template", () => {
  const recapGame = () => game({ id: "r1", type: "recap", status: "posting", payload: {}, slot_date: "2026-09-18" });
  const ctx = (db: FakeDb) => ({ db: db.client(), team: team(), now: new Date("2026-09-19T00:30:00Z") });

  it("asks for the Monday-to-Friday week and posts a header plus one section", async () => {
    const db = new FakeDb();
    const calls: unknown[] = [];
    db.rpcs.recap_data = (args) => {
      calls.push(args);
      return week();
    };
    db.rpcs.week_moment = (args) => {
      calls.push(args);
      return moment();
    };
    const post = await recap.render(ctx(db), recapGame(), members);
    expect(calls).toEqual([
      { p_team_id: "t1", p_week_start: "2026-09-14" },
      { p_team_id: "t1", p_from: "2026-09-14", p_to: "2026-09-18" },
    ]);
    expect(blockTypes(post.blocks)).toEqual(["header", "section"]);
    expect(JSON.stringify(post.blocks)).toContain("Recap de la semana");
    expect(post.text).toBe("Recap de la semana: 4 de 5 jugaron.");
  });

  it("does not post a week without revealed games", async () => {
    const db = new FakeDb();
    db.rpcs.recap_data = () => week({ revealed: 0 });
    const error = await recap.render(ctx(db), recapGame(), members).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TemplateError);
    expect((error as TemplateError).code).toBe("no_answers");
  });

  it("posts without the moment when that query fails, and logs it", async () => {
    const db = new FakeDb();
    db.rpcs.recap_data = () => week();
    db.rpcs.week_moment = () => {
      throw new Error("boom");
    };
    const post = await recap.render(ctx(db), recapGame(), members);
    expect(JSON.stringify(post.blocks)).not.toContain("Momento");
    expect(JSON.stringify(post.blocks)).toContain("Racha más larga");
    expect(db.events("decoration_failed")[0].detail).toMatchObject({ line: "week_moment" });
  });
});

describe("ensureRecaps", () => {
  const WEDNESDAY_NOON = new Date("2026-09-16T18:00:00Z"); // 12:00 CDMX
  const FRIDAY_NIGHT = new Date("2026-09-19T02:30:00Z"); // Friday 20:30 CDMX: this week's recap window is over
  const setupDb = (extra: Partial<TeamRow> = {}) => {
    const db = new FakeDb({ teams: [team(extra)] });
    return { db, team: db.find<TeamRow>("teams", "t1") };
  };
  const recaps = (db: FakeDb) =>
    db
      .table("games")
      .filter((g) => g.type === "recap")
      .map((g) => [g.slot_date, g.scheduled_for]);

  it("queues this Friday and next at 18:00 local, once", async () => {
    const { db, team: t } = setupDb();
    expect(await ensureRecaps(db.client(), t, WEDNESDAY_NOON)).toBe(2);
    expect(await ensureRecaps(db.client(), t, WEDNESDAY_NOON)).toBe(0);
    expect(recaps(db)).toEqual([
      ["2026-09-18", "2026-09-19T00:00:00.000Z"],
      ["2026-09-25", "2026-09-26T00:00:00.000Z"],
    ]);
  });

  it("never recreates a recap that was vetoed or skipped", async () => {
    const { db, team: t } = setupDb();
    db.add("games", game({ id: "r1", type: "recap", status: "vetoed", slot_date: "2026-09-18" }) as GameRow);
    expect(await ensureRecaps(db.client(), t, WEDNESDAY_NOON)).toBe(1);
    expect(db.table("games").filter((g) => g.slot_date === "2026-09-18")).toHaveLength(1);
  });

  it("leaves out Fridays already past their window or inside a pause", async () => {
    const late = setupDb();
    await ensureRecaps(late.db.client(), late.team, FRIDAY_NIGHT);
    expect(recaps(late.db).map(([d]) => d)).toEqual(["2026-09-25", "2026-10-02"]);

    const paused = setupDb({ paused_until: "2026-09-21" });
    await ensureRecaps(paused.db.client(), paused.team, WEDNESDAY_NOON);
    expect(recaps(paused.db).map(([d]) => d)).toEqual(["2026-09-25"]);
  });

  it("does nothing for a team without a channel or disconnected", async () => {
    const none = setupDb({ channel_id: null });
    const gone = setupDb({ disconnected_at: "2026-09-15T00:00:00Z" });
    expect(await ensureRecaps(none.db.client(), none.team, WEDNESDAY_NOON)).toBe(0);
    expect(await ensureRecaps(gone.db.client(), gone.team, WEDNESDAY_NOON)).toBe(0);
  });
});

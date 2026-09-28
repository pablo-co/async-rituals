import { describe, expect, it } from "vitest";
import { milestoneGroups, streakMilestoneLine } from "@/lib/scores";
import { strings } from "@/lib/slack/strings";
import { FakeDb } from "./helpers/fake-db";
import { answer, game, member } from "./helpers/fixtures";

const members = [
  member("m1", "Ana"),
  member("m2", "Beto"),
  member("m3", "Luis"),
  member("m4", "Dana"),
  member("m5", "Eva"),
  member("m6", "Fer", { opted_out: true }),
];

describe("streak milestones", () => {
  it("counts the game being revealed and groups everyone who lands exactly on 5, 10 or 25", () => {
    const streaks = new Map([
      ["m1", 4],
      ["m2", 9],
      ["m3", 4],
      ["m4", 24],
      ["m5", 5], // already past 5: 6 is not a milestone
      ["m6", 4], // opted out: never named
    ]);
    const answers = ["m1", "m2", "m3", "m4", "m5", "m6"].map((m, i) => answer(`a${i}`, "g1", m, "0"));
    const groups = milestoneGroups(answers, streaks, members);
    expect(groups).toEqual([
      { count: 25, names: ["Dana"] },
      { count: 10, names: ["Beto"] },
      { count: 5, names: ["Ana", "Luis"] },
    ]);
    expect(strings.streakMilestones(groups)).toBe("Dana: 25 seguidos · Beto: 10 seguidos · Ana y Luis: 5 seguidos");
  });

  it("escapes names and reads streaks from the database, not counting the game being revealed", async () => {
    const db = new FakeDb({
      teams: [],
      members: [member("m1", "<Ana>"), member("m2", "Beto")],
      games: Array.from({ length: 4 }, (_, i) =>
        game({
          id: `p${i}`,
          type: "trivia",
          status: "revealed",
          payload: {},
          slot_date: `2026-09-1${i}`,
          posted_at: `2026-09-1${i}T16:00:00Z`,
        }),
      ),
    });
    for (let i = 0; i < 4; i += 1) db.add("answers", answer(`x${i}`, `p${i}`, "m1", "0"));
    const current = [answer("c1", "g1", "m1", "0"), answer("c2", "g1", "m2", "0")];
    expect(await streakMilestoneLine(db.client(), "t1", current, db.table("members") as never)).toBe("&lt;Ana&gt;: 5 seguidos");
    expect(await streakMilestoneLine(db.client(), "t1", [], [])).toBeNull();
  });

  it("does not count games where the person was the protagonist, and a missed game resets the streak", async () => {
    const revealed = (id: string, day: string, extra = {}) =>
      game({ id, type: "guess_who", status: "revealed", slot_date: day, posted_at: `${day}T16:00:00Z`, ...extra });
    const db = new FakeDb({
      members: [member("m1", "Ana"), member("m2", "Beto")],
      games: [
        revealed("old", "2026-09-10", { payload: {} }),
        revealed("mine", "2026-09-11", { payload: { featured_member_id: "m1" } }),
        revealed("new", "2026-09-14", { payload: {} }),
        game({ id: "skip", status: "skipped", slot_date: "2026-09-15", payload: {} }),
      ],
    });
    db.add("answers", answer("a1", "old", "m1", "0"), answer("a2", "new", "m1", "0"), answer("a3", "mine", "m2", "0"));
    const { data } = await db.client().rpc("member_streaks", { p_team_id: "t1" });
    expect(data).toEqual([
      { member_id: "m1", streak: 2 }, // "mine" is skipped over, the skipped game does not break it
      { member_id: "m2", streak: 0 }, // missed the latest one
    ]);
  });
});

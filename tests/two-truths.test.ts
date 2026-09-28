import { describe, expect, it } from "vitest";
import type { AnswerRow, TeamRow } from "@/lib/db/types";
import { TemplateError } from "@/lib/errors";
import { twoTruths } from "@/lib/games/two-truths";
import { FakeDb } from "./helpers/fake-db";
import { blockTypes, fact, game, member, team } from "./helpers/fixtures";

const ctx = { db: {} as never, team: {} as never, now: new Date("2026-09-16T16:00:00Z") };
const ttGame = (extra = {}) =>
  game({
    type: "two_truths",
    status: "posting",
    payload: { fact_id: "f1", featured_member_id: "m1", statements: ["nadé con tiburones", "hablo <3> idiomas", "nunca he visto el mar"], lie_index: 2 },
    ...extra,
  });
const members = [member("m1", "Pablo"), member("m2", "Ana"), member("m3", "Luis")];
const pick = (id: string, memberId: string, choice: string): AnswerRow => ({
  id,
  game_id: "g1",
  member_id: memberId,
  value: { choice },
  correct_count: null,
  created_at: "",
  updated_at: "",
});

describe("dos verdades", () => {
  it("names the author, numbers the three sentences (escaped) and offers buttons 1, 2, 3", async () => {
    const post = await twoTruths.render(ctx, ttGame(), members);
    expect(blockTypes(post.blocks)).toEqual(["header", "section", "actions", "context"]);
    const text = JSON.stringify(post.blocks[1]);
    expect(text).toContain("Pablo nos cuenta tres cosas. Una es mentira");
    expect(text).toContain("*2.* hablo &lt;3&gt; idiomas");
    const buttons = (post.blocks[2] as { elements: { text: { text: string }; value: string; action_id: string }[] }).elements;
    expect(buttons.map((b) => [b.text.text, b.value, b.action_id])).toEqual([
      ["1", "0", "answer:g1:0"],
      ["2", "1", "answer:g1:1"],
      ["3", "2", "answer:g1:2"],
    ]);
  });

  it("is skipped when the author left, or when nobody else can guess", async () => {
    const gone = [member("m1", "Pablo", { opted_out: true }), member("m2", "Ana")];
    await expect(twoTruths.render(ctx, ttGame(), gone)).rejects.toMatchObject({ code: "featured_inactive" });
    const alone = twoTruths.render(ctx, ttGame(), [member("m1", "Pablo")]);
    await expect(alone).rejects.toBeInstanceOf(TemplateError);
    await expect(alone).rejects.toMatchObject({ code: "template_error" });
  });

  it("scores the lie, reveals it, and credits the author per person fooled", () => {
    const answers = [pick("a1", "m2", "2"), pick("a2", "m3", "0")];
    const scores = twoTruths.score(ttGame(), answers);
    expect([...scores.values()]).toEqual([1, 0]);
    const out = twoTruths.reveal({ game: ttGame(), answers, members, scores });
    expect(JSON.stringify(out.blocks)).toContain("La mentira era: «nunca he visto el mar».");
    expect(blockTypes(out.blocks)).toEqual(["header", "section", "context"]);
    expect(out.thread).toBe("Le atinaron Ana (+2 para Ana). Pablo engañó a 1 (+1). Pablo, ¿nos cuentas?");
  });

  it("closes without buttons and labels the pick with the sentence itself", () => {
    expect(blockTypes(twoTruths.closed(ttGame(), members).blocks)).toEqual(["header", "section"]);
    expect(twoTruths.labelFor!(ttGame(), "1")).toBe("«hablo <3> idiomas»");
    expect(twoTruths.labelFor!(ttGame(), "7")).toBeNull();
  });

  it("generates from an unused two-truths fact of an active member, never one already in the queue", async () => {
    const db = new FakeDb({
      teams: [team()],
      members: [member("m1", "Pablo"), member("m2", "Ana", { opted_out: true })],
      facts: [
        fact("tt1", "m1", "", { kind: "two_truths", payload: { statements: ["a", "b", "c"], lie_index: 1 } }),
        fact("tt2", "m1", "", { kind: "two_truths", payload: { statements: ["d", "e", "f"], lie_index: 0 } }),
        fact("tt3", "m2", "", { kind: "two_truths", payload: { statements: ["g", "h", "i"], lie_index: 0 } }),
        fact("f1", "m1", "repartir periódicos"),
      ],
      games: [ttGame({ status: "queued", payload: { fact_id: "tt1", featured_member_id: "m1", statements: ["a", "b", "c"], lie_index: 1 } })],
    });
    const out = await twoTruths.generate({ db: db.client(), team: db.find<TeamRow>("teams", "t1"), now: ctx.now }, { slotDate: "2026-09-18" });
    expect(out).toMatchObject({ type: "two_truths", payload: { fact_id: "tt2", featured_member_id: "m1", statements: ["d", "e", "f"], lie_index: 0 } });
    expect(out!.contentHash).toMatch(/^[0-9a-f]{64}$/);

    db.find("facts", "tt2").used_at = "2026-09-17T00:00:00Z";
    expect(await twoTruths.generate({ db: db.client(), team: db.find<TeamRow>("teams", "t1"), now: ctx.now }, { slotDate: "2026-09-18" })).toBeNull();
  });
});

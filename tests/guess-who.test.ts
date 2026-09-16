import { describe, expect, it } from "vitest";
import type { AnswerRow, GameRow, MemberRow } from "@/lib/db/types";
import { TemplateError } from "@/lib/errors";
import { guessWho } from "@/lib/games/guess-who";
import { contentHash } from "@/lib/games/template";

const member = (id: string, name: string, extra: Partial<MemberRow> = {}): MemberRow => ({
  id,
  team_id: "t1",
  slack_user_id: `U${id}`,
  display_name: name,
  onboarding_done: true,
  opted_out: false,
  left_at: null,
  created_at: "",
  updated_at: "",
  ...extra,
});

const game = (extra: Partial<GameRow> = {}): GameRow => ({
  id: "g1",
  team_id: "t1",
  type: "guess_who",
  status: "posting",
  skip_reason: null,
  payload: { fact_id: "f1", featured_member_id: "m1", question_key: "first_job", text: "repartir periódicos <!channel>" },
  slot_date: "2026-09-16",
  scheduled_for: "2026-09-16T16:00:00Z",
  post_attempted_at: null,
  posted_at: null,
  slack_channel_id: "C1",
  slack_ts: "1.1",
  revealed_thread_ts: null,
  content_hash: null,
  is_sample: false,
  created_at: "",
  updated_at: "",
  ...extra,
});

const answer = (id: string, memberId: string, choice: string): AnswerRow => ({
  id,
  game_id: "g1",
  member_id: memberId,
  value: { choice },
  correct_count: null,
  created_at: "",
  updated_at: "",
});

const ctx = { db: {} as never, team: {} as never, now: new Date("2026-09-16T16:00:00Z") };

describe("guess-who render", () => {
  it("shows buttons for everyone but the featured member, with the text escaped", async () => {
    const members = [member("m1", "Pablo"), member("m2", "Ana"), member("m3", "Luis"), member("m4", "Zoe", { opted_out: true })];
    const post = await guessWho.render(ctx, game(), members);
    const actions = post.blocks.find((b) => b.type === "actions") as { elements: { text: { text: string }; value: string }[] };
    expect(actions.elements.map((e) => e.text.text)).toEqual(["Ana", "Luis"]);
    const section = post.blocks.find((b) => b.type === "section") as { text: { text: string } };
    expect(section.text.text).toContain("El primer trabajo de alguien aquí fue: repartir periódicos &lt;!channel&gt;");
    expect(section.text.text).not.toContain("<!channel>");
    expect(post.blocks.map((b) => b.type)).toEqual(["header", "section", "actions", "context"]);
  });

  it("switches to a select with more than six options", async () => {
    const members = [member("m1", "Pablo"), ...Array.from({ length: 7 }, (_, i) => member(`x${i}`, `Persona ${i}`))];
    const post = await guessWho.render(ctx, game(), members);
    const actions = post.blocks.find((b) => b.type === "actions") as { elements: { type: string; options: unknown[] }[] };
    expect(actions.elements[0].type).toBe("static_select");
    expect(actions.elements[0].options).toHaveLength(7);
  });

  it("adds the resumed line after a pause", async () => {
    const post = await guessWho.render(ctx, game({ payload: { ...game().payload, resumed: true } }), [member("m1", "Pablo"), member("m2", "Ana")]);
    expect(post.blocks.at(-1)).toMatchObject({ type: "context" });
    expect(JSON.stringify(post.blocks.at(-1))).toContain("Ya volvimos.");
  });

  it("refuses when the featured member left", async () => {
    const members = [member("m1", "Pablo", { left_at: "2026-09-10T00:00:00Z" }), member("m2", "Ana")];
    await expect(guessWho.render(ctx, game(), members)).rejects.toMatchObject({ code: "featured_inactive" });
    await expect(guessWho.render(ctx, game(), members)).rejects.toBeInstanceOf(TemplateError);
  });
});

describe("guess-who score and reveal", () => {
  const members = [member("m1", "Pablo"), member("m2", "Ana"), member("m3", "Luis"), member("m4", "Sofi")];
  const answers = [answer("a1", "m2", "m1"), answer("a2", "m3", "m4"), answer("a3", "m4", "m1")];

  it("scores 1 for the featured member, 0 otherwise", () => {
    const scores = guessWho.score(game(), answers);
    expect([...scores.values()]).toEqual([1, 0, 1]);
  });

  it("writes the reveal without buttons and a thread with winners and bonus", () => {
    const scores = guessWho.score(game(), answers);
    const out = guessWho.reveal({ game: game(), answers, members, scores });
    expect(out.blocks.map((b) => b.type)).toEqual(["header", "section", "context"]);
    expect(JSON.stringify(out.blocks)).toContain("Era *Pablo*.");
    expect(JSON.stringify(out.blocks)).toContain("Cerrado · 3 de 3 jugaron");
    expect(out.thread).toBe("Le atinaron Ana y Sofi (+2 cada quien). Pablo engañó a 1 (+1). Pablo, ¿nos cuentas?");
  });

  it("never says who did not play when nobody answered", () => {
    const out = guessWho.closed(game(), members);
    expect(JSON.stringify(out.blocks)).toContain("Este juego cerró.");
    expect(JSON.stringify(out.blocks)).not.toContain("nadie jugó");
  });
});

describe("contentHash", () => {
  it("ignores case, accents and punctuation", () => {
    expect(contentHash("¿Café o té?")).toBe(contentHash("cafe o te"));
    expect(contentHash("uno")).not.toBe(contentHash("dos"));
  });
});

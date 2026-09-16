import { describe, expect, it } from "vitest";
import { thisOrThat } from "@/lib/games/this-or-that";
import { answer, blockTypes, game, member } from "./helpers/fixtures";

const ctx = { db: {} as never, team: {} as never, now: new Date("2026-09-16T16:00:00Z") };
const tot = () =>
  game({
    type: "this_or_that",
    payload: {
      preview: "¿Café o té <b>?",
      question: "¿Café o té <b>?",
      options: ["Café", "Té"],
      quips: ["Los del café: con prisa, pero con cariño.", "Los del té: tranquilos, no es competencia."],
    },
  });
const members = [member("m1", "Pablo"), member("m2", "Ana"), member("m3", "Luis")];

describe("this or that", () => {
  it("renders two buttons whose values are the option indexes, with the question escaped", async () => {
    const post = await thisOrThat.render(ctx, tot(), members);
    expect(blockTypes(post.blocks)).toEqual(["header", "section", "actions", "context"]);
    const actions = post.blocks[2] as { elements: { text: { text: string }; value: string; action_id: string }[] };
    expect(actions.elements.map((e) => [e.text.text, e.value, e.action_id])).toEqual([
      ["Café", "0", "answer:g1"],
      ["Té", "1", "answer:g1"],
    ]);
    expect(JSON.stringify(post.blocks[1])).toContain("&lt;b&gt;");
  });

  it("labels the ack with the option text", () => {
    expect(thisOrThat.labelFor?.(tot(), "1")).toBe("Té");
    expect(thisOrThat.labelFor?.(tot(), "7")).toBeNull();
  });

  it("scores nothing (no right answer) and reveals the split plus the minority quip", () => {
    const answers = [answer("a1", "g1", "m1", "0"), answer("a2", "g1", "m2", "0"), answer("a3", "g1", "m3", "1")];
    const scores = thisOrThat.score(tot(), answers);
    expect([...scores.values()]).toEqual([null, null, null]);
    const out = thisOrThat.reveal({ game: tot(), answers, members, scores });
    expect(blockTypes(out.blocks)).toEqual(["header", "section", "context"]);
    expect(JSON.stringify(out.blocks)).toContain("Café: 2 · Té: 1.");
    expect(JSON.stringify(out.blocks)).toContain("Cerrado · 3 de 3 jugaron");
    expect(out.thread).toBe("Los del té: tranquilos, no es competencia.");
  });

  it("gives side A the quip on a tie", () => {
    const answers = [answer("a1", "g1", "m1", "0"), answer("a3", "g1", "m3", "1")];
    const out = thisOrThat.reveal({ game: tot(), answers, members, scores: thisOrThat.score(tot(), answers) });
    expect(out.thread).toBe("Los del café: con prisa, pero con cariño.");
  });

  it("closes without buttons when nobody played", () => {
    const out = thisOrThat.closed(tot(), members);
    expect(blockTypes(out.blocks)).toEqual(["header", "section"]);
    expect(JSON.stringify(out.blocks)).toContain("Este juego cerró.");
  });
});

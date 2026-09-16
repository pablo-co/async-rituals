import { describe, expect, it } from "vitest";
import type { AnswerRow } from "@/lib/db/types";
import { isAccepted, normalizeAnswer, puzzle } from "@/lib/games/puzzle";
import { blockTypes, game, member } from "./helpers/fixtures";

const ctx = { db: {} as never, team: {} as never, now: new Date("2026-09-16T16:00:00Z") };
const puzzleGame = () =>
  game({
    type: "puzzle",
    payload: {
      preview: "Tengo agujas y no coso. ¿Qué soy?",
      prompt: "Tengo agujas y no coso. ¿Qué soy?",
      answer: "Un reloj",
      accepted_answers: ["reloj", "el reloj", "relojes", "clock"],
    },
  });
const members = [member("m1", "Pablo"), member("m2", "Ana"), member("m3", "Luis")];
const reply = (id: string, memberId: string, text: string): AnswerRow => ({
  id,
  game_id: "g1",
  member_id: memberId,
  value: { text },
  correct_count: null,
  created_at: "",
  updated_at: "",
});

describe("normalizeAnswer", () => {
  it("ignores case, accents, punctuation, spacing and a leading article", () => {
    expect(normalizeAnswer("  El  Relój!! ")).toBe("reloj");
    expect(normalizeAnswer("un reloj")).toBe("reloj");
    expect(normalizeAnswer("The Clock")).toBe("clock");
    expect(normalizeAnswer("¿reloj?")).toBe("reloj");
    expect(normalizeAnswer("")).toBe("");
  });

  it("accepts the main answer and any variant, never an empty answer", () => {
    expect(isAccepted("RELOJ", ["el reloj"], "Un reloj")).toBe(true);
    expect(isAccepted("los relojes", ["relojes"], "Un reloj")).toBe(true);
    expect(isAccepted("brújula", ["reloj"], "Un reloj")).toBe(false);
    expect(isAccepted("   ", ["reloj"], "Un reloj")).toBe(false);
  });
});

describe("puzzle", () => {
  it("renders the riddle and a Jugar button", async () => {
    const post = await puzzle.render(ctx, puzzleGame(), members);
    expect(blockTypes(post.blocks)).toEqual(["header", "section", "actions", "context"]);
    const actions = post.blocks[2] as { elements: { action_id: string }[] };
    expect(actions.elements[0].action_id).toBe("play:g1");
    expect(JSON.stringify(post.blocks)).not.toContain("reloj");
  });

  it("scores 1 for an accepted answer and 0 otherwise", () => {
    const answers = [reply("a1", "m1", "El reloj"), reply("a2", "m2", "una brújula"), reply("a3", "m3", "clock")];
    expect([...puzzle.score(puzzleGame(), answers).values()]).toEqual([1, 0, 1]);
  });

  it("reveals the answer and who solved it", () => {
    const answers = [reply("a1", "m1", "El reloj"), reply("a2", "m2", "una brújula")];
    const out = puzzle.reveal({ game: puzzleGame(), answers, members, scores: puzzle.score(puzzleGame(), answers) });
    expect(JSON.stringify(out.blocks)).toContain("La respuesta era: *Un reloj*.");
    expect(out.thread).toBe("Lo resolvieron Pablo (+2).");
    const nobody = puzzle.reveal({ game: puzzleGame(), answers: [answers[1]], members, scores: puzzle.score(puzzleGame(), [answers[1]]) });
    expect(nobody.thread).toBe("Nadie lo resolvió esta vez.");
  });

  it("closes without the button when nobody played", () => {
    const out = puzzle.closed(puzzleGame(), members);
    expect(blockTypes(out.blocks)).toEqual(["header", "section"]);
  });
});

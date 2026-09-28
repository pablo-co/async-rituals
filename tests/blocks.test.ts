import { describe, expect, it } from "vitest";
import type { GameRow } from "@/lib/db/types";
import { TEMPLATES } from "@/lib/games/registry";
import type { GameType } from "@/lib/games/types";
import { answerButtons, answerGameId } from "@/lib/slack/blocks";
import { game, member } from "./helpers/fixtures";

const ctx = { db: {} as never, team: {} as never, now: new Date("2026-09-16T16:00:00Z") };

/** One realistic game per template, so every renderer goes through the same Slack rules. */
const GAMES: Partial<Record<GameType, Partial<GameRow>>> = {
  guess_who: { type: "guess_who" },
  two_truths: {
    type: "two_truths",
    payload: { fact_id: "f1", featured_member_id: "m1", statements: ["a", "b", "c"], lie_index: 1 },
  },
  this_or_that: {
    type: "this_or_that",
    payload: { preview: "¿Café o té?", question: "¿Café o té?", options: ["Café", "Té"], quips: ["a", "b"] },
  },
  trivia: {
    type: "trivia",
    payload: {
      preview: "Trivia",
      title: "Trivia",
      questions: [{ q: "¿A?", options: ["a", "b", "c"], correct: 0 }],
    },
  },
  puzzle: { type: "puzzle", payload: { preview: "¿Qué soy?", prompt: "¿Qué soy?", answer: "reloj", accepted_answers: ["reloj"] } },
};

describe("Slack block rules", () => {
  it("answer buttons get one action_id each, and the game id comes back out of it", () => {
    const block = answerButtons("answer:g1", "answer:g1", [
      { label: "A", value: "0" },
      { label: "B", value: "1" },
      { label: "C", value: "2" },
    ]);
    const ids = (block.elements as { action_id: string }[]).map((e) => e.action_id);
    expect(ids).toEqual(["answer:g1:0", "answer:g1:1", "answer:g1:2"]);
    expect(ids.map(answerGameId)).toEqual(["g1", "g1", "g1"]);
    expect(answerGameId("answer:g1")).toBe("g1");
    expect(answerGameId("play:g1")).toBeNull();
    expect(answerGameId("answer:")).toBeNull();
  });

  it("no template ever posts two elements with the same action_id in one block (Slack answers invalid_blocks)", async () => {
    const members = [member("m1", "Pablo"), ...Array.from({ length: 6 }, (_, i) => member(`x${i}`, `Persona ${i}`))];
    for (const [type, extra] of Object.entries(GAMES)) {
      for (const crowd of [members.slice(0, 3), members]) {
        const post = await TEMPLATES[type as GameType]!.render(ctx, game(extra), crowd);
        for (const block of post.blocks as { type: string; elements?: { action_id?: string }[] }[]) {
          const ids = (block.elements ?? []).map((e) => e.action_id).filter(Boolean);
          expect(new Set(ids).size, `${type}: ${ids.join(", ")}`).toBe(ids.length);
        }
      }
    }
  });
});

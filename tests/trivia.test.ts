import { describe, expect, it } from "vitest";
import type { AnswerRow } from "@/lib/db/types";
import { trivia } from "@/lib/games/trivia";
import { blockTypes, game, member } from "./helpers/fixtures";

const ctx = { db: {} as never, team: {} as never, now: new Date("2026-09-16T16:00:00Z") };
const triviaGame = () =>
  game({
    type: "trivia",
    payload: {
      preview: "Trivia de 3: mapas, inventos y palabras",
      title: "Trivia de 3: mapas, inventos y palabras",
      questions: [
        { q: "¿País más grande de Sudamérica?", options: ["Argentina", "Brasil", "Perú"], correct: 1 },
        { q: "¿Qué inventó Gutenberg?", options: ["El telescopio", "La imprenta", "La brújula"], correct: 1 },
        { q: "¿Cuál se lee igual al revés?", options: ["Reconocer", "Ventana", "Escalera"], correct: 0 },
      ],
    },
  });
const members = [member("m1", "Pablo"), member("m2", "Ana"), member("m3", "Luis")];
const reply = (id: string, memberId: string, choices: number[]): AnswerRow => ({
  id,
  game_id: "g1",
  member_id: memberId,
  value: { choices },
  correct_count: null,
  created_at: "",
  updated_at: "",
});

describe("trivia", () => {
  it("renders the title and a single Jugar button that opens the modal", async () => {
    const post = await trivia.render(ctx, triviaGame(), members);
    expect(blockTypes(post.blocks)).toEqual(["header", "section", "actions", "context"]);
    const actions = post.blocks[2] as { elements: { action_id: string; text: { text: string } }[] };
    expect(actions.elements).toHaveLength(1);
    expect(actions.elements[0].action_id).toBe("play:g1");
    expect(actions.elements[0].text.text).toBe("Jugar");
    expect(JSON.stringify(post.blocks[1])).toContain("3 preguntas rápidas");
    expect(JSON.stringify(post.blocks)).not.toContain("Brasil"); // answers never reach the channel post
  });

  it("counts one point per matching choice", () => {
    const answers = [reply("a1", "m1", [1, 1, 0]), reply("a2", "m2", [0, 1, 0]), reply("a3", "m3", [])];
    expect([...trivia.score(triviaGame(), answers).values()]).toEqual([3, 2, 0]);
  });

  it("reveals the correct options in order and names the perfect rounds", () => {
    const answers = [reply("a1", "m1", [1, 1, 0]), reply("a2", "m2", [0, 1, 0])];
    const scores = trivia.score(triviaGame(), answers);
    const out = trivia.reveal({ game: triviaGame(), answers, members, scores });
    expect(JSON.stringify(out.blocks)).toContain("Respuestas: 1 Brasil · 2 La imprenta · 3 Reconocer.");
    expect(JSON.stringify(out.blocks)).toContain("Cerrado · 2 de 3 jugaron");
    expect(out.thread).toBe("Ronda perfecta: Pablo (+2). Todos los que jugaron suman 1 más 1 por acierto.");
  });

  it("says so when nobody got a perfect round", () => {
    const answers = [reply("a2", "m2", [0, 1, 0])];
    const out = trivia.reveal({ game: triviaGame(), answers, members, scores: trivia.score(triviaGame(), answers) });
    expect(out.thread).toContain("Nadie hizo ronda perfecta");
  });

  it("closes without the button when nobody played", () => {
    const out = trivia.closed(triviaGame(), members);
    expect(blockTypes(out.blocks)).toEqual(["header", "section"]);
    expect(JSON.stringify(out.blocks)).toContain("Este juego cerró.");
  });
});

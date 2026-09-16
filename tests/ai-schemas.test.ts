import { describe, expect, it } from "vitest";
import { puzzleSchema, thisOrThatSchema, toolInputSchema, triviaSchema } from "@/lib/ai/schemas";
import { sampleGame } from "@/lib/ai/sample";
import { EXCLUDED_TOPICS, SYSTEM_PROMPT, thisOrThatPrompt } from "@/lib/ai/prompts";

describe("AI schemas", () => {
  it("accept the sample content shapes", () => {
    expect(thisOrThatSchema.safeParse({ question: "¿Café o té?", options: ["Café", "Té"], quips: ["a", "b"] }).success).toBe(true);
    expect(
      triviaSchema.safeParse({
        title: "Trivia",
        questions: Array.from({ length: 3 }, (_, i) => ({ q: `P${i}`, options: ["a", "b", "c"], correct: i % 3 })),
      }).success,
    ).toBe(true);
    expect(puzzleSchema.safeParse({ prompt: "¿Qué soy?", answer: "reloj", accepted_answers: ["el reloj"] }).success).toBe(true);
  });

  it("reject broken content: wrong option count, out-of-range or duplicate options, empty strings", () => {
    expect(thisOrThatSchema.safeParse({ question: "¿?", options: ["Café"], quips: ["a", "b"] }).success).toBe(false);
    expect(thisOrThatSchema.safeParse({ question: "¿Café o té?", options: ["Café", "Té"], quips: ["a", "  "] }).success).toBe(false);
    const bad = (q: object) => triviaSchema.safeParse({ title: "T", questions: [q, q, q] }).success;
    expect(bad({ q: "P", options: ["a", "b", "c"], correct: 3 })).toBe(false);
    expect(bad({ q: "P", options: ["a", "A", "c"], correct: 0 })).toBe(false);
    expect(bad({ q: "P", options: ["a", "b"], correct: 0 })).toBe(false);
    expect(puzzleSchema.safeParse({ prompt: "x", answer: "y", accepted_answers: [] }).success).toBe(false);
  });

  it("produce a JSON Schema Anthropic accepts as input_schema", () => {
    const schema = toolInputSchema(triviaSchema);
    expect(schema.type).toBe("object");
    expect(schema).not.toHaveProperty("$schema");
    expect(schema.required).toEqual(["title", "questions"]);
    const questions = (schema.properties as Record<string, Record<string, unknown>>).questions;
    expect(questions.type).toBe("array");
    expect(questions.minItems).toBe(3);
  });
});

describe("prompts", () => {
  it("carry the excluded topics and the do-not-repeat list", () => {
    for (const topic of EXCLUDED_TOPICS) expect(SYSTEM_PROMPT).toContain(topic);
    const prompt = thisOrThatPrompt(["¿Café o té?", "¿Playa o montaña?"]);
    expect(prompt).toContain("- ¿Café o té?");
    expect(prompt).toContain("- ¿Playa o montaña?");
    expect(thisOrThatPrompt([])).not.toContain("Temas ya usados");
  });
});

describe("sample content", () => {
  it("provides a flagged sample for every AI template and nothing for the fact-based ones", () => {
    for (const type of ["this_or_that", "trivia", "puzzle"] as const) {
      const sample = sampleGame(type);
      expect(sample?.isSample).toBe(true);
      expect(sample?.contentHash).toBeNull();
      expect(typeof sample?.payload.preview).toBe("string");
    }
    expect(sampleGame("guess_who")).toBeNull();
    expect(sampleGame("two_truths")).toBeNull();
  });
});

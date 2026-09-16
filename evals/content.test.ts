// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generatePuzzle, generateThisOrThat, generateTrivia } from "@/lib/ai/generate";

/**
 * Live content generation against Anthropic. Opt-in: `npm run eval` (RUN_EVALS=1) with
 * ANTHROPIC_API_KEY in .env.local. `npm test` skips it so the suite stays offline.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  // rely on the environment
}
const live = process.env.RUN_EVALS === "1" && Boolean(process.env.ANTHROPIC_API_KEY?.trim());
const TIMEOUT = 120_000;

describe.skipIf(!live)("live content generation", () => {
  it("this or that: two short options and two quips", async () => {
    const c = await generateThisOrThat(["¿Café o té para arrancar el día?"]);
    console.log("this_or_that:", JSON.stringify(c, null, 1));
    expect(c.question.length).toBeGreaterThan(8);
    expect(c.options).toHaveLength(2);
    expect(c.quips).toHaveLength(2);
    expect(c.question.toLowerCase()).not.toContain("café o té");
  }, TIMEOUT);

  it("trivia: 3 questions with a valid correct index each", async () => {
    const c = await generateTrivia([]);
    console.log("trivia:", JSON.stringify(c, null, 1));
    expect(c.questions.length).toBeGreaterThanOrEqual(3);
    for (const q of c.questions) expect(q.correct).toBeLessThan(q.options.length);
  }, TIMEOUT);

  it("puzzle: a prompt with an answer and accepted variants", async () => {
    const c = await generatePuzzle([]);
    console.log("puzzle:", JSON.stringify(c, null, 1));
    expect(c.prompt.length).toBeGreaterThan(10);
    expect(c.accepted_answers.length).toBeGreaterThanOrEqual(1);
  }, TIMEOUT);
});

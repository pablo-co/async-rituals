import { z } from "zod";

/**
 * What the model must hand back for each AI template (tool use). Zod is the single source of truth:
 * the JSON Schema sent to Anthropic derives from these, and the reply is validated against them.
 */
const text = (max: number) => z.string().trim().min(1).max(max);

export const thisOrThatSchema = z.object({
  question: text(120).describe("La pregunta del dilema, en español, terminada en signo de interrogación"),
  options: z.array(text(30)).length(2).describe("Las dos opciones, de una a tres palabras cada una"),
  quips: z
    .array(text(160))
    .length(2)
    .describe("Dos remates de una frase: el primero para quienes eligieron la opción A, el segundo para la B"),
});
export type ThisOrThatContent = z.infer<typeof thisOrThatSchema>;

const triviaQuestion = z
  .object({
    q: text(200).describe("La pregunta"),
    options: z.array(text(60)).min(3).max(4).describe("Tres o cuatro opciones plausibles"),
    correct: z.number().int().min(0).max(3).describe("Índice (desde 0) de la opción correcta"),
  })
  .refine((q) => q.correct < q.options.length, { message: "correct apunta a una opción que no existe" })
  .refine((q) => new Set(q.options.map((o) => o.toLowerCase())).size === q.options.length, {
    message: "hay opciones repetidas",
  });

export const triviaSchema = z.object({
  title: text(60).describe("Título corto que resume los temas, p. ej. «Trivia de 3: mapas, inventos y palabras»"),
  questions: z.array(triviaQuestion).min(3).max(5),
});
export type TriviaContent = z.infer<typeof triviaSchema>;

export const puzzleSchema = z.object({
  prompt: text(280).describe("El acertijo completo, listo para publicarse"),
  answer: text(40).describe("La respuesta principal, como se mostrará al revelar"),
  accepted_answers: z
    .array(text(40))
    .min(1)
    .max(8)
    .describe("Variantes que también cuentan como correctas (con o sin artículo, sinónimos, plural, inglés si aplica)"),
});
export type PuzzleContent = z.infer<typeof puzzleSchema>;

/** JSON Schema for Anthropic's `input_schema` (draft-7, without the `$schema` marker). */
export function toolInputSchema(schema: z.ZodType): { type: "object"; [key: string]: unknown } {
  const json = z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;
  delete json.$schema;
  return json as { type: "object"; [key: string]: unknown };
}

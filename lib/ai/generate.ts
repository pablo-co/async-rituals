import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { AiOutputError } from "@/lib/errors";
import type { GameType } from "@/lib/games/types";
import { puzzlePrompt, SYSTEM_PROMPT, thisOrThatPrompt, triviaPrompt } from "./prompts";
import {
  puzzleSchema,
  thisOrThatSchema,
  toolInputSchema,
  triviaSchema,
  type PuzzleContent,
  type ThisOrThatContent,
  type TriviaContent,
} from "./schemas";

/**
 * The only place that talks to Anthropic. Tool use forces structured output; zod validates it;
 * one retry carries the validation error back to the model; then AiOutputError → the fill logs
 * `generation_failed` and the rotation moves on. Never called from a Slack handler.
 */
export const DEFAULT_MODEL = "claude-opus-5";

export function aiModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

let cached: Anthropic | null = null;
function anthropic(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new AiOutputError("Falta ANTHROPIC_API_KEY", "no_key");
  if (!cached) cached = new Anthropic({ apiKey, maxRetries: 2, timeout: 45_000 });
  return cached;
}

export interface GenerateOptions<S extends z.ZodType> {
  tool: { name: string; description: string };
  schema: S;
  prompt: string;
  system?: string;
  model?: string;
  client?: Anthropic;
}

export async function generateStructured<S extends z.ZodType>(options: GenerateOptions<S>): Promise<z.infer<S>> {
  const client = options.client ?? anthropic();
  const model = options.model ?? aiModel();
  const input_schema = toolInputSchema(options.schema);
  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const prompt =
      attempt === 0
        ? options.prompt
        : `${options.prompt}\n\nTu intento anterior no fue válido (${lastError}). Corrígelo y vuelve a usar la herramienta.`;
    const response = await client.messages.create({
      model,
      max_tokens: 1500,
      system: options.system ?? SYSTEM_PROMPT,
      tools: [{ name: options.tool.name, description: options.tool.description, input_schema }],
      tool_choice: { type: "tool", name: options.tool.name },
      messages: [{ role: "user", content: prompt }],
    });
    const block = response.content.find((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
    if (!block) {
      lastError = "no usó la herramienta";
      continue;
    }
    const parsed = options.schema.safeParse(block.input);
    if (parsed.success) return parsed.data;
    lastError = parsed.error.issues.map((i) => `${i.path.join(".") || "raíz"}: ${i.message}`).join("; ");
  }
  throw new AiOutputError(`La IA no devolvió contenido válido: ${lastError}`, "ai_output");
}

/** The last `limit` previews of one template for a team: the "do not repeat" list in the prompt. */
export async function recentPreviews(db: SupabaseClient, teamId: string, type: GameType, limit = 30): Promise<string[]> {
  const { data } = await db
    .from("games")
    .select("payload")
    .eq("team_id", teamId)
    .eq("type", type)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? [])
    .map((row) => (row.payload as { preview?: unknown }).preview)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
}

export function generateThisOrThat(used: string[], client?: Anthropic): Promise<ThisOrThatContent> {
  return generateStructured({
    tool: { name: "this_or_that", description: "Entrega un dilema «esto o aquello» con dos opciones y dos remates." },
    schema: thisOrThatSchema,
    prompt: thisOrThatPrompt(used),
    client,
  });
}

export function generateTrivia(used: string[], client?: Anthropic): Promise<TriviaContent> {
  return generateStructured({
    tool: { name: "trivia", description: "Entrega una trivia de 3 preguntas con opciones y la correcta marcada." },
    schema: triviaSchema,
    prompt: triviaPrompt(used),
    client,
  });
}

export function generatePuzzle(used: string[], client?: Anthropic): Promise<PuzzleContent> {
  return generateStructured({
    tool: { name: "puzzle", description: "Entrega un acertijo corto con su respuesta y las variantes aceptadas." },
    schema: puzzleSchema,
    prompt: puzzlePrompt(used),
    client,
  });
}

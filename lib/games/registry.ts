import { TemplateError } from "@/lib/errors";
import { guessWho } from "./guess-who";
import type { GameTemplate } from "./template";
import { ROTATION, type GameType } from "./types";

/** Templates that exist today. Hitos 2-4 add the rest; the fill only uses what is here. */
export const TEMPLATES: Partial<Record<GameType, GameTemplate>> = {
  guess_who: guessWho,
};

export function templateFor(type: GameType): GameTemplate {
  const template = TEMPLATES[type];
  if (!template) throw new TemplateError(`Plantilla no disponible: ${type}`, "template_error");
  return template;
}

/** The fixed rotation, starting at `index`, keeping only templates that exist. */
export function availableRotation(index: number): GameType[] {
  const n = ROTATION.length;
  const start = ((index % n) + n) % n;
  const ordered = [...ROTATION.slice(start), ...ROTATION.slice(0, start)];
  return ordered.filter((type) => Boolean(TEMPLATES[type]));
}

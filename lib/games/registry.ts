import { TemplateError } from "@/lib/errors";
import { guessWho } from "./guess-who";
import { puzzle } from "./puzzle";
import { recap } from "./recap";
import type { GameTemplate } from "./template";
import { thisOrThat } from "./this-or-that";
import { trivia } from "./trivia";
import { twoTruths } from "./two-truths";
import { ROTATION, type GameType } from "./types";

/**
 * Every template. The fact-based ones (guess_who, two_truths) return null without material and the slot takes the
 * next one in the rotation. `recap` is registered so the tick can post it, but it is not in ROTATION (ensureRecaps).
 */
export const TEMPLATES: Partial<Record<GameType, GameTemplate>> = {
  guess_who: guessWho,
  this_or_that: thisOrThat,
  two_truths: twoTruths,
  trivia,
  puzzle,
  recap,
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

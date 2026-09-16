import type { GeneratedGame } from "@/lib/games/template";
import type { GameType } from "@/lib/games/types";
import sampleContent from "./sample-content.json";

interface SampleGame {
  type: GameType;
  preview: string | null;
  [key: string]: unknown;
}

/**
 * Without ANTHROPIC_API_KEY the AI templates fall back to this content, flagged `is_sample`:
 * it shows up in the web queue ("muestra · no se publica") and the tick never posts it (D-2D).
 */
export function sampleGame(type: GameType): GeneratedGame | null {
  const entry = (sampleContent.games as SampleGame[]).find((g) => g.type === type && g.preview);
  if (!entry) return null;
  const { type: _type, ...payload } = entry;
  void _type;
  return { type, payload, contentHash: null, isSample: true };
}

/**
 * Every text the bot says, in Spanish (D-1A, D-2D). Block Kit limits, so nobody has to remember them:
 * header ≤ 150 · button / option label ≤ 75 · modal title ≤ 24 · actions block ≤ 25 elements.
 * Never: exact times, live counters, "@channel", naming who did not play.
 */
import { GAME_LABELS, type GameType } from "@/lib/games/types";
import { joinEs } from "@/lib/time";

export const LIMITS = { header: 150, button: 75, option: 75, modalTitle: 24, actions: 25 } as const;

export const strings = {
  header: (type: GameType) => GAME_LABELS[type],
  contextPending: "Se revela esta tarde. Tu respuesta es privada hasta entonces.",
  contextClosed: (played: number, total: number) => `Cerrado · ${played} de ${total} jugaron`,
  contextResumed: "Ya volvimos.",
  selectPlaceholder: "Elige a alguien",

  ackSaved: (option: string) => `Guardado: ${option}. Puedes cambiarlo hasta esta tarde.`,
  ackChanged: (option: string) => `Cambiado a: ${option}.`,
  featured: "Este juego es sobre ti. Los demás adivinan; tú espera el reveal.",
  closed: "Este juego ya cerró.",
  optedOut: "Saliste del ritual.",
  notMember: "No estás en el ritual.",
  rejoinButton: "Volver a entrar",
  rejoined: "Listo, ya estás de vuelta en el ritual.",
  left: "Listo, ya no te incluyo. Cuando quieras volver:",
  commandSoon: "Ese comando llega pronto. Por ahora: /rituales salir.",

  welcome: (days: string, pausedUntil: string | null) =>
    `Hola, soy Rituales. Voy a publicar juegos cortos aquí los ${days} por la mañana` +
    (pausedUntil ? ` a partir del ${pausedUntil}` : "") +
    ": adivina quién, trivia, dos verdades y una mentira, y más. " +
    "Jugar es opcional y toma un minuto; tu respuesta es privada hasta el reveal de la tarde. " +
    "Si prefieres no participar, escribe /rituales salir.",

  closedNoAnswers: "Este juego cerró.",

  guessWho: {
    revealLine: (name: string) => `Era *${name}*.`,
    winners: (names: string[]) =>
      names.length === 0
        ? "Nadie le atinó."
        : `Le atinaron ${joinEs(names)} (+2 ${names.length === 1 ? "para" : "cada quien"}${names.length === 1 ? ` ${names[0]}` : ""}).`,
    fooled: (name: string, fooled: number, bonus: number) =>
      fooled === 0 ? `${name} no engañó a nadie esta vez.` : `${name} engañó a ${fooled} (+${bonus}).`,
    ask: (name: string) => `${name}, ¿nos cuentas?`,
  },

  admin: {
    channelError: (channel: string) =>
      `No puedo publicar en #${channel}. Revisa que Rituales siga dentro del canal y vuelve a guardar en Conectar.`,
  },

  fallback: {
    post: (type: GameType) => `${GAME_LABELS[type]}: nuevo juego en el canal.`,
    reveal: (type: GameType) => `${GAME_LABELS[type]}: reveal.`,
  },
} as const;

/** Cuts a label to a Block Kit limit, keeping it readable. */
export function clampLabel(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

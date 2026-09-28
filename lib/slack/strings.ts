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
  play: "Jugar",

  ackSaved: (option: string) => `Guardado: ${option}. Puedes cambiarlo hasta esta tarde.`,
  ackChanged: (option: string) => `Cambiado a: ${option}.`,
  featured: "Este juego es sobre ti. Los demás adivinan; tú espera el reveal.",
  closed: "Este juego ya cerró.",
  optedOut: "Saliste del ritual.",
  notMember: "No estás en el ritual.",
  rejoinButton: "Volver a entrar",
  rejoined: "Listo, ya estás de vuelta en el ritual.",
  left: "Listo, ya no te incluyo. Cuando quieras volver:",
  commandSoon: "Ese comando llega pronto.",
  help: "Comandos: /rituales hecho (un dato tuyo para adivinar) · /rituales salir · /rituales borrar-mis-datos.",
  saveFailed: "No pude guardar tu respuesta. Inténtalo de nuevo.",
  modalFailed: "No pude abrir el juego. Toca Jugar otra vez.",
  /** Slack gives 3 s to open a modal; a cold server can miss it. The second tap lands on a warm one. */
  modalSlow: "Me tardé en abrir el juego. Toca Jugar otra vez.",

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

  twoTruths: {
    intro: (name: string) => `${name} nos cuenta tres cosas. Una es mentira: ¿cuál?`,
    statements: (statements: readonly string[]) => statements.map((st, i) => `*${i + 1}.* ${st}`).join("\n"),
    revealLine: (lie: string) => `La mentira era: «${lie}».`,
  },

  thisOrThat: {
    /** "{A}: {n} · {B}: {m}." — no winner, on purpose. */
    revealLine: (a: string, n: number, b: string, m: number) => `${a}: ${n} · ${b}: ${m}.`,
  },

  trivia: {
    intro: (count: number) => `${count} preguntas rápidas. Toca *Jugar* para contestarlas en privado.`,
    revealLine: (answers: string[]) => `Respuestas: ${answers.map((a, i) => `${i + 1} ${a}`).join(" · ")}.`,
    perfect: (names: string[]) =>
      names.length === 0
        ? "Nadie hizo ronda perfecta esta vez. Todos los que jugaron suman 1 más 1 por acierto."
        : `Ronda perfecta: ${joinEs(names)} (+2). Todos los que jugaron suman 1 más 1 por acierto.`,
    ackSaved: (count: number) => `Guardado: ${count} respuestas. Puedes cambiarlas hasta esta tarde.`,
  },

  puzzle: {
    intro: "Toca *Jugar* para escribir tu respuesta en privado.",
    revealLine: (answer: string) => `La respuesta era: *${answer}*.`,
    solved: (names: string[]) => (names.length === 0 ? "Nadie lo resolvió esta vez." : `Lo resolvieron ${joinEs(names)} (+2).`),
    ackSaved: (text: string) => `Guardado: ${text}. Puedes cambiarlo hasta esta tarde.`,
  },

  /** Streak milestones (plan CEO 4): one line in the reveal thread, every milestone reached, no emoji. */
  streakMilestones: (groups: readonly { names: string[]; count: number }[]) =>
    groups.map((g) => `${joinEs(g.names)}: ${g.count} seguidos`).join(" · "),

  /** Friday recap (D-1A, fixed order): moment of the week, longest streak, top 3 of the week, who played. */
  recap: {
    momentGuessWho: (fact: string, name: string, fooled: number, total: number) =>
      `*Momento de la semana:* «${fact}» era de ${name}, que engañó a ${fooled} de ${total}.`,
    momentTwoTruths: (lie: string, name: string, fooled: number, total: number) =>
      `*Momento de la semana:* la mentira de ${name}, «${lie}», engañó a ${fooled} de ${total}.`,
    streak: (names: string[], streak: number) => `*Racha más larga:* ${joinEs(names)}, ${streak} juegos seguidos.`,
    top: (rows: readonly { name: string; points: number }[]) =>
      `*Puntos de la semana:* ${rows.map((r) => `${r.name} ${r.points}`).join(" · ")}.`,
    played: (played: number, members: number) => `${played} de ${members} jugaron esta semana.`,
    fallback: (played: number, members: number) => `Recap de la semana: ${played} de ${members} jugaron.`,
  },

  /** Onboarding by DM (D-7A, design doc "Onboarding por DM"). Modal title ≤ 24. */
  onboarding: {
    invite: (channel: string | null) =>
      `Hola, soy Rituales, el bot de juegos${channel ? ` de #${channel}` : ""}. ` +
      "¿Me cuentas unos datos curiosos sobre ti para los juegos de adivinar? Todo es opcional y toma un par de minutos.",
    inviteButton: "Contestar",
    answered: "Gracias, ya tengo tus respuestas para los próximos juegos. Si quieres cambiar algo, toca el botón.",
    changeButton: "Cambiar mis respuestas",
    slow: "Me tardé en abrir las preguntas. Toca el botón otra vez.",
    saveFailed: "No pude guardar tus respuestas. Toca Contestar otra vez.",
    title: "Cuéntanos de ti",
    consent:
      "Tus respuestas se usan solo para juegos con tu equipo. Puedes borrarlas cuando quieras con /rituales borrar-mis-datos.",
    hint: "Corto, como para completar la frase",
    freeHint: "En tercera persona: «corrió un maratón en 2019»",
    twoTruthsTitle: "*2 verdades, 1 mentira* (opcional)",
    twoTruthsHelp: "Dos cosas ciertas y una falsa sobre ti. El equipo adivina cuál es la mentira.",
    statement: (n: number) => `Frase ${n}`,
    lieLabel: "¿Cuál es la mentira?",
    lieOption: (n: number) => `La ${n}`,
    twoTruthsIncomplete: "Escribe las 3 frases y marca cuál es la mentira, o deja las tres vacías.",
    nothing: "Contesta al menos una pregunta, o cierra la ventana si prefieres no hacerlo.",
  },

  /** `/rituales hecho` (plan CEO 6). */
  fact: {
    title: "Un hecho nuevo",
    label: "Algo que quieras que adivinen",
    hint: "En tercera persona, como para que adivinen: «corrió un maratón en 2019».",
    empty: "Escribe tu hecho",
    saved: "Guardado. Puede salir en un próximo Adivina quién.",
    saveFailed: "No pude guardar, inténtalo de nuevo con /rituales hecho.",
    slow: "Me tardé en abrir la ventana. Toca el botón para escribir tu hecho.",
    openButton: "Escribir un hecho",
  },

  /** `/rituales borrar-mis-datos` (D-2D): the deletion happens only on the danger button. */
  erase: {
    confirm: "Se borrarán tu perfil, tus hechos, tus respuestas y tus puntos en Rituales. No se puede deshacer.",
    yes: "Sí, borrar",
    cancel: "Cancelar",
    done: "Listo. Borré tus datos. Si vuelves a jugar, empiezas de cero.",
    failed: "No pude borrar tus datos. Inténtalo de nuevo con /rituales borrar-mis-datos.",
  },

  modal: {
    submit: "Enviar",
    close: "Cancelar",
    pickOne: "Elige una opción",
    emptyAnswer: "Escribe una respuesta",
    puzzleLabel: "Tu respuesta",
    puzzleHint: "Una o dos palabras. No importan mayúsculas ni acentos.",
  },

  sampleWarning:
    "Sin llave de Anthropic: solo se publican Adivina quién y Dos verdades. Trivia, Esto o aquello y Puzzle esperan la llave.",

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

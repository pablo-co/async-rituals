/**
 * Onboarding questions (D-7A). Keys are stable forever: changing a question means a new key;
 * old facts keep theirs. `leadIn` is the sentence the guess-who post opens with; {r} is the answer.
 */
export interface Question {
  key: string;
  prompt: string;
  placeholder: string;
  leadIn: string;
}

export const QUESTIONS: readonly Question[] = [
  { key: "hidden_talent", prompt: "¿Un talento oculto?", placeholder: "tocar el ukelele", leadIn: "Alguien de este equipo tiene un talento oculto: {r}" },
  { key: "surprising_story", prompt: "Algo sorprendente que te haya pasado", placeholder: "quedarse encerrado en un IKEA", leadIn: "A alguien de este equipo le pasó esto: {r}" },
  { key: "first_job", prompt: "¿Tu primer trabajo?", placeholder: "repartir periódicos", leadIn: "El primer trabajo de alguien aquí fue: {r}" },
  { key: "dream_trip", prompt: "¿Un lugar al que sueñas con ir?", placeholder: "Islandia", leadIn: "Alguien de este equipo sueña con ir a: {r}" },
  { key: "childhood_dream", prompt: "¿Qué querías ser de niño?", placeholder: "astronauta", leadIn: "De niño, alguien de este equipo quería ser: {r}" },
  { key: "unusual_food", prompt: "¿Una comida rara que te encanta?", placeholder: "chapulines", leadIn: "A alguien de este equipo le encanta comer: {r}" },
  { key: "silly_fear", prompt: "¿Algo que te da miedo y no debería?", placeholder: "las palomas", leadIn: "Alguien de este equipo le tiene miedo a: {r}" },
  { key: "celebrity_encounter", prompt: "¿Te has topado a alguien famoso?", placeholder: "Luis Miguel en un aeropuerto", leadIn: "Alguien de este equipo se topó a: {r}" },
  { key: "collection", prompt: "¿Coleccionas algo?", placeholder: "boletos de cine", leadIn: "Alguien de este equipo colecciona: {r}" },
  { key: "free", prompt: "Algo más que quieras que adivinen", placeholder: "corrió un maratón en 2019", leadIn: "Alguien de este equipo… {r}" },
];

export const QUESTION_KEYS: ReadonlySet<string> = new Set(QUESTIONS.map((q) => q.key));
export const ANSWER_MAX_LENGTH = 280;

export function leadInFor(key: string, answer: string): string {
  const question = QUESTIONS.find((q) => q.key === key) ?? QUESTIONS[QUESTIONS.length - 1];
  return question.leadIn.replace("{r}", answer);
}

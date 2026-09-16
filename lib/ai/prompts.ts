/**
 * Prompts for the AI templates (design doc, "Reglas del contenido"). Spanish on purpose: the team
 * plays in Spanish. Excluded topics live here and nowhere else.
 */
export const EXCLUDED_TOPICS = [
  "política",
  "religión",
  "sexo",
  "alcohol y drogas",
  "apuestas",
  "cuerpo y apariencia física",
  "tragedias, enfermedades o muerte",
  "referencias culturales de un solo país presentadas como universales",
] as const;

export const SYSTEM_PROMPT = [
  "Eres Rituales, el anfitrión de juegos cortos para un equipo de trabajo distribuido que habla español.",
  "Escribes en español neutro (el equipo está en México, pero puede haber gente de cualquier país), con tono cálido y",
  "juguetón, en frases cortas y sin exagerar los signos de admiración.",
  "Reglas fijas:",
  `- Contenido apto para el trabajo e inclusivo. Nunca toques: ${EXCLUDED_TOPICS.join(", ")}.`,
  "- Nunca menciones personas reales ni pidas datos personales.",
  "- Sin emojis, salvo que el acertijo mismo esté hecho de emojis.",
  "- No repitas ni parafrasees los temas ya usados que se te pasen.",
  "- Contesta únicamente usando la herramienta indicada, con todos los campos.",
].join("\n");

function exclusions(used: string[]): string {
  if (used.length === 0) return "";
  const list = used.slice(0, 30).map((u) => `- ${u.replace(/\s+/g, " ").slice(0, 160)}`);
  return `\n\nTemas ya usados con este equipo (no los repitas ni los parafrasees):\n${list.join("\n")}`;
}

export function thisOrThatPrompt(used: string[]): string {
  return (
    "Genera un «esto o aquello»: un dilema ligero y divertido con exactamente dos opciones cortas (una a tres palabras " +
    "cada una) sobre gustos cotidianos, hábitos de trabajo remoto, comida, viajes, tecnología o preferencias raras. " +
    "Debe dividir a un equipo: nada obvio ni con una respuesta «correcta». " +
    "Además escribe dos remates de una sola frase: uno para quienes eligieron la opción A y otro para quienes eligieron " +
    "la B. Son cariñosos, con humor suave, sin burlarse de nadie; se publica el del lado que quedó en minoría." +
    exclusions(used)
  );
}

export function triviaPrompt(used: string[]): string {
  return (
    "Genera una trivia de exactamente 3 preguntas de cultura general variada (ciencia, geografía mundial, palabras y " +
    "lenguaje, historia de inventos, naturaleza, cine y música internacionales, matemáticas sencillas). Cada pregunta " +
    "tiene 3 opciones plausibles y una sola correcta, y la posición de la correcta cambia entre preguntas. Dificultad " +
    "media: alguien curioso acierta 2 de 3. Nada de fechas oscuras, preguntas capciosas ni datos de un solo país. " +
    "Ponle un título corto (máximo 60 caracteres) que resuma los temas, por ejemplo «Trivia de 3: mapas, inventos y palabras»." +
    exclusions(used)
  );
}

export function puzzlePrompt(used: string[]): string {
  return (
    "Genera un acertijo corto (máximo 280 caracteres) que se resuelva con una o dos palabras: puede ser una adivinanza " +
    "clásica de ingenio, un juego de palabras, una secuencia lógica simple, o una serie de emojis que representen un " +
    "objeto, un animal, una película muy conocida o un refrán (si es de emojis, el enunciado lleva los emojis y una " +
    "instrucción breve). Resoluble en dos minutos sin conocimiento especializado. Da la respuesta principal y de 3 a 8 " +
    "variantes aceptadas: con y sin artículo, singular y plural, sinónimos claros y, si es un título conocido en inglés, " +
    "también en inglés." +
    exclusions(used)
  );
}

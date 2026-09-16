/**
 * Loads seed facts for guess-who (D-3A). Only facts people gave on purpose.
 * Usage: npm run seed:facts -- seed/facts.json
 * File format: [{ "name": "Pablo", "question_key": "first_job", "text": "repartir periódicos" }, …]
 * `name` matches members.display_name (case-insensitive) or use "slack_user_id".
 */
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { QUESTION_KEYS } from "@/lib/games/questions";

try {
  process.loadEnvFile(".env.local");
} catch {
  // rely on the environment
}

interface SeedFact {
  name?: string;
  slack_user_id?: string;
  question_key: string;
  text: string;
}

async function main() {
  const file = process.argv[2] ?? "seed/facts.json";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const facts = JSON.parse(await readFile(file, "utf8")) as SeedFact[];
  const { data: members, error } = await db.from("members").select("id, display_name, slack_user_id, team_id");
  if (error) throw error;
  if (!members?.length) throw new Error("No hay miembros todavía: guarda el canal en Conectar primero.");

  let inserted = 0;
  for (const fact of facts) {
    if (!QUESTION_KEYS.has(fact.question_key)) throw new Error(`question_key desconocida: ${fact.question_key}`);
    const text = fact.text.trim();
    if (!text || text.length > 280) throw new Error(`Texto vacío o mayor a 280: ${fact.text}`);
    const member = members.find(
      (m) =>
        (fact.slack_user_id && m.slack_user_id === fact.slack_user_id) ||
        (fact.name && String(m.display_name).toLowerCase() === fact.name.toLowerCase()),
    );
    if (!member) throw new Error(`No encontré al miembro: ${fact.name ?? fact.slack_user_id}`);
    const { error: insertError } = await db.from("facts").insert({
      member_id: member.id,
      kind: "fact",
      payload: { question_key: fact.question_key, text },
      source: "seed",
    });
    if (insertError) throw insertError;
    inserted += 1;
  }
  console.log(`${inserted} hecho(s) cargado(s).`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

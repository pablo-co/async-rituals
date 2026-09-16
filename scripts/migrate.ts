/**
 * Applies supabase/migrations/*.sql in order, once each, tracked in public.schema_migrations.
 * Usage: npm run migrate   (reads DATABASE_URL from .env.local)
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local (CI or Vercel): rely on the environment.
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL (la connection string de Supabase) en .env.local");
  process.exit(1);
}

const sql = postgres(url, {
  max: 1,
  prepare: false,
  ssl: url.includes("sslmode=") ? undefined : "require",
  onnotice: () => {},
});

const dir = path.join(process.cwd(), "supabase", "migrations");

async function main() {
  await sql`create table if not exists public.schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  )`;
  await sql`revoke all on public.schema_migrations from anon, authenticated`;

  const applied = new Set(
    (await sql<{ name: string }[]>`select name from public.schema_migrations`).map((r) => r.name),
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`= ${file} (ya aplicada)`);
      continue;
    }
    const body = await readFile(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into public.schema_migrations (name) values (${file})`;
    });
    console.log(`+ ${file}`);
    count += 1;
  }
  console.log(count === 0 ? "Nada nuevo que aplicar." : `${count} migración(es) aplicada(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());

/**
 * Smoke test against the real Supabase project (T6 / ET7): the guarantees that only the real SQL
 * can prove. It creates a throwaway team (slack_team_id "SMOKE-…") with its own auth user, runs
 * every check, and removes everything it created even when a check fails.
 *
 * Usage: npm run smoke            (reads .env.local; needs DATABASE_URL, SUPABASE_SECRET_KEY,
 *                                  NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
 *
 * gstack-shortcut(dec-88b9fc96): smoke against the live project with a marked test team instead of an
 * ephemeral database per run; upgrade when there is a CI job with `supabase start` (local Postgres).
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

try {
  process.loadEnvFile(".env.local");
} catch {
  // rely on the environment
}

const stamp = Date.now().toString(36);
const results: { name: string; ok: boolean; note?: string }[] = [];
let failures = 0;

function check(name: string, ok: boolean, note?: string) {
  results.push({ name, ok, note });
  if (!ok) failures += 1;
  console.log(`${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta ${name} en .env.local`);
  return value;
}

async function main() {
  const databaseUrl = need("DATABASE_URL");
  const supabaseUrl = need("NEXT_PUBLIC_SUPABASE_URL");
  const publishableKey = need("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const secretKey = need("SUPABASE_SECRET_KEY");

  const ssl = /sslmode=/.test(databaseUrl) ? undefined : ("require" as const);
  const sql = postgres(databaseUrl, { max: 3, prepare: false, ssl });
  const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false } });
  const anon = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false } });

  const email = `smoke-${stamp}@example.com`;
  const password = randomBytes(18).toString("base64url");
  let userId: string | null = null;
  let teamId: string | null = null;
  let secretId: string | null = null;

  try {
    // --- setup: auth user + team + members ---------------------------------------------------
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error(`createUser: ${created.error?.message}`);
    userId = created.data.user.id;

    const [teamRow] = await sql<{ id: string }[]>`
      insert into public.teams (slack_team_id, slack_team_name, admin_user_id, admin_slack_user_id,
                                channel_id, channel_name, welcomed_channel_id, cadence_per_week, timezone)
      values (${"SMOKE-" + stamp}, 'smoke', ${userId}, 'USMOKEADMIN', 'CSMOKE', 'smoke', 'CSMOKE', 3, 'America/Mexico_City')
      returning id`;
    teamId = teamRow.id;

    const members = await sql<{ id: string }[]>`
      insert into public.members (team_id, slack_user_id, display_name)
      values (${teamId}, 'USMOKEADMIN', 'Smoke Uno'), (${teamId}, 'USMOKETWO', 'Smoke Dos')
      returning id`;
    const [m1, m2] = members.map((m) => m.id);

    // --- Vault round trip ---------------------------------------------------------------------
    const token = `xoxb-smoke-${stamp}`;
    const [{ set_bot_token }] = await sql<{ set_bot_token: string }[]>`select public.set_bot_token(${teamId}, ${token})`;
    secretId = set_bot_token;
    const [{ get_bot_token }] = await sql<{ get_bot_token: string }[]>`select public.get_bot_token(${teamId})`;
    check("Vault: set_bot_token / get_bot_token devuelven el mismo token", get_bot_token === token);
    const [{ count: plain }] = await sql<{ count: string }[]>`
      select count(*)::text from vault.secrets where id = ${secretId} and secret = ${token}`;
    check("Vault: el token no está en claro en vault.secrets", plain === "0");

    // --- claim_due_games: two concurrent claims, one winner --------------------------------------
    const [gameRow] = await sql<{ id: string }[]>`
      insert into public.games (team_id, type, payload, slot_date, scheduled_for)
      values (${teamId}, 'guess_who', ${sql.json({ fact_id: null, featured_member_id: m1, question_key: "first_job", text: "smoke" })},
              (now() at time zone 'America/Mexico_City')::date, now())
      returning id`;
    const gameId = gameRow.id;
    const a = await sql.reserve();
    const b = await sql.reserve();
    try {
      const [ra, rb] = await Promise.all([
        a<{ id: string }[]>`select id from public.claim_due_games(${teamId}, 'post', now())`,
        b<{ id: string }[]>`select id from public.claim_due_games(${teamId}, 'post', now())`,
      ]);
      const total = ra.length + rb.length;
      check("claim 'post': dos reclamos simultáneos, un solo ganador", total === 1, `devolvieron ${ra.length} y ${rb.length}`);
    } finally {
      a.release();
      b.release();
    }
    const [afterClaim] = await sql<{ status: string }[]>`select status from public.games where id = ${gameId}`;
    check("claim 'post': el juego quedó en posting", afterClaim.status === "posting");
    const again = await sql`select id from public.claim_due_games(${teamId}, 'post', now())`;
    check("claim 'post': un tercer reclamo no devuelve nada", again.length === 0);

    // --- submit_answer only while posted --------------------------------------------------------
    const [{ submit_answer: whilePosting }] = await sql<{ submit_answer: boolean }[]>`
      select public.submit_answer(${gameId}, ${m2}, '{"choice":"x"}'::jsonb)`;
    check("submit_answer: rechaza mientras el juego está en posting", whilePosting === false);

    await sql`update public.games set status = 'posted', posted_at = now(), slack_channel_id = 'CSMOKE', slack_ts = '1.1' where id = ${gameId}`;
    const [{ submit_answer: first }] = await sql<{ submit_answer: boolean }[]>`
      select public.submit_answer(${gameId}, ${m2}, ${sql.json({ choice: m1 })})`;
    const [{ submit_answer: second }] = await sql<{ submit_answer: boolean }[]>`
      select public.submit_answer(${gameId}, ${m2}, ${sql.json({ choice: "otro" })})`;
    const answers = await sql<{ value: { choice: string } }[]>`select value from public.answers where game_id = ${gameId}`;
    check(
      "submit_answer: acepta en posted y la segunda respuesta reemplaza a la primera (una sola fila)",
      first === true && second === true && answers.length === 1 && answers[0].value.choice === "otro",
    );

    await sql`update public.games set status = 'revealing' where id = ${gameId}`;
    const [{ submit_answer: afterReveal }] = await sql<{ submit_answer: boolean }[]>`
      select public.submit_answer(${gameId}, ${m2}, '{"choice":"tarde"}'::jsonb)`;
    const [{ value: kept }] = await sql<{ value: { choice: string } }[]>`select value from public.answers where game_id = ${gameId}`;
    check("submit_answer: rechaza en revealing y no toca la respuesta guardada", afterReveal === false && kept.choice === "otro");

    // --- sweep_games: uncertain attempt is never re-posted; untouched attempt goes back to queue --
    const [uncertain] = await sql<{ id: string }[]>`
      insert into public.games (team_id, type, payload, slot_date, scheduled_for, status, post_attempted_at)
      values (${teamId}, 'guess_who', '{}'::jsonb, (now() at time zone 'America/Mexico_City')::date + 1, now(), 'posting', now())
      returning id`;
    const [untouched] = await sql<{ id: string }[]>`
      insert into public.games (team_id, type, payload, slot_date, scheduled_for, status)
      values (${teamId}, 'guess_who', '{}'::jsonb, (now() at time zone 'America/Mexico_City')::date + 2, now(), 'posting')
      returning id`;
    const swept = await sql<{ id: string; skip_reason: string }[]>`
      select id, skip_reason from public.sweep_games(${teamId}, now() + interval '20 minutes')`;
    const [u1] = await sql<{ status: string; skip_reason: string | null }[]>`select status, skip_reason from public.games where id = ${uncertain.id}`;
    const [u2] = await sql<{ status: string }[]>`select status from public.games where id = ${untouched.id}`;
    check(
      "sweep: intento incierto (> 15 min) → skipped(post_uncertain)",
      u1.status === "skipped" && u1.skip_reason === "post_uncertain" && swept.some((g) => g.id === uncertain.id),
    );
    check("sweep: posting sin intento → vuelve a queued", u2.status === "queued");

    // --- claim 'reveal': only ≥ 4 h after posting and ≥ 18:00 local -----------------------------
    // Park the earlier games in terminal states so a "stuck revealing" re-claim cannot leak into this check.
    await sql`update public.games set status = 'skipped', skip_reason = 'out_of_window' where id = ${untouched.id}`;
    await sql`update public.games set status = 'revealed' where id = ${gameId}`;
    const [revealGame] = await sql<{ id: string }[]>`
      insert into public.games (team_id, type, payload, slot_date, scheduled_for, status, posted_at, slack_channel_id, slack_ts)
      values (${teamId}, 'guess_who', '{}'::jsonb, date '2030-01-09', timestamp '2030-01-09 10:00' at time zone 'America/Mexico_City',
              'posted', (timestamp '2030-01-09 12:00' at time zone 'America/Mexico_City') - interval '5 hours', 'CSMOKE', '2.2')
      returning id`;
    const noon = await sql`select id from public.claim_due_games(${teamId}, 'reveal', timestamp '2030-01-09 12:00' at time zone 'America/Mexico_City')`;
    check("claim 'reveal': a las 12:00 local no revela aunque pasaron 4 h", noon.length === 0);
    const evening = await sql<{ id: string }[]>`select id from public.claim_due_games(${teamId}, 'reveal', timestamp '2030-01-09 18:30' at time zone 'America/Mexico_City')`;
    check("claim 'reveal': a las 18:30 local sí revela", evening.length === 1 && evening[0].id === revealGame.id);

    // --- RLS: anon sees nothing but health() ------------------------------------------------------
    const anonGames = await anon.from("games").select("id").limit(1);
    check("RLS: la llave publicable no puede leer games", Boolean(anonGames.error), anonGames.error?.code ?? "sin error");
    const anonView = await anon.from("teams_admin").select("id").limit(1);
    check("RLS: la llave publicable no puede leer teams_admin", Boolean(anonView.error), anonView.error?.code ?? "sin error");
    const health = await anon.rpc("health");
    check("RLS: health() sí responde con la llave publicable", !health.error && Boolean(health.data));

    // --- Views filtered by auth.uid(): the admin sees only their own team ------------------------
    const session = await anon.auth.signInWithPassword({ email, password });
    check("Auth: el admin de prueba puede iniciar sesión con contraseña", !session.error && Boolean(session.data.session));
    const mine = await anon.from("teams_admin").select("id");
    check(
      "Vistas: teams_admin devuelve exactamente el equipo del admin",
      !mine.error && mine.data?.length === 1 && mine.data[0].id === teamId,
      mine.error?.message ?? `${mine.data?.length ?? 0} filas`,
    );
    const activity = await anon.rpc("admin_activity", { p_team_id: teamId });
    check("Vistas: admin_activity funciona para el propio equipo", !activity.error && activity.data?.members === 2, activity.error?.message);
    const [other] = await sql<{ id: string }[]>`select id from public.teams where id <> ${teamId} limit 1`;
    if (other) {
      const foreign = await anon.rpc("admin_activity", { p_team_id: other.id });
      check("Vistas: admin_activity rechaza el equipo de otra persona", Boolean(foreign.error));
      const foreignGames = await anon.from("games_admin").select("id").eq("team_id", other.id);
      check("Vistas: games_admin no muestra juegos de otro equipo", !foreignGames.error && foreignGames.data?.length === 0);
    }
    await anon.auth.signOut();
  } finally {
    // --- cleanup, in FK order ----------------------------------------------------------------------
    if (teamId) {
      await sql`delete from public.answers where game_id in (select id from public.games where team_id = ${teamId})`;
      await sql`delete from public.games where team_id = ${teamId}`;
      await sql`delete from public.facts where member_id in (select id from public.members where team_id = ${teamId})`;
      await sql`delete from public.members where team_id = ${teamId}`;
      await sql`delete from public.events where team_id = ${teamId}`;
      await sql`delete from public.teams where id = ${teamId}`;
    }
    if (secretId) await sql`delete from vault.secrets where id = ${secretId}`;
    if (userId) {
      const removed = await admin.auth.admin.deleteUser(userId);
      if (removed.error) console.error(`No pude borrar el usuario de prueba ${email}: ${removed.error.message}`);
    }
    await sql.end();
  }

  console.log(`\n${results.length - failures} de ${results.length} comprobaciones en verde.`);
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
});

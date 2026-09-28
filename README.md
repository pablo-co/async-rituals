# Rituales (async-rituals)

Bot de Slack que publica juegos cortos para que un equipo remoto se conozca, en piloto automático:
adivina quién, dos verdades y una mentira, trivia, esto o aquello y puzzle, más un recap del viernes.
El admin tiene una web mínima (Conectar · Cola · Actividad); el equipo solo juega en Slack.

**App en vivo:** https://async-rituals.vercel.app (cada `git push` a `main` la actualiza sola).

El plan completo vive en `docs/plans/async-rituals-mvp-plan.md`. Las reglas del proyecto, en `CLAUDE.md`.

## Correr en tu compu

```bash
npm install
cp .env.example .env.local   # y llena los valores (ver comentarios dentro)
npm run migrate              # aplica supabase/migrations en la base de Supabase
npm run dev                  # http://localhost:3000
```

`GET /api/health` responde 200 cuando las variables requeridas existen y la base contesta;
503 con los nombres de lo que falta si no.

## Scripts

| comando            | qué hace                                                        |
| ------------------ | --------------------------------------------------------------- |
| `npm run dev`      | servidor de desarrollo                                          |
| `npm test`         | pruebas unitarias y de componentes (sin red)                    |
| `npm run typecheck`| revisa tipos                                                    |
| `npm run lint`     | revisa estilo de código                                         |
| `npm run migrate`  | aplica las migraciones pendientes (usa `DATABASE_URL`)          |
| `npm run smoke`    | prueba el SQL real con un equipo desechable (claim, Vault, RLS…) |
| `npm run eval`     | genera un juego de cada tipo con Anthropic y valida el formato   |
| `npm run seed:facts -- seed/facts.json` | carga hechos para Adivina quién                     |
| `npm run check:anthropic` | comprueba que la llave de Anthropic sirve                  |

## Estructura

```
app/            pantallas (login, conectar, cola, actividad) y rutas /api
components/     piezas de UI del tema Cálido (header, nav, alertas, filas)
lib/            lógica: tiempo por zona, Supabase, textos, plantillas de juego
supabase/       migraciones SQL (tablas, vistas, funciones, RLS)
scripts/        migrate, seed-facts, smoke
tests/          Vitest + Testing Library
```

## Comandos en Slack

| comando | qué hace |
| --- | --- |
| `/rituales stats` | "Esta semana: {p} puntos · racha: {r} juegos seguidos · total: {t}." (solo lo tuyo, en privado) |
| `/rituales hecho` | abre "Un hecho nuevo" para un Adivina quién |
| `/rituales salir` | dejas de participar (con botón "Volver a entrar") |
| `/rituales borrar-mis-datos` | avisa y, solo tras "Sí, borrar", borra tus hechos, respuestas y puntos |

El DM "Cuéntanos de ti" (botón **Contestar**) le llega a cada persona una vez: al entrar al canal o cuando el admin guarda
el canal en Conectar. Necesita la pestaña de Mensajes de la app encendida (está en `slack-app-manifest.json`).

## Hitos

Todos construidos: 0 esqueleto · 1 adivina quién · 2 juegos de botones + IA · 3 puntos, rachas, recap · 4 trivia y puzzle por
modal · 5 onboarding, `hecho`, `borrar-mis-datos`, dos verdades · 6 veto, generar, pausa, DM al admin, toasts · 7 stats, runbook,
pulido de escritorio. El estado detallado vive en `docs/BUILD-CONTEXT.md`.

---

## Runbook

Todo lo de abajo usa lo que ya hay en la Mac del admin técnico: `vercel` (CLI), `psql "$DATABASE_URL"` y `.env.local`.
Nunca `vercel env pull` sobre `.env.local` (las variables sensibles vuelven vacías y borran los valores reales).

### Después de cada deploy

1. https://async-rituals.vercel.app/api/health → `200` con `"ok":true`. Si da `503`, `missing` dice qué variable falta:
   agrégala con `vercel env add NOMBRE production --sensitive` y `vercel deploy --prod`.
2. Web → **Actividad** → **Salud** dice "Bot al día" (el tick corre cada hora y deja un `tick_run`).
3. **Cola** muestra el siguiente juego en su día; sale a las 10:00 de la zona del equipo y se revela después de las 18:00.

### "No salió el juego de hoy"

1. Actividad → Salud (se abre sola cuando está en rojo) o, en SQL:

   ```sql
   select slot_date, type, status, skip_reason, post_attempted_at, posted_at
     from games where slot_date = (now() at time zone 'America/Mexico_City')::date order by scheduled_for;
   select created_at, kind, detail from events order by created_at desc limit 30;
   ```

2. Según `skip_reason`:
   - `out_of_window`: ningún tick corrió entre las 10:00 y las 12:00 → ve "El cron está muerto".
   - `paused`: hay una pausa en Conectar.
   - `channel_error`: el bot no está en el canal → en Slack `/invite @Rituales` y vuelve a guardar el canal en Conectar.
   - `featured_inactive`: el protagonista salió del canal o del ritual; el siguiente relleno pone otro juego.
   - `template_error`: Slack rechazó el mensaje o la plantilla falló; `detail` trae el motivo exacto. Es un bug: reprodúcelo con
     `npm test` antes de tocar nada.
   - `post_uncertain`: no se sabe si llegó (Slack no contestó a tiempo). Revisa el canal. **Nunca se reintenta**, para no duplicar.
   - `sample`: no hay llave de Anthropic; revisa `/api/health`.
3. Si sigue `queued` y ya pasó la hora: el tick no ha corrido. Córrelo a mano (lee el secreto sin imprimirlo):

   ```bash
   curl -sS -H "Authorization: Bearer $(grep '^CRON_SECRET=' .env.local | cut -d= -f2- | tr -d '"')" https://async-rituals.vercel.app/api/tick
   ```

4. Si el equipo tiene `disconnected_at`: alguien quitó la app o revocó el token → Conectar → "Agregar a Slack" otra vez.

### "Salió duplicado"

El diseño lo impide por tres lados: un índice único por equipo y día, el reclamo atómico (`claim_due_games`) y el intento
registrado antes de llamar a Slack (un intento incierto termina en `post_uncertain`, nunca se repite). Si aun así aparece:
borra a mano el mensaje de más en Slack (el bot no borra mensajes), busca en `events` dos `posted` con el mismo `game_id` o dos
juegos con la misma `slot_date`, y guarda los dos `slack_ts` para reproducirlo.

### "El cron está muerto" (Salud: "sin señal desde…")

1. Vercel → proyecto → **Settings → Cron Jobs**: deben aparecer 24 (`0 H * * *` → `/api/tick`) con su última ejecución.
2. `vercel logs async-rituals.vercel.app --since 1h | grep /api/tick` (el plan Hobby guarda cerca de una hora de logs).
   Un `401` significa que `CRON_SECRET` no coincide (ver "Rotar secretos").
3. **Plan B** si Vercel Cron falla más de un día: que Supabase llame al tick cada 15 minutos con `pg_cron` + `pg_net`. Es seguro
   correrlo tan seguido: los reclamos son atómicos, las ventanas (publicar 10:00-12:00, revelar desde las 18:00) no cambian y el
   relleno solo corre con la cola baja. En Supabase → SQL Editor (pega el valor de `CRON_SECRET` ahí, nunca en el repo):

   ```sql
   select vault.create_secret('<CRON_SECRET>', 'cron_secret', 'Bearer para /api/tick');
   create extension if not exists pg_net;
   create extension if not exists pg_cron;
   select cron.schedule('rituales-tick', '*/15 * * * *', $$
     select net.http_get(
       url := 'https://async-rituals.vercel.app/api/tick',
       headers := jsonb_build_object('Authorization', 'Bearer ' ||
         (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
       timeout_milliseconds := 120000
     );
   $$);
   -- cuando Vercel Cron vuelva: select cron.unschedule('rituales-tick');
   ```

### Rotar secretos

- **`CRON_SECRET`** (si se filtró o cada tanto):

  ```bash
  NEW=$(openssl rand -hex 32)
  # reemplaza CRON_SECRET en .env.local por el valor de $NEW (con tu editor), y luego:
  vercel env rm CRON_SECRET production --yes
  printf '%s' "$NEW" | vercel env add CRON_SECRET production --sensitive
  vercel deploy --prod
  ```

  Vercel Cron manda el valor nuevo solo. Con el plan B activo, actualiza también Vault:
  `select vault.update_secret((select id from vault.secrets where name = 'cron_secret'), '<nuevo>');`
- **`SLACK_SIGNING_SECRET`**: api.slack.com/apps → Rituales → **Basic Information → App Credentials → Signing Secret →
  Regenerate**; ponlo en `.env.local` y súbelo igual que arriba (`--sensitive`) + `vercel deploy --prod`. Entre el "Regenerate" y el
  redeploy (~1 min) Slack recibe `401`: hazlo de noche. `SLACK_CLIENT_SECRET` se rota igual (solo afecta instalaciones nuevas).

### Distribución pública de Slack (antes del segundo equipo)

Hoy la app solo se puede instalar en el workspace donde se creó. Para un segundo equipo:

1. api.slack.com/apps → **Rituales → Manage Distribution**.
2. En "Share Your App with Other Workspaces", las casillas ya se cumplen (sin datos fijos en el código, redirect por HTTPS a
   `https://async-rituals.vercel.app/api/slack/oauth/callback`) → **Activate Public Distribution**. No hace falta publicarla en el
   Slack Marketplace.
3. El admin del otro equipo entra a https://async-rituals.vercel.app → **Crear cuenta** (correo y contraseña) → Conectar →
   **Agregar a Slack** → elige su workspace → canal y ritmo → **Guardar**.
4. Verifica en su Actividad: eventos "Slack conectado", "Saludé al canal" e "Invité a {n} personas a contar de sí".

Límite del MVP: una cuenta de admin administra un solo workspace.

### Datos de una persona

Cada quien los borra con `/rituales borrar-mis-datos`. Si alguien lo pide por otro medio, ese mismo borrado en SQL es
`delete from members where slack_user_id = '<U…>';` (borra en cascada sus hechos y respuestas); el comando es preferible porque
además saca de la cola los juegos sobre esa persona.

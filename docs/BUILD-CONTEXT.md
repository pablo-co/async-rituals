# BUILD-CONTEXT — estado real de la construcción y contexto para lo que falta

Última actualización: 2026-09-15 (fin del hito 1). Este archivo es el puente entre el plan
(`docs/plans/async-rituals-mvp-plan.md`, escrito antes de construir) y el código real.
**Cuando el plan y este archivo choquen en detalles de implementación (rutas, nombres, firmas), gana este archivo;
cuando choquen en decisiones de producto, gana el plan.** Actualízalo al cerrar cada hito.

Documentos de referencia (no repetidos aquí):
- `CLAUDE.md` → reglas de comunicación, diseño, wizard de raicode, env vars, login/correo.
- `docs/plans/async-rituals-mvp-plan.md` → plan activo: decisiones, registro de errores, diagramas, **sección Diseño**
  (textos literales de Slack y web: D-1A a D-7A) y **sección Ingeniería** (E-0 hitos, E-1A tick, E-1B fail-closed,
  E-1C OAuth, E-1D Vault, E-1E runs, E-2A módulos, E-3A pruebas), tareas T1-T19, DT1-DT11, ET1-ET7.
- `docs/designs/async-rituals-mvp.md` → design doc: modelo de datos, tabla de puntos, reglas de contenido, cola, tick, Slack.
- `docs/designs/ceo-plan-async-rituals-mvp.md` → las 6 expansiones aceptadas con detalle buildable (bienvenida, momento
  de la semana, pausa, hitos de racha, DM al admin, `/rituales hecho`) y los cambios al modelo de datos.
- `DESIGN.md` + `app/globals.css` → tema Cálido y utilidades (v1.1 del tema + v1.2 de este proyecto).
- `TODOS.md` → diferidos (anuario, semana suave).

---

## 1. Estado por hito

| Hito | Estado | Verificado |
| --- | --- | --- |
| 0 · Esqueleto en localhost | ✅ hecho | login real con Supabase Auth; 3 pantallas; `/api/health`; migración 0001 aplicada |
| 1 · Adivina quién de punta a punta | ✅ código publicado, **pendiente de prueba real en Slack** | rutas responden en producción (challenge, tick 401/200); falta: OAuth real, guardar canal, seed de hechos, primer post y reveal |
| 2 · Juegos de botones + IA | ⬜ | — |
| 3 · Puntos, rachas, recap | ⬜ | — |
| 4 · Trivia y puzzle por modal | ⬜ | — |
| 5 · Onboarding por modal | ⬜ | — |
| 6 · Veto, generar, pausa, DM admin, Salud | ⬜ (Salud ya se muestra en Actividad) | — |
| 7 · stats, README/runbook, pulido escritorio | ⬜ | — |

Infra ya lista: Supabase (proyecto `tpnnocckdmygxfgizefk`, migración 0001), Vercel (`https://async-rituals.vercel.app`,
proyecto `personal-af85/async-rituals`, repo conectado: cada push a `main` deploya), 24 crons en `vercel.json`,
app de Slack "Rituales" creada desde `slack-app-manifest.json` (llaves en `.env.local` y en Vercel).
Llave de Anthropic válida (`npm run check:anthropic`). Supabase Auth: "Confirm email" apagado; Site URL y Redirect URLs
apuntan a producción. **Distribución pública de la app de Slack: no activada** (necesaria solo para el segundo equipo).

Eventos de raicode ya disparados: `build-started`, `needs-supabase-setup`, `supabase-setup-complete`, `mvp-ready`,
`anthropic-setup-complete`, `needs-vercel-setup`, `vercel-setup-complete`. Pendientes en el futuro: `needs-email-setup`
(solo si la app manda correos), `logo-variants-ready` / `design-consultation-done` (solo desde el sub-flow de diseño).

---

## 2. Desviaciones respecto al plan (ya decididas, no reabrir)

- **Next.js 16** (no 15). `proxy.ts` sustituye a `middleware.ts`. `after()` de `next/server` funciona igual.
- Clientes de Supabase en `lib/supabase/{client,server,admin}.ts` (el plan decía `lib/db/server.ts`/`browser.ts`).
  `lib/db/` guarda consultas, tipos y sesión.
- Variables: `SUPABASE_SECRET_KEY` (llave `sb_secret_…`, no la legacy `service_role`), `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `DATABASE_URL` solo para `npm run migrate`, `APP_URL` (localhost en dev, la URL de Vercel en producción), `CRON_SECRET`
  (generado; Vercel lo manda solo en los crons).
- Migraciones con script propio (`npm run migrate`, tabla `public.schema_migrations`), no con la CLI de Supabase.
- El `fill` se llama **directo** (`fillTeam`) desde el tick y desde Conectar; `POST /api/queue/fill` existe para el botón
  "Generar otra semana" (hito 6) y para pruebas. Cuando entre la IA (hito 2), la ruta debe pasar a `202 + after()`.
- La ruta de salud prueba la base con `public.health()` y la llave publicable (no necesita la secreta).
- Las vistas `*_admin` son `security definer` con filtro `auth.uid()` (no `security_invoker`), y las tablas no tienen
  ningún grant para `anon`/`authenticated`. **Cada migración nueva que cree tablas, vistas o funciones debe terminar con el
  mismo bloque de REVOKE/GRANT que cierra `0001_init.sql`** (Supabase concede ALL por default a anon/authenticated).
- `claim_due_games` es **por equipo** (`p_team_id, p_kind, p_now`) porque `forEachTeam` ya aísla equipos. Cuando limpia una
  pausa vencida escribe `payload.resumed = true` en lo reclamado (el render agrega "Ya volvimos."). El barrido vive en
  `sweep_games(p_team_id, p_now)`.
- La bienvenida es condición del primer post: `postGame` salta con `channel_error` si `welcomed_channel_id <> channel_id`.
- `events.kind` es texto libre; `lib/events/labels.ts` tiene la etiqueta en español de cada kind que se escribe (prueba
  `tests/events-labels.test.ts` lo exige). Al agregar un kind nuevo: escribirlo en `EVENT_KINDS` y en `eventLabel`.

---

## 3. Mapa real del código

```
app/
  layout.tsx            fuentes Lora + Nunito Sans (next/font, variables inline que ganan al CSS), data-theme="calida",
                        script anti-FOUC del modo oscuro, <body class="app-shell">
  icon.tsx              favicon "R" (ImageResponse; colores espejo en lib/theme.ts)
  page.tsx              aterrizaje: sin sesión → /login · sin canal → /conectar · con canal → /cola
  login/                LoginForm (client): Entrar / Crear cuenta, errores literales D-2A
  (app)/layout.tsx      AppHeader + AppNav + <main class="page page-narrow has-bottom-nav"> + toast-region
  (app)/conectar/       page.tsx (estados por searchParams) · actions.ts (signOut, saveChannel, publishFirstNow)
  (app)/cola/page.tsx   sin canal: empty-state + vista previa con lib/ai/sample-content.json · con canal: games_admin
  (app)/actividad/      frase grande, meta, Salud (list-row / list-row-details), últimos juegos (admin_activity)
  api/health            200/503 con nombres de variables faltantes, db, anthropic, slack, cron
  api/tick              GET, Bearer CRON_SECRET, maxDuration 120 → lib/tick.runTick
  api/queue/fill        POST, cron (todos los equipos) o sesión del admin (su equipo)
  api/slack/install     sesión → state firmado → slack.com/oauth/v2/authorize
  api/slack/oauth/callback  state → sesión coincide → oauth.v2.access → rechazo E-1C → upsert teams → set_bot_token → resync si reconexión
  api/slack/events      url_verification sin firma; resto firmado: app_uninstalled/tokens_revoked, member_joined/left_channel (after)
  api/slack/interactions block_actions: `answer:{game_id}` → handleAnswerSubmission (after) · `rejoin`
  api/slack/commands    /rituales salir (opt-out + botón Volver a entrar) · otros → "pronto"
components/             AppHeader, AppNav (bottom-nav móvil / tabs escritorio), ThemeToggle (useSyncExternalStore),
                        Alert (alert-inline + tono), Badge (data-tone), ListRow, EmptyState, SubmitButton (useFormStatus)
lib/
  env.ts                REQUIRED_ENV / OPTIONAL_ENV, missingEnv, hasAnthropicKey, hasSlackConfig
  errors.ts             AppError, SlackError, TemplateError, AiOutputError, DbError (code opcional)
  time.ts               localParts, zonedTimeToUtc, nextSlotDates (nunca hoy ≥ 10:00 local, nunca fin de semana, respeta pausa),
                        slotScheduledFor, cadenceLabel, CADENCE_DAYS, POST_HOUR=10, REVEAL_HOUR=18
  format.ts             formatSlotDate ("Mié 17"), formatLongDate ("17 de septiembre"), relativeTime
  runs.ts               startRun, forEachTeam (try/catch por equipo → evento team_error), finishRun, count
  tick.ts               sweepPhase, postGame, revealGame, tickTeam, runTick (diagrama de estados en el encabezado)
  answers.ts            handleAnswerSubmission (submit_answer antes de contestar; efímeros literales)
  cron.ts               authorizedCron
  queue/fill.ts         QUEUE_TARGET=8, QUEUE_LOW=3, pickSlotDates, futureQueue, fillTeam (rotación por índice)
  games/types.ts        GameType, GameStatus, SkipReason, GAME_LABELS, ROTATION
  games/template.ts     GameTemplate (generate/render/score/reveal/closed), contentHash, activeMembers, memberName
  games/registry.ts     TEMPLATES (hoy solo guess_who), templateFor, availableRotation
  games/guess-who.ts    plantilla completa (opciones al publicar; ≤6 botones o static_select)
  games/questions.ts    las 10 preguntas D-7A (QUESTIONS, QUESTION_KEYS, leadInFor, ANSWER_MAX_LENGTH=280)
  slack/strings.ts      TODOS los textos del bot + LIMITS + clampLabel
  slack/blocks.ts       header, section, context, button, answerButtons, answerSelect, actions
  slack/verify.ts       verifySlackSignature, signSlackRequest, parseSlackBody, withSlackRequest({allowUnsigned}), ephemeral, postToResponseUrl
  slack/errors.ts       mapSlackError → disconnected | channel | transient | other; describeSlackError
  slack/client.ts       slackClientFor(token), getSlackClient(db, teamId) (token vía rpc get_bot_token; reintentos cortos)
  slack/oauth.ts        SLACK_SCOPES, signState/verifyState (10 min), slackAuthorizeUrl, oauthRedirectUri
  slack/members.ts      listPublicChannels, syncMembers (bots y desactivados fuera; bajas → left_at + facts.retired)
  slack/messages/welcome.ts  welcomeText(team)
  slack/text.ts         escapeSlackText (&, <, >), truncate
  events/index.ts       logEvent(db, {teamId, runId, kind, gameId, detail})
  events/labels.ts      EVENT_KINDS, eventLabel, SKIP_REASON_LABELS
  db/types.ts           TeamAdmin/GameAdmin/EventAdmin/AdminActivity (vistas) + TeamRow/MemberRow/FactRow/GameRow/AnswerRow (tablas)
  db/queries.ts         getAdminTeam, getQueue, getActivity (cliente con sesión, RLS)
  db/teams.ts           findTeamBySlackId / ById / ByAdmin (service role)
  db/session.ts         requireAdmin() → { user, team: TeamRow | null } (redirige a /login)
  supabase/             client.ts (browser) · server.ts (cookies) · admin.ts (service role, server-only)
  ai/sample-content.json  5 juegos de muestra (solo vista previa de Cola por ahora)
supabase/migrations/0001_init.sql   esquema v1 completo (ver §4)
scripts/                migrate.ts · seed-facts.ts (JSON con name|slack_user_id, question_key, text) · check-anthropic.ts
tests/                  Vitest + Testing Library; `server-only` se alias a tests/empty.ts (vitest.config.mts)
vercel.json             24 crons `0 H * * *` → /api/tick
slack-app-manifest.json fuente de verdad de la app de Slack (scopes, URLs, eventos)
```

Scripts: `npm run dev` · `npm test` · `npm run typecheck` · `npm run lint` · `npm run build` · `npm run migrate` ·
`npm run seed:facts -- seed/facts.json` · `npm run check:anthropic`. Dev server desde Claude: `.claude/launch.json` → `rituales-dev`.

---

## 4. Base de datos (lo que existe hoy)

Tablas: `teams`, `members`, `facts`, `games`, `answers`, `events` (+ `schema_migrations`). Enums: `game_type`, `game_status`,
`skip_reason` (incluye `sample` y `post_uncertain`), `fact_kind`, `fact_source`. RLS encendido en todo, sin políticas
(solo service role toca tablas). Vistas para `authenticated`: `teams_admin`, `games_admin` (con `preview` solo para
trivia/this_or_that/puzzle/recap), `events_admin`. Funciones: `admin_activity(uuid)` (authenticated), `health()` (anon),
y solo service role: `claim_due_games(team, kind, now)`, `sweep_games(team, now)`, `submit_answer(game, member, value)`,
`set_bot_token(team, token)`, `get_bot_token(team)`, `prune_events()`. Trigger `validate_team` (zona IANA + updated_at).

Convenciones de `games.payload` por tipo (las que existen y las que faltan deben seguir el mismo estilo):
- `guess_who`: `{ fact_id, featured_member_id, question_key, text, resumed? }`.
- Todo tipo con pregunta visible debe escribir **`payload.preview`** (texto seguro para el admin antes del reveal):
  `this_or_that` (la pregunta), `trivia` (título o "3 preguntas: …"), `puzzle` (el acertijo), `recap` (opcional).
- `this_or_that`: `{ preview, question, options: [a, b], reveal_quip }` (el quip se genera en el fill, nunca al reveal).
- `two_truths`: `{ fact_id, featured_member_id, statements: [3], lie_index }` (sin `preview`).
- `trivia`: `{ preview, questions: [{ q, options: [3-4], correct }] }` · `answers.value = { q1: 'b', … }` → `correct_count` al reveal.
- `puzzle`: `{ preview, prompt, accepted_answers: [] }` · `answers.value = { text }` → comparación normalizada al reveal.
- `recap`: `{ week_start, week_end }` (se llena al publicar con las vistas).

`facts.payload`: `fact` → `{ question_key, text }` · `two_truths` → `{ statements: [3], lie_index }`.
`used_at` se marca al llegar a `posted` (lo hace `postGame` leyendo `payload.fact_id`); vale para `two_truths` también.

Pendiente de migración (hito 3, `0002_scores.sql`): vistas/funciones de **puntos por juego**, **puntos de la semana**,
**tabla semanal**, **racha vigente** (definición exacta en el plan CEO, "Vista de rachas"), y `member_streaks(team)`.
Pendiente (hito 6): nada nuevo en esquema; `paused_until`, `material_alert_sent_at`, `channel_error_at` ya existen.

---

## 5. Contratos que las próximas features deben respetar

- **Una plantilla = un archivo en `lib/games/<tipo>.ts`** que implementa `GameTemplate` y se registra en `TEMPLATES`
  (`lib/games/registry.ts`). El tick y el fill no conocen tipos concretos. `generate` devuelve `null` si no hay material
  (la rotación pasa a la siguiente). `render` lanza `TemplateError` con `code: "featured_inactive"` o `"template_error"`.
  `closed` es el post sin botones para `no_answers`. Los textos de reveal por plantilla van en `lib/slack/strings.ts`.
- **Puntos** (design doc, tabla "Puntos"): adivina quién y dos verdades 1 por jugar +2 por acertar, protagonista +1 por
  engañado (máx. 5); trivia 1 + 1 por pregunta + 2 por ronda perfecta; esto o aquello 1; puzzle 1 + 2. Nunca por velocidad.
  `score()` devuelve `correct_count` por respuesta; los puntos se calculan en SQL (hito 3) a partir de `correct_count`,
  `payload` y `featured_member_id`, no en TypeScript.
- **Slack**: todo request entra por `withSlackRequest`; toda respuesta a un botón por `handleAnswerSubmission`; toda
  llamada usa `getSlackClient` (token de Vault); todo error de Slack pasa por `mapSlackError`. Nunca `<@U…>` ni `@channel`;
  nombres planos desde `display_name` escapados con `escapeSlackText`. Un emoji máximo por mensaje (excepción: puzzle de emojis).
  Modales (hito 4/5): `views.open` **antes** del 200, `private_metadata` con `game_id` y `channel_id`; en `view_submission`
  la escritura va antes de responder (`response_action: errors | clear`) y la confirmación por `chat.postEphemeral`.
- **Nunca IA dentro de un handler de Slack.** La IA (hito 2) vive en `lib/ai/generate.ts`: Anthropic con tool use +
  esquema `zod` por plantilla, un reintento con el error en el prompt, luego `null` → rotación; evento `generation_failed`.
  Modelo: el más capaz disponible al construir (ver CLAUDE.md, "Environment"); temas excluidos en `lib/ai/prompts.ts`
  (política, religión, sexo, alcohol y drogas, apuestas, cuerpo y apariencia, tragedias, referencias de un solo país).
  Sin `ANTHROPIC_API_KEY`: contenido de `lib/ai/sample-content.json` con `is_sample = true` (el tick lo salta con `sample`).
- **Nunca repetir**: `content_hash` (ya calculado por `contentHash`) + las últimas 30 preguntas del equipo como exclusión en el prompt.
- **Web**: solo componentes del tema (`DESIGN.md`); nada de hex ni px inventados; alertas con `<Alert>`; filas con
  `<ListRow>`; estados vacíos con `<EmptyState>`; acciones con server actions + `SubmitButton`; feedback por `searchParams`
  (`?saved=1`, `?error=code`) hasta que exista el `toast` (hito 6: región `toast-region` ya está en el layout).
  Toda acción que borra pregunta antes (hoja/modal del tema con foco en Cancelar).
- **Eventos**: `logEvent` en cada rama; `detail` nunca lleva tokens ni nombres de personas; `run_id` cuando hay corrida.
- **Pruebas**: cada plantilla nueva trae `tests/<tipo>.test.ts` (render, score, reveal, closed, escape); cada texto nuevo
  del bot respeta `LIMITS`; `npm test` corre sin red. Lo que toca SQL real se prueba con `scripts/smoke.ts` (pendiente, T6).

---

## 6. Lo que falta, hito por hito (con archivos)

### Hito 1 · cierre (pendiente de Pablo + verificación)
1. Pablo: "Agregar a Slack" en `/conectar`, elegir canal, Guardar (bienvenida + miembros + fill vacío porque no hay hechos).
2. Cargar hechos: escribir `seed/facts.json` con lo que Pablo mande → `npm run seed:facts -- seed/facts.json`.
3. Rellenar la cola: `curl -X POST https://async-rituals.vercel.app/api/queue/fill -H "Authorization: Bearer $CRON_SECRET"`.
4. Pablo: "Publicar el primero ahora" → verificar post, botón, ack efímero, reveal (≥ 4 h y ≥ 18:00 local) e hilo.
5. `scripts/smoke.ts` (T6, ET7): claim concurrente, `submit_answer` tras `revealing`, RLS, Vault. Marcar `gstack-shortcut(dec-88b9fc96)`.
6. Pruebas del tick con `db` y `slack` falsos (fases con `now` inyectado) — hoy no existen.

### Hito 2 · Juegos de botones + IA
- `lib/games/two-truths.ts`: material de `facts` kind `two_truths` sin usar (misma reserva que guess_who); render: 3 frases
  numeradas + 3 botones "1", "2", "3" (`value` = índice); score: `choice === lie_index`; reveal D-1A
  ("La mentira era: «{frase}»." · hilo "Le atinaron … (+2). {Autor} engañó a {n} (+{n}).").
- `lib/games/this-or-that.ts`: generate con IA (`payload.preview`, `options`, `reveal_quip`); render: 2 botones; score: null;
  reveal: "{A}: {n} · {B}: {m}." + hilo con `reveal_quip`.
- `lib/ai/generate.ts` + `lib/ai/prompts.ts` + esquemas zod por plantilla; `evals/content.test.ts` condicionado a la llave.
- Contenido de muestra: `fillTeam` usa `sample-content.json` (`isSample: true`) cuando no hay llave; Cola y Conectar
  muestran el `alert-warning` de D-2D (Cola ya lo hace).
- `POST /api/queue/fill` → `202 + after()` y polling en Cola ("Generando…", D-2B).

### Hito 3 · Puntos, rachas, recap
- `supabase/migrations/0002_scores.sql`: vistas de puntos por juego / semana / tabla, racha vigente, `member_streaks`.
- `lib/games/recap.ts`: tipo `recap`, `scheduled_for` viernes 18:00 local (`slotScheduledFor(date, tz, REVEAL_HOUR)`),
  el fill inserta una fila por viernes (índice parcial evita duplicados); orden fijo D-1A: momento de la semana (plan CEO 2),
  racha viva más larga, top 3 con puntos de esa semana, "{n} de {m} jugaron esta semana"; sin juegos revelados → no se publica.
  El recap es terminal en `posted` (el claim de reveal ya excluye `recap`).
- Hitos de racha en el hilo del reveal (plan CEO 4): línea única, sin emoji, falla en suave → en `revealGame`, no en la plantilla.
- `/rituales stats` queda para el hito 7 pero usa estas vistas.

### Hito 4 · Trivia y puzzle por modal
- `lib/games/trivia.ts`, `lib/games/puzzle.ts` (IA); render: un botón "Jugar" (`action_id: play:{game_id}`).
- `lib/slack/modals/{trivia,puzzle}.ts` (D-2D: títulos "Trivia"/"Puzzle", submit "Enviar", close "Cancelar", `initial_option`
  al reabrir, `max_length` 80 en puzzle, hint literal). En `interactions`: `play:` → `views.open` antes del 200;
  `view_submission` → `submit_answer` antes de responder; `response_action: errors` "Este juego ya cerró." o `clear` +
  `chat.postEphemeral` "Guardado: {n} respuestas…". Extender `handleAnswerSubmission` para valores de modal.
- Normalización del puzzle (minúsculas, sin acentos ni puntuación) en `score`.

### Hito 5 · Onboarding por modal
- `lib/slack/modals/onboarding.ts` (título "Cuéntanos de ti", 10 inputs opcionales de `QUESTIONS`, bloque opcional de dos
  verdades con validación "3 frases y marca la mentira, o las tres vacías", `context` de consentimiento).
- DM con botón "Contestar" al entrar al canal (`member_joined_channel`) y al guardar canal (`saveChannelAction`) para los
  miembros con `onboarding_done = false`. `view_submission` guarda en `facts` (source `onboarding`), `onboarding_done = true`.
- `/rituales borrar-mis-datos` (efímero + botón "Sí, borrar" `style: danger`; el borrado ocurre en `block_actions`),
  `/rituales hecho` (modal de una pregunta, `question_key: 'free'`, insert antes de responder, resetea `material_alert_sent_at`).
- Sustituye la semilla: `scripts/seed-facts.ts` queda solo para arranques.

### Hito 6 · Veto, generar, pausa, DM al admin, Salud
- Cola: botón "Vetar" por fila → `components/VetoSheet.tsx` (hoja/modal del tema, foco en Cancelar, Esc y clic afuera),
  server action `vetoGame` (`update … set status='vetoed' where status='queued'`), fila "por rellenar"; "Generar otra semana"
  → `POST /api/queue/fill` + polling; deshabilitado con ≥ 10 slots.
- Conectar: sección Pausa (`<input type="date">` mínimo hoy en `teams.timezone`, "Pausar hasta el [fecha], incluido",
  "Quitar pausa"); "Publicar el primero ahora" deshabilitado en pausa. Evento `paused`/`resumed`.
- DM al admin (`lib/slack/messages/admin-alert.ts`, plan CEO 5): disparadores a-d, tope 7 días con `material_alert_sent_at`,
  `channel_error` en transición null→fecha, textos literales D-2D, **nunca nombres**. Hoy `postGame` ya escribe
  `channel_error_at`; falta el DM (`im:write` ya está en scopes; usar `chat.postMessage` al `admin_slack_user_id`).
- `sweep_games` ya devuelve `post_uncertain`: falta el DM "No sé si el juego del {día} llegó al canal…".
- Toasts reales (`toast` del tema) en lugar de alertas por `searchParams` para Guardado / Vetado / Pausado.

### Hito 7 · Cierre
- `/rituales stats` ("Esta semana: {p} puntos · racha: {r} · total: {t}").
- README: runbook ("no salió el juego", "duplicado", "cron muerto" → plan B `pg_cron` + `pg_net` cada 15 min), lista
  post-deploy (`/api/health` 200 → Actividad Salud → primer post), rotación manual de `CRON_SECRET` y `SLACK_SIGNING_SECRET`.
- Pulido de escritorio (tabs ya existen; revisar 640 px y modales centrados), `prefers-reduced-motion` (ya en el tema).
- Activar distribución pública de la app de Slack antes del segundo equipo (Settings → Manage Distribution).

---

## 7. Cómo probar cada pieza sin Slack real

- Firma: `signSlackRequest(secret, ts, body)` (`lib/slack/verify.ts`) para fixtures.
- Tick local: `npm run dev` y `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/tick` (lee `.env.local`).
- SQL directo: `psql "$DATABASE_URL"` (psql está instalado en la Mac de Pablo). `sweep_games`/`claim_due_games` aceptan `p_now`
  para simular horas: `select * from claim_due_games('<team>', 'post', '2026-09-18 16:05+00');`.
- Vercel: `vercel env ls production`, `vercel ls`, `vercel inspect <url> --logs`. Nunca `vercel env pull` sobre `.env.local`.

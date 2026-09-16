# BUILD-CONTEXT — estado real de la construcción y contexto para lo que falta

Última actualización: 2026-09-16 (hitos 2 y 4 construidos salvo Dos verdades; Pablo pidió jugar primero los juegos de IA). Este archivo es el puente entre el plan
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
| 1 · Adivina quién de punta a punta | ✅ código publicado y probado, **pendiente de prueba real en Slack** | OAuth real hecho (equipo Kublau, canal #rituales-bot, bienvenida enviada, crons corriendo); pruebas del tick y de respuestas con base falsa (`tests/tick.test.ts`, `tests/answers.test.ts`); `npm run smoke` 20/20 contra la base real; falta: ≥ 2 personas en el canal, seed de hechos, primer post y reveal |
| 2 · Juegos de botones + IA | ✅ Esto o aquello + capa de IA; ⬜ Dos verdades (espera material del onboarding, hito 5) | `npm run eval` 3/3 con `claude-opus-5`; pruebas de plantilla, esquemas y fill; falta la prueba real en Slack |
| 3 · Puntos, rachas, recap | ⬜ | — |
| 4 · Trivia y puzzle por modal | ✅ código | `tests/play.test.ts` (modal, initial_option, errores, submit_answer antes de responder); falta la prueba real en Slack |
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
- **Orden de construcción cambiado por Pablo (2026-09-16):** primero los juegos de IA (esto o aquello, trivia, puzzle); Adivina
  quién y Dos verdades esperan a que él quiera cargar hechos. La rotación no cambia: `guess_who`/`two_truths` devuelven `null` sin
  material y el slot pasa a la siguiente plantilla. `preferDifferent` (fill) mueve al final la plantilla del slot anterior para no
  repetir dos veces seguidas cuando falta material.
- **IA:** modelo por defecto `claude-opus-5` (`ANTHROPIC_MODEL` lo cambia); una llamada por juego con tool use, `max_tokens` 1500,
  un reintento con el error de zod en el prompt. Sin llave: `sampleGame(type)` (`lib/ai/sample.ts`) con `is_sample = true`.
- **Esto o aquello** guarda `quips: [paraA, paraB]` (no un solo `reveal_quip`): al revelar se publica el del lado minoritario
  (empate → A). `answers.value = { choice: "0" | "1" }` y el ack usa `template.labelFor`.
- **Trivia:** `answers.value = { choices: number[] }` (índice por pregunta). **Puzzle:** `answers.value = { text }`; `normalizeAnswer`
  también quita el artículo inicial (el/la/un/una/the…).
- El fill desde la web es asíncrono: `saveChannelAction` y `POST /api/queue/fill` (sesión) lo corren en `after()` y responden de
  inmediato; Cola recibe `?generating=1` y `components/QueuePoller.tsx` refresca cada 4 s hasta 20 veces o hasta llenar `QUEUE_TARGET`.
  Con `CRON_SECRET` el fill sigue siendo síncrono (para el cron y para pruebas manuales).

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
  api/slack/interactions block_actions: `answer:{game_id}` → handleAnswerSubmission (after) · `play:{game_id}` → openPlayModal
                        (await, antes del 200) · `rejoin` · view_submission → handleViewSubmission (JSON response_action)
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
  games/registry.ts     TEMPLATES (guess_who, this_or_that, trivia, puzzle), templateFor, availableRotation
  games/guess-who.ts    plantilla completa (opciones al publicar; ≤6 botones o static_select)
  games/this-or-that.ts IA; 2 botones (value "0"/"1"); labelFor; reveal "{A}: n · {B}: m." + quip minoritario en hilo
  games/trivia.ts       IA; botón Jugar (`play:{game_id}`); score = aciertos; reveal "Respuestas: 1 … · 2 … · 3 …" + ronda perfecta
  games/puzzle.ts       IA; botón Jugar; normalizeAnswer/isAccepted; reveal "La respuesta era: *…*." + "Lo resolvieron …"
  ai/schemas.ts         zod: thisOrThatSchema, triviaSchema, puzzleSchema; toolInputSchema (JSON Schema draft-7 sin $schema)
  ai/prompts.ts         SYSTEM_PROMPT + EXCLUDED_TOPICS + prompt por plantilla con la lista "temas ya usados"
  ai/generate.ts        generateStructured (tool use + zod + 1 reintento), recentPreviews, generateThisOrThat/Trivia/Puzzle, aiModel
  ai/sample.ts          sampleGame(type) → GeneratedGame con isSample cuando no hay llave
  play.ts               openPlayModal (views.open antes del 200) · handleViewSubmission (submit_answer → errors | clear + postEphemeral)
  slack/modals/trivia.ts  triviaModal (radio_buttons obligatorios, initial_option) · readTriviaSubmission
  slack/modals/puzzle.ts  puzzleModal (plain_text_input max 80 + hint) · readPuzzleSubmission
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
  ai/sample-content.json  muestras de this_or_that/trivia/puzzle (vista previa de Cola y relleno sin llave)
components/QueuePoller.tsx  cliente: router.refresh() cada 4 s mientras la cola se genera (?generating=1)
evals/content.test.ts       generación en vivo (opt-in con `npm run eval`; `npm test` la salta)
supabase/migrations/0001_init.sql   esquema v1 completo (ver §4)
scripts/                migrate.ts · seed-facts.ts (JSON con name|slack_user_id, question_key, text) · check-anthropic.ts ·
                        smoke.ts (equipo desechable contra la base real: Vault, claim concurrente, submit_answer, sweep, ventana de reveal, RLS, vistas)
tests/                  Vitest + Testing Library; `server-only` se alias a tests/empty.ts (vitest.config.mts)
  helpers/fake-db.ts    Supabase en memoria (from/select/update/insert + filtros + embeds + rpc) con `defaultRpcs` que imitan
                        sweep_games / claim_due_games / submit_answer / get_bot_token; `db.add(...)` siembra, `db.events(kind)` lee
  helpers/fixtures.ts   team/member/fact/game/answer, fakeSlack() (chat.postMessage/update grabados), slackPlatformError(code)
  tick.test.ts          postGame/revealGame/tickTeam/runTick: fail-closed, desconexión, canal, reveal idempotente, refill, aislamiento
  answers.test.ts       handleAnswerSubmission con fetch simulado (Guardado / Cambiado / protagonista / cerró / fuera)
vercel.json             24 crons `0 H * * *` → /api/tick
slack-app-manifest.json fuente de verdad de la app de Slack (scopes, URLs, eventos)
```

Scripts: `npm run dev` · `npm test` · `npm run typecheck` · `npm run lint` · `npm run build` · `npm run migrate` ·
`npm run seed:facts -- seed/facts.json` · `npm run check:anthropic` · `npm run smoke` (crea y borra un equipo `SMOKE-…` con su usuario
de auth; corre contra la base real, nunca en paralelo con otro smoke). Dev server desde Claude: `.claude/launch.json` → `rituales-dev`.

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
- `this_or_that`: `{ preview, question, options: [a, b], quips: [paraA, paraB] }` (los quips se generan en el fill, nunca al reveal).
- `two_truths`: `{ fact_id, featured_member_id, statements: [3], lie_index }` (sin `preview`).
- `trivia`: `{ preview, title, questions: [{ q, options: [3-4], correct }] }` · `answers.value = { choices: number[] }` → `correct_count` al reveal.
- `puzzle`: `{ preview, prompt, answer, accepted_answers: [] }` · `answers.value = { text }` → comparación normalizada al reveal.
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

### Hito 1 · cierre (pospuesto por Pablo: primero los juegos de IA)
1. ✅ Pablo conectó Slack (2026-09-16): equipo Kublau, canal #rituales-bot, cadencia 5, bienvenida enviada. **Solo hay una
   persona en el canal** (Pablo): Adivina quién necesita ≥ 2 activos (el render lanza "No hay nadie que pueda adivinar" y el
   juego se salta con `template_error`). Conectar ya avisa con `alert-warning` y esconde "Publicar el primero ahora" mientras
   haya < 2. Los miembros nuevos entran por `member_joined_channel` o al volver a guardar el canal (`syncMembers`).
2. Cargar hechos: escribir `seed/facts.json` (gitignored) con lo que Pablo mande → `npm run seed:facts -- seed/facts.json`.
3. Rellenar la cola: `curl -X POST https://async-rituals.vercel.app/api/queue/fill -H "Authorization: Bearer $CRON_SECRET"`.
4. Pablo: "Publicar el primero ahora" → verificar post, botón, ack efímero, reveal (≥ 4 h y ≥ 18:00 local) e hilo.
5. ✅ `scripts/smoke.ts` (T6, ET7) con `gstack-shortcut(dec-88b9fc96)`: 20 comprobaciones en verde el 2026-09-16.
6. ✅ Pruebas del tick y de respuestas con base y Slack falsos (`tests/helpers/*`). Al agregar plantillas o fases nuevas,
   extender `defaultRpcs` solo si el SQL real cambia (la verdad del SQL la prueba el smoke, no la base falsa).

### Hito 2 · Juegos de botones + IA
- ✅ `this-or-that.ts`, capa de IA (`lib/ai/*`), muestras sin llave, `POST /api/queue/fill` 202 + `after()`, polling en Cola,
  aviso sin llave en Cola y Conectar.
- ⬜ `lib/games/two-truths.ts`: material de `facts` kind `two_truths` sin usar (misma reserva que guess_who); render: 3 frases
  numeradas + 3 botones "1", "2", "3" (`value` = índice); score: `choice === lie_index`; reveal D-1A
  ("La mentira era: «{frase}»." · hilo "Le atinaron … (+2). {Autor} engañó a {n} (+{n}).") + `labelFor` → la frase elegida.
  Registrarla en `TEMPLATES`; actualizar `tests/fill.test.ts` (rotación) y agregar `tests/two-truths.test.ts`.
- ⬜ Prueba real en Slack de esto o aquello, trivia y puzzle (post, botón/modal, ack, reveal e hilo).

### Hito 3 · Puntos, rachas, recap
- `supabase/migrations/0002_scores.sql`: vistas de puntos por juego / semana / tabla, racha vigente, `member_streaks`.
- `lib/games/recap.ts`: tipo `recap`, `scheduled_for` viernes 18:00 local (`slotScheduledFor(date, tz, REVEAL_HOUR)`),
  el fill inserta una fila por viernes (índice parcial evita duplicados); orden fijo D-1A: momento de la semana (plan CEO 2),
  racha viva más larga, top 3 con puntos de esa semana, "{n} de {m} jugaron esta semana"; sin juegos revelados → no se publica.
  El recap es terminal en `posted` (el claim de reveal ya excluye `recap`).
- Hitos de racha en el hilo del reveal (plan CEO 4): línea única, sin emoji, falla en suave → en `revealGame`, no en la plantilla.
- `/rituales stats` queda para el hito 7 pero usa estas vistas.

### Hito 4 · Trivia y puzzle por modal
- ✅ Todo el código (`lib/games/{trivia,puzzle}.ts`, `lib/slack/modals/*`, `lib/play.ts`, ruta de interacciones). Los modales no
  pasan por `handleAnswerSubmission`: tienen su propio camino en `handleViewSubmission` (mismo contrato: `submit_answer` antes de
  responder, nunca "Guardado" sin guardar).
- ⬜ Prueba real en Slack (ver hito 2).

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

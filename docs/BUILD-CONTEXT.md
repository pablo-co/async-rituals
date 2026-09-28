# BUILD-CONTEXT — estado real de la construcción y contexto para lo que falta

Última actualización: 2026-09-28 (hitos 3 y 5 cerrados: puntos, rachas, recap, onboarding por DM, `/rituales hecho`,
`borrar-mis-datos` y Dos verdades; arreglos de "Jugar"/"Enviar" en producción; 7 personas activas en #rituales-bot, 0 hechos
hasta que contesten el onboarding). Este archivo es el puente entre el plan
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
| 1 · Adivina quién de punta a punta | ✅ código publicado y probado; **sin hechos todavía** (Pablo pospuso cargarlos: llegan con el onboarding del hito 5) | OAuth real (equipo Kublau, canal #rituales-bot, bienvenida enviada, crons corriendo); **7 personas activas** (4 entraron el 2026-09-28); `npm run smoke` contra la base real; falta: hechos → primer Adivina quién real |
| 2 · Juegos de botones + IA | ✅ Esto o aquello + capa de IA + Dos verdades (código; sale en cuanto alguien llene el bloque de dos verdades) | `npm run eval` 3/3 con `claude-opus-5`; el arreglo de `action_id` duplicado está en producción: **el Esto o aquello del miércoles 30 de septiembre es la primera prueba real** (revisar sus eventos) |
| 3 · Puntos, rachas, recap | ✅ (2026-09-28) | `0002_scores.sql` aplicada; `npm run smoke` 30/30 (puntos por plantilla, rachas, recap, momento, RLS); `tests/{recap,scores}.test.ts` + tick (hitos en el hilo, recap después de los reveals del viernes); primer recap real: viernes 2 de octubre ≥ 18:00 |
| 4 · Trivia y puzzle por modal | ✅ en producción, jugado por el equipo | trivia y puzzle se juegan desde el 16 de septiembre; arreglados en producción: "Enviar" con error de Slack en arranque en frío (24-sep) y "Jugar" con `expired_trigger_id` (28-sep, ver §6 hito 4) |
| 5 · Onboarding por modal | ✅ código (2026-09-28); **falta que Pablo actualice el manifest y vuelva a guardar el canal** para que salgan los DMs | `0003_onboarding.sql` aplicada; `tests/{onboarding,onboarding-modal,two-truths}.test.ts`; smoke 31/31 |
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
- **Recap (hito 3):** no está en la rotación. `ensureRecaps` (`lib/queue/fill.ts`) lo encola en cada tick y en cada fill para los
  próximos 2 viernes que todavía se pueden publicar (18:00 local + 2 h), fuera de la pausa, y **nunca recrea** un viernes que ya tenga
  recap en cualquier estado (vetado o saltado se respeta). Semana sin revelados → `skipped(no_answers)` (no hay motivo propio para
  evitar un `ALTER TYPE … ADD VALUE` dentro de la transacción de la migración). Racha más larga solo si es ≥ 2; top 3 incluye empates
  con el tercero hasta 5 nombres. Evento `recap_posted`. Líneas decorativas que fallan → evento `decoration_failed` y el mensaje sale sin ellas.
- **Onboarding (hito 5):** el DM "Contestar" sale **una vez por persona** (`members.onboarding_invited_at`, 0003; se escribe solo si el
  DM llegó) al entrar al canal y al guardar el canal. El botón lleva `"{team_id}:{member_id}"` como `value` para abrir el modal en
  una sola ida a la base (miembro + respuestas sin usar + token en paralelo); se verifica que el `slack_user_id` coincida. El guardado
  (en `after()`, como trivia) hace un **diff** contra los hechos de onboarding sin usar: iguales se quedan, los quitados o cambiados
  se borran y **se vetan los juegos en cola que los usaban** (evento `fact_withdrawn`), los nuevos se insertan; el DM cambia a
  "Gracias… · Cambiar mis respuestas". Enviar vacío = error ("Contesta al menos una pregunta…"): para borrar todo está
  `borrar-mis-datos`. `onboarding_done` = contestó algo.
- **`/rituales` responde 200 vacío al instante** y trabaja en `after()` contestando por `response_url` (antes leía la base dos veces
  antes de responder: en frío podía pasar los 3 s de Slack). `hecho` abre el modal igual que "Jugar" (si vence el `trigger_id`,
  botón "Escribir un hecho"); guarda en `after()` y confirma con efímero "Guardado. Puede salir en un próximo Adivina quién."
  (desviación del plan CEO 6, que guardaba antes de responder: mismo motivo que D-2D).
- **`borrar-mis-datos`:** avisa y no borra nada hasta "Sí, borrar". Borra respuestas, hechos y la fila del miembro, veta los juegos
  en cola sobre la persona, y si sigue en el canal crea una **fila nueva** (mismo id de Slack y nombre de Slack, conserva el opt-out,
  sin historial ni puntos, `onboarding_invited_at` puesto para no reinvitarla). Así "si vuelves a jugar, empiezas de cero" es verdad
  sin esperar a otra sincronización.
- **`preferDifferent`** manda la plantilla anterior al final **esté donde esté** en el orden (antes solo si iba primera: con Dos
  verdades sin material, `[two_truths, trivia, …]` después de una trivia daba otra trivia).
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
  (app)/actividad/      frase grande, meta (lib/activity.ts: sin conteo de onboarding hasta que alguien conteste), Salud, últimos juegos
  api/health            200/503 con nombres de variables faltantes, db, anthropic, slack, cron
  api/tick              GET, Bearer CRON_SECRET, maxDuration 120 → lib/tick.runTick
  api/queue/fill        POST, cron (todos los equipos) o sesión del admin (su equipo)
  api/slack/install     sesión → state firmado → slack.com/oauth/v2/authorize
  api/slack/oauth/callback  state → sesión coincide → oauth.v2.access → rechazo E-1C → upsert teams → set_bot_token → resync si reconexión
  api/slack/events      url_verification sin firma; resto firmado: app_uninstalled/tokens_revoked, member_joined (upsert + DM de
                        onboarding una vez) / member_left_channel (after)
  api/slack/interactions block_actions: `answer:{game_id}` → handleAnswerSubmission (after) · `play:{game_id}` → openPlayModal
                        (after; 200 vacío primero) · `rejoin` · view_submission → handleViewSubmission (JSON response_action)
  api/slack/commands    200 vacío + after(handleCommand) → lib/commands.ts
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
  games/two-truths.ts   Dos verdades: 3 frases + botones 1/2/3; score = mentira; reveal "La mentira era: «…»." + hilo; labelFor → la frase
  games/material.ts     pickFreshFact (hecho fresco: sin usar, sin retirar, miembro activo, no reservado en cola; reparte el protagonismo)
  onboarding.ts         inviteMembers (DM una vez) · openOnboardingModal / openFactModal (after; reintento con botón) ·
                        handleProfileSubmission (valida → clear) · saveOnboarding (diff + veto) · saveFreeFact · eraseMemberData
  commands.ts           /rituales en after(): salir · hecho · borrar-mis-datos (aviso) · stats (hito 7) · ayuda; handleEraseAction
  slack/modals/onboarding.ts  "Cuéntanos de ti": consentimiento, 10 preguntas opcionales (D-7A), bloque 2 verdades (3 o ninguna + mentira)
  slack/modals/fact.ts  "Un hecho nuevo" (question_key free)
  games/recap.ts        recap del viernes: recap_data + week_moment (falla en suave) → recapLines (orden D-1A) · topRows (empates)
  scores.ts             memberStreaks (rpc member_streaks) · milestoneGroups / streakMilestoneLine (5/10/25, una línea en el hilo)
  activity.ts           summaryLine / gameMeta de Actividad (plurales; "acertaron" nunca en esto o aquello ni antes del reveal)
  ai/schemas.ts         zod: thisOrThatSchema, triviaSchema, puzzleSchema; toolInputSchema (JSON Schema draft-7 sin $schema)
  ai/prompts.ts         SYSTEM_PROMPT + EXCLUDED_TOPICS + prompt por plantilla con la lista "temas ya usados"
  ai/generate.ts        generateStructured (tool use + zod + 1 reintento), recentPreviews, generateThisOrThat/Trivia/Puzzle, aiModel
  ai/sample.ts          sampleGame(type) → GeneratedGame con isSample cuando no hay llave
  play.ts               openPlayModal (en after(); si views.open falla → efímero con botón Jugar de nuevo y `since_tap_ms` en el
                        evento) · handleViewSubmission (solo valida → clear) · saveModalAnswer (after: submit_answer → UN efímero)
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
supabase/migrations/0002_scores.sql game_points, week_points, member_streaks, member_stats, week_moment, recap_data
supabase/migrations/0003_onboarding.sql members.onboarding_invited_at; admin_activity devuelve `invited`
scripts/                migrate.ts · seed-facts.ts (JSON con name|slack_user_id, question_key, text) · check-anthropic.ts ·
                        smoke.ts (equipo desechable contra la base real: Vault, claim concurrente, submit_answer, sweep, ventana de reveal, RLS, vistas)
tests/                  Vitest + Testing Library; `server-only` se alias a tests/empty.ts (vitest.config.mts)
  helpers/fake-db.ts    Supabase en memoria (from/select/update/insert + filtros + embeds + rpc) con `defaultRpcs` que imitan
                        sweep_games / claim_due_games / submit_answer / get_bot_token; `db.add(...)` siembra, `db.events(kind)` lee
  helpers/fixtures.ts   team/member/fact/game/answer, fakeSlack() (chat.postMessage/update grabados), slackPlatformError(code)
  tick.test.ts          postGame/revealGame/tickTeam/runTick: fail-closed, desconexión, canal, reveal idempotente, refill, aislamiento
  answers.test.ts       handleAnswerSubmission con fetch simulado (Guardado / Cambiado / protagonista / cerró / fuera)
  recap.test.ts         líneas del recap, empates, escape, render con rpc enlatadas, ensureRecaps (vetado, pausa, ventana)
  scores.test.ts        hitos de racha y el espejo de member_streaks
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

`0002_scores.sql` (hito 3, solo service role; nada se guarda aparte):
- vista `game_points` (una fila por persona y juego revelado: 1 por jugar + acierto + ronda perfecta; protagonista +1 por
  engañado, máx. 5, con su propia fila). La tabla de puntos del design doc vive **solo** aquí.
- `week_points(team, from, to)`, `member_streaks(team)` (racha vigente del plan CEO; una fila por miembro activo, 0 incluido),
  `member_stats(team, member, from, to)` → `{week_points, total_points, streak}` para `/rituales stats` (hito 7),
  `week_moment(team, from, to)` (null si nadie fue engañado o el protagonista ya no está), `recap_data(team, week_start)`.
- El espejo JS de `member_streaks` está en `tests/helpers/fake-db.ts`; `recap_data`/`week_moment` se enlatan por prueba.
`0003_onboarding.sql` (hito 5): `members.onboarding_invited_at` y `admin_activity.invited` (Actividad muestra "{n} de {m} contestaron
«Cuéntanos de ti»" solo cuando ya salió alguna invitación).
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
  llamada usa `getSlackClient` (token de Vault); todo error de Slack pasa por `mapSlackError`.
  **`action_id` único por elemento dentro de un bloque** (si no, Slack rechaza el mensaje entero con `invalid_blocks`; así se
  saltaron los dos "Esto o aquello" del 16 y 23 de septiembre): `answerButtons` usa `answer:{game_id}:{i}` y `answerGameId`
  lo lee; `tests/blocks.test.ts` lo exige para toda plantilla registrada. `mapSlackError` distingue `rejected` (Slack contestó
  ok:false: seguro que no publicó → `skipped(template_error)` con el mensaje de validación de Slack en `detail`) de `transient`
  (puede haber llegado → nunca se re-publica). `tests/helpers/fake-db.ts` tiene `db.clock`: toda prueba que inyecte `now` debe fijarlo. Nunca `<@U…>` ni `@channel`;
  nombres planos desde `display_name` escapados con `escapeSlackText`. Un emoji máximo por mensaje (excepción: puzzle de emojis).
  Modales (hito 4/5): 200 vacío primero y `views.open` en `after()` (el `trigger_id` vence 3 s después del toque, respondamos o no;
  si vence, efímero con el botón otra vez: el segundo toque cae en un servidor caliente). `private_metadata` con `game_id` y
  `channel_id`. En `view_submission` solo se valida lo que mandó Slack y se responde `clear`/`errors` al instante; la escritura va en
  `after()` y la verdad llega por UN `chat.postEphemeral` (desviación de D-2D, ver hito 4).
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
- ✅ `lib/games/two-truths.ts` (2026-09-28): el post nombra al autor ("{Nombre} nos cuenta tres cosas. Una es mentira: ¿cuál?"),
  frases numeradas y escapadas, botones 1/2/3; hilo con cierre "{Autor}, ¿nos cuentas?" como adivina quién.
- ⬜ Prueba real en Slack de esto o aquello, trivia y puzzle (post, botón/modal, ack, reveal e hilo).

### Hito 3 · Puntos, rachas, recap — ✅ 2026-09-28
- ✅ `0002_scores.sql` (ver §4), `lib/scores.ts`, `lib/games/recap.ts`, `ensureRecaps`, hitos de racha en `revealGame` (se calculan
  antes de publicar el hilo y solo si el hilo falta: un reveal reintentado no recuenta).
- Textos del recap (no venían literales en el plan; decididos aquí, en `strings.recap`): "*Momento de la semana:* «{hecho}» era de
  {Nombre}, que engañó a {N} de {M}." · dos verdades: "la mentira de {Nombre}, «{frase}», engañó a {N} de {M}." · "*Racha más larga:*
  {Nombres}, {r} juegos seguidos." · "*Puntos de la semana:* Ana 12 · Luis 9 · Pedro 7." · "{n} de {m} jugaron esta semana."
- Verificar el viernes 2 de octubre ≥ 18:00: evento `recap_posted` y el post en #rituales-bot.
- `/rituales stats` (hito 7) solo necesita `member_stats`.

### Hito 4 · Trivia y puzzle por modal
- ✅ Todo el código (`lib/games/{trivia,puzzle}.ts`, `lib/slack/modals/*`, `lib/play.ts`, ruta de interacciones). Los modales no
  pasan por `handleAnswerSubmission`: tienen su propio camino en `lib/play.ts`.
- **Desviación de D-2D (2026-09-24, decidida por un fallo real):** Slack da 3 s para responder un `view_submission` y un arranque en
  frío medido en producción tardó 2.6 s solo en llegar al handler; Alberto vio "ocurrió un error inesperado" aunque su respuesta sí
  se guardó. Ahora `handleViewSubmission` solo valida lo que mandó Slack (sin base ni Slack) y responde `clear` al instante;
  `saveModalAnswer` corre en `after()`: `submit_answer` y luego UN efímero con la verdad ("Guardado: …" solo si guardó; si no
  "Este juego ya cerró." / "No estás en el ritual." / "No pude guardar…"). El caso "ya cerró" deja de ser error dentro del modal y
  pasa a mensaje privado. `openPlayModal` hace 2 viajes a la base (juego → miembro + respuesta previa + token en paralelo).
  Las plantillas cargan `lib/ai/generate` con `import()` dinámico: las rutas de Slack y el tick no cargan el SDK de Anthropic.
- **"Jugar" con `expired_trigger_id` (2026-09-28, justo después de que entraran 4 personas):** Slack da 3 s desde el toque para
  `views.open`; medido desde fuera: la ruta en frío ~2 s + `views.open` ~0.3 s + la entrega de Slack. Ahora el 200 sale primero,
  `openPlayModal` corre en `after()`, y si Slack rechaza el modal la persona recibe un efímero "Me tardé en abrir el juego. Toca Jugar
  otra vez." con el botón (`playButton` en `lib/slack/blocks.ts`). El evento `modal_failed` guarda `since_tap_ms` y `handler_ms`
  para saber si el tiempo se va en Slack o en nosotros. Si vuelve a pasar seguido: juntar en una sola función SQL el juego, el
  miembro, la respuesta previa y el token (hoy son 2 idas a la base antes de `views.open`).

### Hito 5 · Onboarding por modal — ✅ código 2026-09-28
- ✅ Modal "Cuéntanos de ti", DM "Contestar" (al entrar y al guardar canal), `/rituales hecho`, `/rituales borrar-mis-datos`,
  Dos verdades. Detalle y desviaciones en §2.
- **Manifest cambiado** (`slack-app-manifest.json`): `app_home` con la pestaña de Mensajes encendida y de solo lectura (el DM de
  onboarding vive ahí; el bot no lee respuestas) y la descripción/`usage_hint` del comando. Pablo lo pega en api.slack.com → Rituales
  → App Manifest; luego vuelve a guardar el canal en Conectar para que salgan los DMs a las 7 personas.
- Verificar: eventos `onboarding_invited` (7) y ningún `onboarding_dm_failed`; al contestar, `onboarding_saved` y hechos con
  `source = 'onboarding'`; el siguiente fill ya puede crear Adivina quién y Dos verdades.
- `scripts/seed-facts.ts` queda solo para arranques.

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

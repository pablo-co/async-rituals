# Plan: async-rituals MVP — revisión CEO

Generado por /plan-ceo-review el 2026-09-15 · Branch: main · Modo: SELECTIVE EXPANSION
Base: `docs/designs/async-rituals-mvp.md` (APPROVED) · Registro de alcance: `~/.gstack/projects/pablo/ceo-plans/2026-09-15-async-rituals-mvp.md`

Este archivo es el plan activo que leen `/plan-design-review` y `/plan-eng-review`. Contiene solo cambios aprobados por Pablo.

## Decisiones del Paso 0

- **Estructura (D2):** A) Monolito Next.js + funciones de Postgres. Un repo, un deploy, un lugar donde depurar.
- **Modo (D3):** expansión selectiva; el documento de diseño es la base.
- **D10:** `teams.timezone` (default `America/Mexico_City`, con `CHECK` mientras el cron sea fijo) y `teams.language` (default `es`; solo afecta contenido generado). Strings del bot fijos en español.
- **Expansiones aceptadas (6):** bienvenida al canal · momento de la semana · pausa de vacaciones · hitos de racha · DM al admin por saltos y errores · `/rituales hecho`. Detalle buildable en el plan CEO.
- **Hallazgos aceptados (9):** 1A contrato `GameTemplate` · 2A mapeo de errores de Slack con desconexión y canal · 2B validación de salida de IA · 3A escape de texto de usuario · 4A `submit_answer` atómica · 6A pruebas SQL por humo (atajo 7/10) · 8A tabla `events` + latido + Salud · 9A `/api/health` + lista post-deploy · 11A mapa de estados de UI.
- **Secuencia:** hito 1 incluye handler mínimo de `/rituales` (`salir` + "pronto"); `borrar-mis-datos` pasa al hito 5; `stats` al hito 7; eventos `app_uninstalled` y `tokens_revoked` en el manifest desde el hito 1.

## NOT in scope

- Pagos, planes y trial: nada se cobra hasta que dos equipos jueguen en la semana 4.
- Digest mensual por correo y gráficas de analytics: con 7 personas no hay nada que agregar.
- Insignias, resets trimestrales, auto-reducción de cadencia: gamificación que no prueba nada todavía.
- Transferencia de admin, multi-canal, App Directory, SSO, Teams: escala que no existe.
- Puzzle en modo diario: hasta 10 posts por semana rompe "low-pressure"; en el MVP es una plantilla más.
- Edición de juegos en la Cola: cinco formularios en teléfono; vetar + generar cubre el caso.
- Pantalla de ajustes completa y selector de tono: constantes hasta el segundo equipo.
- Internacionalización de strings del bot: `language` solo llega a los prompts.
- Ocultarse de la tabla pública y comando `reportar`: con el segundo equipo.
- Métrica de mensajes en hilo: exige `channels:history` y leer el canal; choca con la privacidad. Pablo observa a ojo.
- Reposición automática de hechos por DM: hay material para 10-20 semanas; `/rituales hecho` cubre el resto.
- Anuario trimestral y "semana suave": diferidos a TODOS.md.
- Estructuras rechazadas: atajo de un solo workspace (reconstruir en semana 3), lógica en Supabase con pg_cron/Edge Functions (dos runtimes).
- Supabase local con Docker para pruebas: atajo registrado (6A) con disparador de subida.

## What already exists

Proyecto en blanco; no hay código propio que reutilizar. Escalera de reúso aplicada:
- `@slack/web-api` (cliente oficial, con reintentos ante 429) en vez de Bolt (sus receptores no encajan con rutas de Next.js en Vercel).
- `crypto` de Node para la firma HMAC; ninguna dependencia nueva para 20 líneas.
- Funciones y vistas de Postgres para reclamos atómicos y puntajes, en vez de lógica de aplicación con carreras.
- `@anthropic-ai/sdk` con tool use para salida estructurada; `zod` para validar.
- Block Kit como JSON plano; `next/font`, `lucide-react` y el tema Cálido de raicode para la web.

## Dream state delta

```
  HOY                          ESTE PLAN                                  IDEAL A 12 MESES
  Nada; repo vacío.     --->   Motor + cola con veto, 5 plantillas   --->  SaaS multi-workspace con cobro,
  Tu equipo de 7 no            (contrato GameTemplate), puntos y            digest, ajustes por equipo,
  hace ningún ritual.          rachas, recap con momento de la              anuario, puerto a Teams.
                               semana, web mínima con Salud,
                               1 app de Slack por OAuth, columnas
                               por equipo (tz, idioma), events.
```
Todo lo del plan apunta hacia el ideal. Lo único que queda deliberadamente atrás es el cron fijo (guardia `CHECK` de zona horaria), con su disparador de subida en `/plan-eng-review`.

## Error & Rescue Registry

```
  RUTA / CÓDIGO                 | QUÉ PUEDE FALLAR                              | CLASE / CÓDIGO                 | ¿RESCATADO? | ACCIÓN                                                    | USUARIO VE
  ------------------------------|-----------------------------------------------|--------------------------------|-------------|-----------------------------------------------------------|-----------------------------------
  cualquier llamada a Slack     | app desinstalada / token revocado             | invalid_auth, account_inactive | Sí (2A)     | teams.disconnected_at; tick y fill se detienen            | Conectar: "Slack desconectado"
  events                        | app_uninstalled / tokens_revoked              | evento                         | Sí (2A)     | igual que arriba                                          | igual
  tick → chat.postMessage       | canal borrado / bot fuera / archivado         | not_in_channel, channel_not_   | Sí (2A)     | skipped(channel_error) + channel_error_at + DM admin      | Cola "saltado"; Conectar aviso
                                |                                               | found, is_archived             |             |                                                           |
  tick → Slack                  | 429 / 5xx / timeout                           | rate_limited / fetch           | Sí          | reintento del cliente; fila queda posting/revealing →      | nada, o "saltado" si venció
                                |                                               |                                |             | reclamo de atascados a 15 min                             |
  tick → plantilla              | excepción en render/score/reveal              | TemplateError                  | Sí (1A)     | skipped(template_error) + chat.update + DM admin          | Cola "saltado"
  tick → líneas decorativas     | racha / ya volvimos / momento fallan          | cualquiera                     | Sí (1A)     | mensaje sale sin la línea; evento                         | nada
  tick                          | cron no corre                                 | —                              | Sí (8A)     | last_tick_at viejo → Salud en rojo                        | Registro: Salud en rojo
  tick                          | corre dos veces / traslape                    | —                              | Sí          | claim_due_games FOR UPDATE SKIP LOCKED                    | nada
  tick                          | cron perdido 2 días                           | —                              | Sí          | ventana 6 h → skipped(out_of_window)                      | Cola "saltado"
  fill → Anthropic              | 429 / 529 / timeout                           | RateLimitError, APITimeout     | Sí          | reintentos del SDK; slot sin generar; siguiente fill      | Cola con menos juegos
  fill → Anthropic              | JSON malformado / vacío / rechazo             | ZodError / null                | Sí (2B)     | 1 reintento con error en prompt; luego "sin material" →    | nada; DM admin si la corrida da 0
                                |                                               |                                |             | rotación; log generation_failed                            |
  fill                          | sin hechos / sin frases                       | —                              | Sí          | rotación a la siguiente plantilla; DM admin (tope)        | DM al admin
  fill concurrente              | mismo slot dos veces                          | unique_violation 23505         | Sí          | atrapar, ignorar, seguir                                  | nada
  fill                          | corrida > 60 s                                | timeout de función             | Parcial     | juegos ya insertados quedan; el resto en la siguiente     | "generando…" se queda en parcial
  interactions                  | firma inválida / timestamp > 5 min            | 401                            | Sí (3A)     | rechazar + log (ip, ts)                                   | nada
  interactions                  | payload malformado                            | 400                            | Sí          | rechazar + log                                            | nada
  interactions                  | juego cerrado / respuesta durante reveal      | submit_answer → accepted=false | Sí (4A)     | efímero "este juego ya cerró"                             | efímero
  interactions                  | doble clic                                    | —                              | Sí          | upsert único                                              | "Guardado"
  interactions                  | response_url caducado (30 min)                | error de Slack                 | Sí          | log; sin reintento                                        | nada (la respuesta sí se guardó)
  interactions → views.open     | trigger_id caducado (3 s)                     | expired_trigger_id             | Sí          | log; el usuario reintenta el clic                         | nada pasa; segundo clic funciona
  view_submission (hecho)       | insert falla                                  | PostgrestError                 | Sí          | response_action errors en el campo                        | "no pude guardar, inténtalo"
  view_submission (otros)       | insert falla en after()                       | PostgrestError                 | Sí          | evento + log; upsert idempotente al reintento de Slack    | nada (reintento de Slack lo cubre)
  oauth/callback                | state inválido / caducado (10 min)            | 400                            | Sí (3A)     | página "no se pudo conectar, reintenta"                   | mensaje en Conectar
  oauth/callback                | oauth.v2.access falla                         | oauth error                    | Sí          | igual + log del código                                    | mensaje en Conectar
  conectar → bienvenida         | chat.postMessage falla                        | error de Slack                 | Sí          | guarda canal, no escribe welcomed_channel_id, aviso       | "no pude saludar; vuelve a guardar"
  DM al admin                   | im falla / admin sin DM                       | error de Slack                 | Sí          | evento + log; no detiene fill/tick                        | nada
  commands                      | subcomando desconocido / no miembro           | —                              | Sí          | efímero "pronto" / "no estás en el ritual"                | efímero
  web (RLS)                     | admin intenta leer answers/facts              | PostgrestError 42501           | Sí          | vistas/funciones security definer; nunca acceso directo   | nada (no hay UI para eso)
  web                           | Supabase caído                                | fetch error                    | Sí (11A)    | componente de error "no pude cargar; reintenta"           | estado de error
  /api/health                   | variable faltante / DB caída                  | —                              | Sí (9A)     | 503 con el nombre de lo que falta                         | JSON claro
```

Sin catch-all: cada rama nombra su código. Ningún error se traga sin evento (8A).

## Failure Modes Registry

```
  CODEPATH               | FAILURE MODE                         | RESCUED? | TEST? | USER SEES?                 | LOGGED?
  -----------------------|--------------------------------------|----------|-------|----------------------------|--------
  tick/post              | Slack caído a las 10:00              | Y        | Y     | "saltado" si vence         | Y (events)
  tick/post              | canal inaccesible                    | Y        | Y     | Conectar aviso + DM        | Y
  tick/post              | protagonista se fue                  | Y        | Y     | "saltado" + DM             | Y
  tick/reveal            | Slack 5xx a media revelación         | Y        | Y     | reveal tarde               | Y
  tick/reveal            | respuesta durante el reveal          | Y        | Y     | "ya cerró"                 | Y
  tick                   | cron muerto                          | Y        | Y     | Salud en rojo              | Y (last_tick_at)
  tick                   | traslape                             | Y        | Y     | nada                       | Y
  fill/anthropic         | basura tres veces                    | Y        | Y     | nada / DM si corrida = 0   | Y
  fill/anthropic         | API caída un día                     | Y        | Y     | cola más corta             | Y
  fill                   | sin material                         | Y        | Y     | DM (tope)                  | Y
  slack/interactions     | firma falsa / replay                 | Y        | Y     | nada                       | Y
  slack/interactions     | <!channel> en un hecho               | Y        | Y     | texto literal              | —
  slack/oauth            | CSRF / state caducado                | Y        | Y     | "no se pudo conectar"      | Y
  slack/oauth            | reinstalación tras desinstalar       | Y        | Y     | Conectar vuelve a verde    | Y
  web/cola               | fill falló                           | Y        | Y     | estado de error            | Y
  web/registro           | sin datos                            | Y        | Y     | estado vacío               | —
  deploy                 | variable faltante                    | Y        | Y     | /api/health 503            | Y
  datos                  | hecho repetido (no_answers)          | Y        | Y     | nunca                      | —
  datos                  | racha rota por pausa                 | Y        | Y     | nunca                      | —
```
CRITICAL GAPS: 0. Todas las filas con RESCUED=N del diseño original quedaron cerradas por 2A, 2B, 4A, 8A y 9A.

## Scope Expansion Decisions

- Aceptadas: bienvenida al canal · momento de la semana · pausa de vacaciones (M-chico) · hitos de racha · DM al admin (M-chico) · `/rituales hecho`.
- Diferidas (TODOS.md): anuario trimestral / página del equipo · semana suave.
- Saltadas: ninguna.

## Diagramas

### 1. Arquitectura del sistema
```
                 ┌────────────── Vercel (Next.js 15, App Router) ─────────────┐
  Vercel Cron ──▶│ GET /api/tick ──┐                                          │
  (16:00, 00:00  │                 ├─▶ templates/{guess_who,two_truths,       │
   UTC)          │ POST /api/queue/fill ─▶ trivia,this_or_that,puzzle,recap} ─┼──▶ Slack Web API
                 │     (202 + after, maxDuration 60) ─▶ Anthropic (tool use)  │    chat.postMessage / chat.update
  Slack ────────▶│ POST /api/slack/interactions · events · commands           │    views.open / conversations.*
                 │ GET  /api/slack/install · oauth/callback                   │    oauth.v2.access
  Pablo (web) ──▶│ /login · /conectar · /cola · /registro · GET /api/health   │
                 └─────────────────────────┬──────────────────────────────────┘
                     service role (Slack, tick, fill) │ sesión + RLS (web)
                                                      ▼
                 ┌──────────────────── Supabase (Postgres) ───────────────────┐
                 │ teams · members · facts · games · answers · events         │
                 │ claim_due_games() · submit_answer() · vistas puntos/rachas │
                 │ games_admin (vista) · funciones security definer · RLS     │
                 └───────────────────────────────────────────────────────────-┘
```

### 2. Flujo de datos con caminos sombra (respuesta de un miembro)
```
  CLIC ──▶ FIRMA + TS ──▶ PARSEAR ──▶ submit_answer() ──▶ efímero "Guardado"
   │           │             │              │                    │
   ▼           ▼             ▼              ▼                    ▼
  doble:     inválida:     malformado:    juego cerrado:       response_url caducado:
  upsert     401 + log     400 + log      accepted=false →     log, sin reintento
  idem                                    "ya cerró"
```
Flujo cola → Slack: feliz = post con `ts`; nulo (sin material) = rotación a la siguiente plantilla; vacío (cola vacía) = fill disparado, ese día no publica; error (Slack caído) = `posting` → reclamo 15 min → `skipped(out_of_window)` si venció.

### 3. Máquina de estados de `games`
```
  queued ──(tick, ventana 6h, sin pausa, equipo conectado)──▶ posting ──(ts)──▶ posted ──(+4h)──▶ revealing ──▶ revealed
    │                                                            │ (>15 min)      │                     │ (>15 min)
    ├──(veto)──▶ vetoed                                          └──▶ queued       ├──(0 resp.)──▶ skipped(no_answers)
    ├──(vencido)──▶ skipped(out_of_window)                                        ├──(template)──▶ skipped(template_error)
    ├──(pausa)──▶ skipped(paused)                                                 └──────────────▶ posted (Slack 5xx: reintento)
    ├──(protagonista inactivo)──▶ skipped(featured_inactive)
    └──(canal)──▶ skipped(channel_error)
  recap: queued ──▶ posting ──▶ posted (terminal; excluido del ciclo de reveal)
  Imposibles: revealed→*, vetoed→*, skipped→*. Lo impide: los claims solo toman queued/posted; las reclamas de atasco solo posting/revealing; el veto solo WHERE status='queued'.
```

### 4. Flujo de error (mapeo compartido de Slack, 2A)
```
  error de Slack ──▶ ¿invalid_auth / account_inactive? ──sí──▶ disconnected_at; parar tick+fill; Conectar rojo
        │
        no ──▶ ¿not_in_channel / channel_not_found / is_archived? ──sí──▶ skipped(channel_error); channel_error_at; DM admin (transición)
        │
        no ──▶ (429 / 5xx / timeout) ──▶ dejar la fila en posting/revealing ──▶ reclamo de atascados en el siguiente tick
```

### 5. Secuencia de despliegue
```
  1. migración SQL en Supabase (aditiva)  ──▶  2. git push main  ──▶  3. Vercel build + deploy
  ──▶  4. GET /api/health (200)  ──▶  5. Registro → Salud (último tick)  ──▶  6. primer deploy: "Publicar el primero ahora"
```

### 6. Rollback
```
  ¿deploy roto? ──▶ /api/health 503 o Salud en rojo
        │
        ├──▶ ¿código? ──▶ git revert + push ──▶ Vercel redeploya (~2 min) ──▶ /api/health 200
        └──▶ ¿SQL?    ──▶ reemplazar la función/vista con la versión anterior por SQL (sin migraciones destructivas que revertir)
  Juegos ya publicados en Slack no se tocan; a lo sumo se marcan skipped.
```

## Stale Diagram Audit

No hay diagramas previos en el repo. El boceto `sketch.html` (wireframe) sigue vigente en estructura; dos textos ya no cumplen las reglas: "se revela hoy a las 17:00" y "hasta las 17:00" prometen hora exacta (regla: "esta tarde"), y falta la pestaña de Salud en Registro. Lo corrige `/plan-design-review`.

## Diseño (revisión /plan-design-review, 2026-09-15)

Referencia visual aprobada: `~/.gstack/projects/pablo/designs/web-app-20260915/web-mock.png` (4 estados de la web en tema Cálido). Las decisiones de abajo corrigen tanto el plan como ese mockup y el boceto de Slack.

### D-1A · Anatomía de los mensajes de Slack (aprobado)

- **Post de juego (todas las plantillas de opciones):** `header` con el nombre de la plantilla ("Adivina quién", "Dos verdades y una mentira", "Trivia", "Esto o aquello", "Puzzle"; ≤150 caracteres) → `section` (mrkdwn) con el contenido escapado → `actions` con hasta 6 `button` (`text` = nombre visible ≤75, `value` = `member_id`/opción, `action_id` = `answer:{game_id}`); con más de 6 opciones, un `static_select` con placeholder "Elige a alguien" → `context`: "Se revela esta tarde. Tu respuesta es privada hasta entonces." Trivia y puzzle llevan en `actions` un solo botón "Jugar" que abre el modal. **Nunca:** número de juego ("#12"), contador en vivo ("4 de 7 ya jugaron"), hora exacta, "(tu hora)", ni "¿Pregunta rara? Avísame en privado".
- **Ack efímero:** `POST response_url` con `response_type: "ephemeral"` y `replace_original: false` explícito (sin él, Slack reemplaza el post del canal para todos). Texto: "Guardado: {opción}. Puedes cambiarlo hasta esta tarde."
- **Reveal (dos partes):** (1) `chat.update` del post: mismo `header`, `section` con el contenido + una línea de resultado, sin `actions`, `context` "Cerrado · {n} de {m} jugaron". (2) Respuesta en hilo con `reply_broadcast: true` (aparece en el canal, no pingea a nadie) con acertantes y puntos según la tabla del design doc, la línea de hitos de racha si aplica (una sola, sin emoji), y un cierre fijo cuando hay protagonista: "{Nombre}, ¿nos cuentas?". Nombres siempre planos desde `display_name`; nunca `<@U…>`.
- **Formato de reveal por plantilla:**
  - Adivina quién: post → "Era *{Nombre}*." · hilo → "Le atinaron {A} y {B} (+2 cada quien). {Nombre} engañó a {n} (+{n})."
  - Dos verdades y una mentira: post → "La mentira era: «{frase}»." · hilo → "Le atinaron {…} (+2). {Autor} engañó a {n} (+{n})."
  - Trivia: post → "Respuestas: 1 {b} · 2 {a} · 3 {c}." · hilo → "Ronda perfecta: {…} (+2). Todos los que jugaron suman 1 más 1 por acierto."
  - Esto o aquello: post → "{Opción A}: {n} · {Opción B}: {m}." (sin ganador) · hilo → una frase del lado de la minoría, **generada en el fill y guardada en `payload.reveal_quip`** (nunca IA al reveal).
  - Puzzle: post → "La respuesta era: *{respuesta}*." · hilo → "Lo resolvieron {…} (+2)."
  - Cerrado sin respuestas (`no_answers`): post → "Este juego cerró." (nunca "nadie jugó"); sin hilo.
- **Recap del viernes (orden fijo):** 1) momento de la semana, 2) racha viva más larga, 3) top 3 con **puntos solo de esa semana**, 4) "{n} de {m} jugaron esta semana". Semana sin juegos revelados: no se publica recap.
- **Textos en un solo archivo** `lib/slack/strings.ts`, en español, con los límites de Block Kit anotados (título de modal ≤24, botón ≤75, opción ≤75, `actions` ≤25).

### D-1B · Nombre (aprobado)

**Rituales.** Es el `display_information.name` y el nombre del bot en `slack-app-manifest.json`, el título del header de la web, el `<title>` y el remitente de cada post. El comando sigue siendo `/rituales`. El favicon (`app/icon.tsx`) usa la inicial "R" en Lora sobre el acento del tema, como manda el CLAUDE.md.

### D-1C · Jerarquía de la app web (aprobado)

- **Header** (`app-header`, sticky, 56 px): "Rituales" en Lora a la izquierda; a la derecha una sola acción: el toggle de modo oscuro (`icon-btn` 44 px, `sun`/`moon`, `aria-label`). "Cerrar sesión" es un `btn-tertiary` al final de Conectar, no está en el header.
- **Aterrizaje tras login:** sin equipo → `/conectar`; con equipo y canal → `/cola`.
- **Conectar** (sin tarjeta envolvente; secciones sobre `bg-app` separadas por encabezado): 1) línea de estado ("Slack conectado" `badge success` / "Sin conectar" + `btn-primary` "Agregar a Slack"); 2) sección **Canal y ritmo**: `select` de canal público, `select` "Juegos por semana" (1-5, con los días en el texto de cada opción: "3 · lunes, miércoles y viernes"), `btn-primary` "Guardar"; los errores del guardado van en un `alert-error` arriba de la sección; 3) sección **Pausa**: fecha "Pausar hasta el [fecha], incluido" + "Quitar pausa"; 4) **Publicar el primero ahora** (`btn-secondary`) solo existe cuando hay canal guardado, ningún juego `posted` todavía y al menos un `queued`; desaparece tras el primer post; 5) `btn-tertiary` "Cerrar sesión".
- **Cola** (pestaña y título iguales): `list-row` sobre el fondo con líneas finas (`border-default`), sin tarjeta; cada fila: título (pregunta o, para adivina-quién y dos verdades, el nombre de la plantilla), meta "Mié 17 · Adivina quién · hecho oculto hasta el reveal" (**nunca el hecho ni el protagonista**: `games_admin.preview`), a la derecha "Vetar" (`btn-tertiary`, 44 px) o un `badge` ("en pausa" warning, "muestra" info, "por rellenar" neutral); arriba de la lista, `alert-warning` cuando no hay llave de Anthropic; abajo `btn-secondary` "Generar otra semana".
- **Actividad** (antes "Registro"): 1) frase grande en Lora: "6 de 7 jugaron esta semana" (o "Nadie ha jugado esta semana todavía"); 2) meta en muted: "12 juegos publicados · 5 de 7 con onboarding"; 3) **Salud** como una sola `list-row` cuando todo está bien ("Bot al día · última corrida hace 3 h", `badge success`) que se expande a los últimos 20 eventos cuando está en rojo (`badge error` "sin señal desde ayer"); 4) **Últimos juegos** en `list-row` con "6 respuestas · 2 acertaron". Sin tiles, sin tarjetas apiladas.
- **Bottom-nav:** Cola `calendar-days`, Actividad `activity`, Conectar `plug`; 22 px, `stroke-width` 1.75, `aria-current="page"` en el activo.

### D-2A · Login (aprobado)

- Ruta `/login`, header "Rituales". Un `segmented` con dos vistas: **Entrar** / **Crear cuenta** (mismo formulario, mismo dato). Campos con `label-default` visible arriba: "Correo" (`type=email`, 16 px) y "Contraseña" (16 px, `icon-btn` 44 px `eye`/`eye-off` con `aria-label` "Mostrar contraseña"). `btn-primary` a ancho completo ("Entrar" / "Crear cuenta") con `spinner` de 16 px dentro del botón mientras carga; el formulario se deshabilita mientras tanto.
- **Errores** (`input-error` + `error-text` bajo el campo, siempre diciendo qué hacer): "Correo o contraseña incorrectos." · "Ese correo ya tiene cuenta. Entra con tu contraseña." · "La contraseña necesita al menos 8 caracteres." · "Escribe un correo válido." · Red o servidor: `alert-error` arriba: "No pude conectar. Revisa tu internet e inténtalo de nuevo."
- **Ayuda** (`help-text` bajo el formulario): "¿Olvidaste tu contraseña? Escríbele a quien te dio acceso." (no hay recuperación por correo hasta que exista dominio propio: muro del correo).
- **Registro abierto** (el líder del segundo equipo se registra solo). Cuenta nueva sin equipo → `/conectar`. Si `signUp` devuelve usuario sin sesión (el switch "Confirm email" sigue prendido en Supabase), la pantalla muestra `alert-warning`: "Revisa tu correo para confirmar la cuenta. Si no llega, avísale a quien te dio acceso." (nunca silencio).
- Estados: cargando (spinner en botón), error (arriba), éxito (redirección), sesión ya activa (`/login` redirige a `/cola` o `/conectar`).

### D-2B · Flujo de Conectar (aprobado; corrige el criterio de éxito #1)

- **Guardar el canal dispara el fill.** Al guardar canal por primera vez (y siempre que la cola tenga menos de 3 slots futuros), Conectar llama `POST /api/queue/fill` después de guardar. Cola muestra "Generando tu primera semana…" con skeleton y hace polling (cada 5 s, máximo 90 s; después: "Sigue generando; vuelve en un minuto"). "Publicar el primero ahora" aparece solo cuando ya existe un `queued`.
- **Antes de conectar:** línea de anticipación sobre el botón: "Slack te pedirá permiso para que Rituales publique en un canal y mande mensajes privados. Elige el workspace de tu equipo." → `btn-primary` "Agregar a Slack".
- **Regreso del OAuth:** el callback redirige a `/conectar?connected=1` → `alert-success` "Slack conectado. Ahora elige el canal."; `/conectar?error={code}` → `alert-error` "No se pudo conectar con Slack. Inténtalo de nuevo."; reinstalación sobre un equipo existente → "Slack reconectado." Tras desconexión (2A): `alert-error` "Slack desconectado: vuelve a conectar" + el botón de OAuth.
- **Lista de canales:** `skeleton` de 3 filas mientras carga (`conversations.list`); vacía → "No encontré canales públicos. Crea uno en Slack y vuelve."; error → `alert-error` "No pude leer tus canales. Reintenta." con botón.
- **Guardar:** `spinner` dentro del botón; éxito → `toast` "Guardado. El próximo juego sale el {día} por la mañana." (día calculado con la función de días del fill; si hay pausa: "a partir del {fecha}"); error → `alert-error` arriba de la sección con qué hacer ("No pude guardar. Revisa que el bot siga en el canal."). Si la bienvenida falla, el aviso de D-1A/plan CEO.
- **Publicar el primero ahora:** "Publicando…" con spinner (2-6 s); éxito → `toast` "Publicado en #{canal}"; error → `alert-error` "No pude publicar: {motivo}"; con pausa activa → deshabilitado con texto "En pausa hasta el {fecha}".
- **Cambiar el ritmo:** aplica solo a slots nuevos; los ya programados conservan su fecha. `help-text` bajo el campo: "Los juegos ya programados conservan su fecha."
- **Pausa:** `<input type="date">` nativo (16 px), mínimo hoy (en `teams.timezone`), etiqueta "Pausar hasta el [fecha], incluido"; `toast` "Pausado hasta el {fecha}" / "Pausa quitada".

### D-2C · Estados de Cola y Actividad; confirmación del veto (aprobado)

- **Veto** = `sheet` desde abajo (DESIGN.md: modal/sheet destructivo): título "¿Vetar «{pregunta}»?" (adivina-quién / dos verdades: "¿Vetar el {plantilla} del {día}?"), cuerpo "Se quita de la cola. El siguiente relleno pone otro juego ese día.", botones apilados con `btn-danger` "Sí, vetar" arriba y "Cancelar" abajo con el **foco inicial**; Esc y clic afuera cancelan; "Vetando…" con spinner en el botón. Al confirmar: la fila pasa a "{día} · por rellenar" (`badge neutral`) y `toast` "Vetado. Se rellena en la próxima generación."
- **Cola, estados:** cargando → 3 `skeleton` rows; vacía sin canal → `empty-state` "Conecta un canal primero" + enlace a Conectar; generando (fill en curso, por guardado o por tick) → `alert-info` "Generando… los juegos aparecen solos" + skeleton; vacía después de vaciarse → `empty-state` "Sin juegos en cola" / "Genera una semana y el bot se encarga del resto." / `btn-primary` "Generar una semana"; error → `alert-error` "No pude cargar la cola." + `btn-secondary` "Reintentar"; llena (≥10 slots futuros) → "Generar otra semana" deshabilitado con `help-text` "La cola ya tiene 10 juegos"; filas: `badge warning` "en pausa", `badge info` "muestra · no se publica", `badge neutral` "por rellenar".
- **Actividad, estados:** cargando → skeleton de la frase + 3 rows; vacía → frase "Aún no hay juegos publicados" + meta "El primero sale el {día}"; error → `alert-error` + "Reintentar"; Salud en rojo (`last_tick_at` > 26 h) → `list-row` con `badge error` "Sin señal desde {cuándo}", expandida con los últimos 20 eventos y la línea "Si sigue así mañana, avísale a quien administra la app."
- **Eventos en español** (tabla fija `lib/events/labels.ts`): `tick_run` "El bot revisó la cola" · `posted` "Publicó {plantilla}" · `revealed` "Reveló {plantilla}" · `recap_posted` "Publicó el recap de la semana" · `skipped` "Saltó {plantilla}: {motivo}" (motivos: fuera de horario · en pausa · sin respuestas · el protagonista ya no participa · error de la plantilla · no pude publicar en el canal · contenido de muestra) · `fill_run` "Generó {n} juegos" · `generation_failed` "No pudo generar {plantilla}" · `channel_error` "No pude publicar en el canal" · `disconnected` "Slack se desconectó" · `reconnected` "Slack reconectado" · `admin_alert` "Te avisé por mensaje privado" · `welcome` "Saludé al canal" · `paused` "Pausa hasta el {fecha}" · `resumed` "Ya volvimos".

### D-2D · Estados de Slack: modales, efímeros, textos literales, contenido de muestra (aprobado)

- **Modal de trivia** (título "Trivia", submit "Enviar", close "Cancelar"): 3-5 bloques `radio_buttons`, todos obligatorios; al reabrir antes del reveal, `initial_option` con lo ya contestado; `private_metadata` lleva `game_id` y `channel_id`. Al enviar: `submit_answer` **antes** de responder (misma excepción que `/rituales hecho`); si `accepted = false` → `response_action: errors` en el primer bloque: "Este juego ya cerró."; si `true` → `response_action: clear` + `chat.postEphemeral` en el canal: "Guardado: {n} respuestas. Puedes cambiarlas hasta esta tarde."
- **Modal del puzzle** (título "Puzzle"): un `plain_text_input` (`max_length` 80) con `hint` "Una o dos palabras. No importan mayúsculas ni acentos."; vacío → error "Escribe una respuesta"; mismo flujo de guardado y confirmación que trivia. **Excepción documentada a "un emoji por mensaje":** un puzzle de emojis lleva los emojis que son el acertijo.
- **Modal de onboarding** (título "Cuéntanos de ti", 15 caracteres): 8-12 `plain_text_input` opcionales (`max_length` 280) con la lista de la pasada 7; bloque final opcional "2 verdades, 1 mentira" con 3 inputs + `radio_buttons` "¿Cuál es la mentira?"; si el bloque viene incompleto (1-2 frases, o sin mentira marcada) → error bajo el bloque: "Escribe las 3 frases y marca cuál es la mentira, o deja las tres vacías."; texto de consentimiento en un `context` al inicio: "Tus respuestas se usan solo para juegos con tu equipo. Puedes borrarlas cuando quieras con /rituales borrar-mis-datos."
- **Modal de hecho nuevo** (`/rituales hecho`, título "Un hecho nuevo"): un input con `hint` "En tercera persona, como para que adivinen: «corrió un maratón en 2019»."; flujo del plan CEO (insert antes de responder; error "No pude guardar, inténtalo de nuevo").
- **Efímeros literales:** protagonista que pulsa → "Este juego es sobre ti. Los demás adivinan; tú espera el reveal." · cambio de respuesta → "Cambiado a: {opción}." · miembro con `opted_out` que pulsa un botón → "Saliste del ritual." + botón "Volver a entrar" · juego cerrado → "Este juego ya cerró." · subcomando no disponible → "Ese comando llega pronto. Por ahora: /rituales salir." · no miembro → "No estás en el ritual."
- **`/rituales salir`** → "Listo, ya no te incluyo. Cuando quieras volver:" + botón "Volver a entrar". **`/rituales borrar-mis-datos`** → "Se borrarán tu perfil, tus hechos, tus respuestas y tus puntos en Rituales. No se puede deshacer." + botones "Sí, borrar" (`style: danger`) y "Cancelar"; tras borrar: "Listo. Borré tus datos. Si vuelves a jugar, empiezas de cero." **`/rituales stats`** (hito 7) → "Esta semana: {p} puntos · racha: {r} juegos seguidos · total: {t}."
- **Bienvenida (literal):** "Hola, soy Rituales. Voy a publicar juegos cortos aquí los {días} por la mañana: adivina quién, trivia, dos verdades y una mentira, y más. Jugar es opcional y toma un minuto; tu respuesta es privada hasta el reveal de la tarde. Si prefieres no participar, escribe /rituales salir." (con pausa activa: "a partir del {fecha}").
- **Post tras la pausa:** el primer post con `resumed = true` lleva un `context` extra "Ya volvimos." (sin emoji).
- **DM al admin (literales):** (a) "Salté {plantilla} del {día}: {motivo}. Quedan {n} {tipo de material}. Pide a tu equipo un hecho nuevo{ con /rituales hecho}." · (c) "No puedo publicar en #{canal}. Revisa que Rituales siga dentro del canal y vuelve a guardar en Conectar." · (d) "No pude generar juegos hoy ({motivo}). La cola tiene {n}. Si sigue así mañana, revisa la llave de Anthropic en Conectar."
- **Contenido de muestra nunca al canal:** el tick salta los juegos con `is_sample = true` (`skip_reason = 'sample'`, se agrega al enum) y la Cola los marca "muestra · no se publica". Sin `ANTHROPIC_API_KEY`, Cola y Conectar muestran `alert-warning`: "Sin llave de Anthropic: solo se publican Adivina quién y Dos verdades. Trivia, Esto o aquello y Puzzle esperan la llave." El contenido de muestra existe para verlo en localhost, no para el equipo.

### D-3A · Primer contacto: bienvenida en el hito 1 y semilla con permiso (aprobado)

- La bienvenida (T11) sube a **P1 dentro del hito 1**: ningún juego se publica en un canal que no recibió el saludo (`welcomed_channel_id` es condición del tick para el primer post de ese canal).
- **Hechos semilla del hito 1:** solo hechos de Pablo y hechos que cada miembro dio explícitamente (Pablo los pide por Slack con una línea: "¿me das un dato curioso sobre ti para el bot? Lo usamos en un juego de adivinar."). Se cargan con `scripts/seed-facts.ts`, que exige `member_id` y `question_key` por hecho y registra `source = 'seed'`. El onboarding por modal (hito 5) sustituye la semilla.

### D-3 · Storyboard del recorrido (registro del recorrido aprobado)

```
  PASO | EL COMPAÑERO HACE                 | SIENTE                       | LO SOSTIENE
  -----|-----------------------------------|------------------------------|----------------------------------
  1    | Ve la bienvenida en #equipo       | curiosidad, cero presión     | D-2D texto; D-3A (hito 1, antes del primer juego)
  2    | Ve el primer post, toca un botón  | "esto toma 10 segundos"      | D-1A: ≤6 botones, ack "Guardado"
  3    | Ve el reveal en el canal          | sorpresa, risa               | D-1A: reveal en el post + hilo broadcast
  4    | Lee el recap del viernes          | orgullo suave, no ranking    | D-1A: momento primero, puntos de la semana
  5    | Semana 4: sigue jugando solo      | pertenencia, hábito          | autopiloto; hitos de racha en el reveal
  ADMIN|                                   |                              |
  A1   | Entra y crea cuenta               | "¿esto es serio?"            | D-2A: marca, errores que dicen qué hacer
  A2   | Conecta Slack, elige canal        | "¿qué acabo de autorizar?"   | D-2B: línea de anticipación, retorno claro
  A3   | Ve la cola generarse, publica     | "funciona"                   | D-2B: fill al guardar, primer post el mismo día
  A4   | Veta un juego raro                | control sin miedo            | D-2C: hoja de confirmación, fila "por rellenar"
  A5   | Abre Actividad en semana 3        | "¿va bien?" → una frase      | D-1C/D-2C: frase grande, Salud en una línea
  A6   | Recibe un DM del bot              | alerta sin alarma            | plan CEO 5: un DM cada 7 días, sin nombres
```
Horizontes: 5 segundos = bienvenida y primer post; 5 minutos = el reveal; 5 años = el anuario (diferido a TODOS.md).

### D-5A · Alineación con el tema: dos patrones documentados, cero tokens nuevos (aprobado)

- `DESIGN.md` gana la sección "Componentes v1.2 (este proyecto)" con **alerta en línea** (`alert-success` / `alert-warning` / `alert-error` / `alert-info`, ya presentes en `theme-tokens.css`) y **fila expandible** (`<details>` nativo vestido de `list-row`). Las utilidades correspondientes (`alert-info` y `list-row-details`) se agregan a `app/globals.css` en el mismo commit en que se creen los componentes, antes del primer uso.
- Todo lo demás del plan usa componentes ya documentados: `app-header`, `bottom-nav`, `tabs` (escritorio), `list-row`, `badge`, `empty-state`, `skeleton`, `spinner`, `btn-*`, `input-default`, `select`, `segmented` (solo en login: dos vistas del mismo formulario), `modal`/`sheet`, `toast`, `icon-btn`.
- Sin tokens nuevos: colores, tipografías, radios, sombras y motion son los del tema Cálido.

### D-6A · Escritorio, modo oscuro, teclado y lectores de pantalla (aprobado)

- **Un solo breakpoint (768 px).** Abajo: una columna, padding 16 px, `bottom-nav` (56 px + safe-area; el contenido reserva ese alto), botones a ancho completo apilados, hojas desde abajo. Arriba: columna centrada `max-width: 640px`, padding 24 px, la navegación pasa a `tabs` del tema bajo el header (Cola · Actividad · Conectar, activo con `aria-current="page"`), hojas → `modal` centrado de 380 px. La escala de texto no cambia.
- **Modo oscuro:** toggle en el header (`icon-btn` `sun`/`moon`, `aria-label` "Cambiar a modo oscuro/claro"); primera visita según `prefers-color-scheme`; se persiste en `localStorage` **solo** si el usuario lo cambia; clase `dark` en `<html>`; los tokens oscuros del tema. Nada de FOUC: la clase se aplica con un script en línea antes del primer render.
- **Teclado y lectores de pantalla:** landmarks `header` / `nav` / `main`; `focus-visible` del tema en todo lo interactivo; la hoja de veto atrapa el foco, abre con el foco en "Cancelar", Esc y clic afuera cierran, y al cerrar el foco vuelve al botón "Vetar" de esa fila; "Generando…" y los `toast` viven en una región `aria-live="polite"`; todo `icon-btn` lleva `aria-label`; imágenes: no hay; `prefers-reduced-motion` apaga el pulso del skeleton y la rotación del chevron. Contraste: pares del tema (AA verificado). Toque mínimo 44 px (tema).
- **Slack:** Block Kit ya es accesible por sí mismo; reglas propias: límites de texto (D-1A), el estado siempre en texto (nunca solo color ni solo emoji), un emoji máximo por mensaje salvo el puzzle de emojis (D-2D).

### D-7A · Preguntas del onboarding y frase de entrada por clave (aprobado)

| `question_key` | Pregunta en el modal (placeholder) | Frase de entrada del post |
|---|---|---|
| `hidden_talent` | ¿Un talento oculto? ("tocar el ukelele") | "Alguien de este equipo tiene un talento oculto: {r}" |
| `surprising_story` | Algo sorprendente que te haya pasado ("quedarse encerrado en un IKEA") | "A alguien de este equipo le pasó esto: {r}" |
| `first_job` | ¿Tu primer trabajo? ("repartir periódicos") | "El primer trabajo de alguien aquí fue: {r}" |
| `dream_trip` | ¿Un lugar al que sueñas con ir? ("Islandia") | "Alguien de este equipo sueña con ir a: {r}" |
| `childhood_dream` | ¿Qué querías ser de niño? ("astronauta") | "De niño, alguien de este equipo quería ser: {r}" |
| `unusual_food` | ¿Una comida rara que te encanta? ("chapulines") | "A alguien de este equipo le encanta comer: {r}" |
| `silly_fear` | ¿Algo que te da miedo y no debería? ("las palomas") | "Alguien de este equipo le tiene miedo a: {r}" |
| `celebrity_encounter` | ¿Te has topado a alguien famoso? ("Luis Miguel en un aeropuerto") | "Alguien de este equipo se topó a: {r}" |
| `collection` | ¿Coleccionas algo? ("boletos de cine") | "Alguien de este equipo colecciona: {r}" |
| `free` | Algo más que quieras que adivinen (ayuda: "en tercera persona: «corrió un maratón en 2019»") | "Alguien de este equipo… {r}" |

Reglas: todos opcionales; `help-text` común "Corto, como para completar la frase"; `max_length` 280; texto escapado (3A); la clave es estable para siempre (cambiar una pregunta = clave nueva; los hechos viejos conservan la suya); temas excluidos por diseño: religión, política, salud, dinero, pareja. `scripts/seed-facts.ts` (D-3A) exige una de estas claves por hecho. El mismo `free` sirve a `/rituales hecho`.

### NOT in scope (diseño)

- Rediseño del estilo visual (colores, tipografía, logo): el tema Cálido de raicode se conserva; la identidad propia se hace después desde el tablero de raicode.
- Anuario, insignias, avatares de miembros, imágenes: fuera del MVP (plan CEO).
- Internacionalización de la UI y de los strings del bot: `language` solo afecta contenido generado.
- Landing pública o página de marketing: no hay destino web para el equipo; solo el admin entra.
- Animaciones de autor: en una app de operar, el motion es el del tema (200 ms) y nada más.
- Notificaciones push o correo desde la web: el muro del correo y "el bot vive en Slack".

### What already exists (diseño)

`DESIGN.md` (tema Cálido) con `theme-tokens.css`: tokens `--c-*`, Lora + Nunito Sans, escala de spacing y radii, y las utilidades `app-header`, `bottom-nav`, `tabs`, `list-row`, `badge`, `empty-state`, `skeleton`, `spinner`, `btn-*`, `input-default`, `segmented`, `modal`, `sheet-handle`, `toast`, `icon-btn`, `alert-success/warning/error`. Lucide como única librería de íconos. En Slack, Block Kit nativo (`header`, `section`, `actions`, `context`, `static_select`, modales con `plain_text_input` y `radio_buttons`). Nada se inventa; dos patrones se documentan (D-5A).

## Ingeniería (revisión /plan-eng-review, 2026-09-15)

Verificado contra documentación pública: Vercel Hobby permite hasta 100 crons por proyecto (cada uno máximo una vez al día, precisión de una hora); funciones con Fluid Compute hasta 300 s en Hobby; logs de runtime de 1 hora; distribución pública de apps de Slack sin revisión; `pg_cron` + `pg_net` disponibles en Supabase gratis. Orden de construcción confirmado (D1): hitos 0-7 tal como aparecen en la sección "Step 0" de esta revisión.

### E-0 · Hitos de construcción (aprobado)

- **Hito 0 · Esqueleto visible en localhost (sin Slack):** Next.js 15 + Tailwind + tema Cálido + favicon · login (DT4) · header con modo oscuro · nav · migración v1 completa (tablas, enums, RLS, `claim_due_games`, `submit_answer`, `events`) · `/api/health` · Cola con contenido de muestra · Actividad vacía. Es el momento `mvp-ready` de raicode.
- **Hito 1 · Adivina-quién de punta a punta (exige Vercel + app de Slack):** manifest "Rituales" · OAuth + callback · Conectar (canal, ritmo, fill al guardar, bienvenida) · `GameTemplate` + `guess_who` · strings · tick (post, ack, reveal) · `seed-facts` con permiso · `/rituales salir` · eventos `app_uninstalled`/`tokens_revoked` · mapeo de errores · Cola de solo lectura.
- **Hito 2 · Juegos de botones restantes + IA:** `two_truths` (material sembrado) · `this_or_that` (Anthropic con tool use + zod, `reveal_quip`) · regla de contenido de muestra.
- **Hito 3 · Puntos, rachas, recap** con momento de la semana e hitos de racha.
- **Hito 4 · Juegos por modal:** trivia y puzzle (generación, modal, `submit_answer` antes de responder, confirmación efímera).
- **Hito 5 · Onboarding por modal** (con el bloque de dos verdades) · `borrar-mis-datos` · `/rituales hecho` · eventos de entrada/salida de miembros.
- **Hito 6 · Veto con hoja · Generar otra semana · pausa · DM al admin · Salud en Actividad.**
- **Hito 7 · `/rituales stats` · README con runbook y lista post-deploy · pulido de escritorio.**

### E-1A · Tick por hora desde `vercel.json` (aprobado)

- `vercel.json` lleva 24 entradas de cron, una por hora (`0 0 * * *` … `0 23 * * *`), todas a `GET /api/tick`. Cada entrada corre una vez al día (regla de Hobby); en conjunto, el tick corre cada hora con precisión de una hora.
- El tick calcula por equipo la hora local con `teams.timezone` y actúa solo en sus ventanas: **posts** cuando la hora local es ≥ 10:00 y el slot es de hoy (ventana de 2 h: un `queued` con `scheduled_for` de más de 2 h se marca `skipped(out_of_window)`); **reveals** cuando la hora local es ≥ 18:00 y `posted_at` tiene ≥ 4 h; **recap** los viernes ≥ 18:00 después de los reveals.
- Se elimina el `CHECK (timezone = 'America/Mexico_City')`; `teams.timezone` acepta cualquier zona IANA válida (validada en Conectar cuando exista el selector; en el MVP el default es CDMX).
- **Falla ruidosa:** si Vercel rechaza el patrón, el deploy falla con error visible; el plan B documentado es `pg_cron` + `pg_net` cada 15 min (README, sección runbook).
- Sustituye a lo escrito en el design doc ("dos crons diarios") y en el plan CEO (D10, guardia `CHECK`).

### E-1B · Publicación cerrada en seguro: nunca re-publicar un intento incierto (aprobado)

- `games.post_attempted_at timestamptz`: el tick lo escribe **antes** de llamar a `chat.postMessage`; `posted` + `slack_ts` se escriben después, en una sola sentencia.
- El reclamo de atascados (`posting` con `updated_at < now() - 15 min`): si `post_attempted_at IS NOT NULL` y `slack_ts IS NULL`, **no re-publica**: marca `skipped` con `skip_reason = 'post_uncertain'` (se agrega al enum), escribe el evento y dispara el DM al admin: "No sé si el juego del {día} llegó al canal. Revísalo; si no está, el siguiente turno lo repone." Si `post_attempted_at IS NULL` (falló antes de llamar a Slack), vuelve a `queued` y aplica la ventana normal.
- `revealing` sí se reintenta siempre: `chat.update` sobre el mismo `ts` es idempotente y el hilo se publica solo si `revealed_thread_ts IS NULL` (columna nueva; se escribe con el `ts` del hilo).
- Verificación: prueba unitaria del reclamo con `post_attempted_at` presente (no re-publica) y ausente (vuelve a `queued`); prueba de reveal reintentado sin hilo duplicado.

### E-1C · El callback de OAuth rechaza instalaciones de otra cuenta (aprobado)

- En `GET /api/slack/oauth/callback`, antes del upsert: si existe `teams` con ese `slack_team_id` y `admin_user_id <> auth.uid()` → no se toca la fila y se redirige a `/conectar?error=already_connected` → `alert-error` "Este workspace ya está conectado por otra cuenta. Pídele a esa persona que te dé acceso." Si el `admin_user_id` coincide → se actualiza `bot_token`, `bot_user_id`, se limpia `disconnected_at`, y aplica la reconexión de 2A (`conversations.join` + re-sincronizar miembros).
- El `state` firmado con caducidad (3A) sigue siendo la protección CSRF; esta regla cubre el caso legítimo de "otra cuenta autoriza a propósito".
- Transferencia de admin: fuera del MVP (plan CEO); cuando exista, será una acción explícita del admin actual, nunca una reinstalación.
- Verificación: prueba del callback con admin distinto (rechaza, fila intacta) y con el mismo admin (actualiza).

### E-1D · `bot_token` en Supabase Vault (aprobado)

- `teams.bot_token` desaparece; en su lugar `teams.bot_token_secret_id uuid`. El callback de OAuth guarda el token con `vault.create_secret(token, 'slack-bot-' || slack_team_id)` (o `vault.update_secret` al reinstalar) y escribe el id.
- Una función `get_bot_token(team_id uuid)` `security definer`, `revoke execute from public/authenticated`, solo invocable por service role, lee `vault.decrypted_secrets` y devuelve el token al servidor. Todo lo que habla con Slack (tick, fill, handlers) obtiene el token por esa función y **nunca** lo escribe en `events`, logs ni respuestas.
- Rotación: reinstalar por OAuth actualiza el secreto; `tokens_revoked` (2A) lo invalida sin borrarlo.
- Verificación: el script de humo (6A) crea un secreto de prueba, lo lee por la función y confirma que el rol `authenticated` no puede ejecutarla.

### E-1E · Aislamiento por equipo y `run_id` (aprobado)

- `lib/runs.ts`: `startRun(kind)` genera `run_id` (uuid) y escribe el evento inicial; `forEachTeam(run, fn)` recorre los equipos activos (`disconnected_at IS NULL`) y ejecuta `fn(team)` dentro de su propio `try/catch`: un error se registra como evento `team_error` con `team_id`, `run_id`, nombre de la excepción y mensaje (nunca el token), y la corrida continúa con el siguiente equipo. Al final, `finishRun(run, summary)` escribe `tick_run` / `fill_run` con equipos procesados, publicados, revelados, saltados y errores.
- Todo evento y toda línea de log de una corrida llevan `run_id`; Actividad muestra los eventos agrupados por corrida cuando Salud está en rojo.
- Verificación: prueba con dos equipos donde el primero lanza error y el segundo publica igual; prueba de que el resumen cuenta el error.

### E-2A · Mapa de módulos, helpers únicos, tick por fases, errores por capas (aprobado)

```
  app/
    login/  (app)/{conectar,cola,actividad}/  api/{tick,health}/  api/queue/fill/
    api/slack/{interactions,events,commands,install,oauth/callback}/  globals.css  layout.tsx  icon.tsx
  lib/
    slack/   client.ts (getSlackClient(team) → WebClient con token de Vault) · verify.ts (withSlackRequest) · errors.ts (mapSlackError,
             SlackError) · text.ts (escapeSlackText) · blocks.ts · strings.ts · schemas.ts (zod por payload) · modals/{trivia,puzzle,onboarding,fact}.ts
    games/   template.ts (GameTemplate) · questions.ts · guess-who.ts · two-truths.ts · trivia.ts · this-or-that.ts · puzzle.ts · recap.ts · rotation.ts
    db/      server.ts (service role) · browser.ts (publishable) · queries.ts · rpc.ts (claim_due_games, submit_answer, get_bot_token)
    events/  index.ts (logEvent) · labels.ts
    ai/      generate.ts (tool use + zod + 1 reintento) · prompts.ts (por idioma) · sample-content.json
    runs.ts (startRun, forEachTeam, finishRun) · time.ts (slot_date, ventanas por zona) · answers.ts (handleAnswerSubmission)
  supabase/migrations/  scripts/{seed-facts,smoke}.ts  slack-app-manifest.json  vercel.json  TODOS.md  DESIGN.md
```
- **Helpers únicos:** `withSlackRequest(handler)` (firma HMAC + ventana de 5 min + parseo `payload` + 200 rápido + `after()`), `handleAnswerSubmission()` (`submit_answer` antes de responder + `response_action` + confirmación efímera; lo usan trivia, puzzle y el botón de respuesta), `forEachTeam()` (E-1E), `mapSlackError()` (tres salidas, plan CEO 2A).
- **Tick por fases puras:** `sweep(now)`, `reveal(now)`, `post(now)`, `recap(now)`, cada una recibe `db`, `slack` y `now` inyectados; el route handler solo compone las cuatro con `forEachTeam`.
- **Errores por capas:** clases `SlackError`, `TemplateError`, `AiOutputError`, `DbError`; ningún `catch (e) {}` vacío; un solo `catch` en el borde de cada ruta que escribe `events` (con `run_id` cuando aplica) y responde 200 a Slack (evita reintentos por bugs propios) o 500 en rutas propias (`/api/tick`, `/api/queue/fill`, `/api/health`).
- **Diagramas en código:** `lib/games/template.ts` (contrato y fases), `app/api/tick/route.ts` (máquina de estados de `games`), `lib/slack/verify.ts` (flujo de un request), `supabase/migrations/0001_init.sql` (relaciones). Mantenerlos es parte de cada cambio.

### E-3A · Stack de pruebas (aprobado, 9/10 por diseño: sin navegador en el repo)

- **Vitest** para funciones puras, plantillas (`render`/`score`/`reveal` con snapshots), `escapeSlackText`, normalización del puzzle, `mapSlackError`, esquemas `zod`, `time.ts` (ventanas por zona) y el tick por fases con `now` inyectado.
- **Testing Library** (React) para los componentes y los estados de `/login`, Conectar, Cola y Actividad (una prueba de render por estado, D-2A/2B/2C).
- **msw** para simular Slack (`chat.postMessage`, `chat.update`, `views.open`, `oauth.v2.access`, `conversations.*`) y Anthropic por HTTP en las pruebas de rutas; ninguna prueba llama a servicios reales.
- **Fixtures firmados** para las tres rutas de Slack (firma válida, inválida, timestamp viejo, payload malformado).
- **`scripts/smoke.ts`** (6A) contra el proyecto real de Supabase con un equipo de prueba marcado: `claim_due_games` (dos llamadas concurrentes no duplican), `submit_answer` (rechaza tras `revealing`), vistas de puntos/rachas, RLS (`authenticated` no lee `answers`/`facts`), Vault (`get_bot_token` solo con service role).
- **Eval ligero** `evals/content.test.ts`: corre solo si existe `ANTHROPIC_API_KEY`; genera 5 juegos por plantilla con IA y comprueba esquema (`zod`) y ausencia de temas excluidos (lista de palabras); marca `[→EVAL]` del mapa de cobertura.
- **E2E** (login, conectar con Slack simulado): fuera del repo; los ejecuta `/qa` con el navegador de gstack tras construir cada hito. `npm test` corre todo lo demás en segundos.

### E-4 · Rendimiento

Sin hallazgos a la escala del MVP (7-15 personas, ~150 juegos/año, 24 ticks diarios de milisegundos cuando no hay nada vencido). Ya cubierto: índices únicos parciales, `submit_answer` indexada por (`game_id`, `member_id`), fill en paralelo con `maxDuration = 120` (Fluid Compute permite hasta 300 s en Hobby), `@slack/web-api` con reintentos ante 429. Para más de un equipo: T18 (índice de `games` por equipo/estado/fecha y fill por equipo).

### NOT in scope (ingeniería)

- Transferencia de admin entre cuentas: fuera del MVP (plan CEO); E-1C lo hace explícito.
- `pg_cron` + `pg_net`: plan B documentado en el runbook, no se construye salvo que Vercel rechace el patrón de 24 crons.
- Supabase local con Docker para pruebas: atajo 6A registrado con su disparador.
- Playwright en el repo: los E2E los corre `/qa`.
- CI (GitHub Actions): Vercel construye en cada push; `npm test` corre en local antes de cada commit de hito. Un workflow de CI entra cuando haya un segundo colaborador (se anota en TODOS.md si Pablo lo pide; hoy no).
- Rotación automática del `CRON_SECRET` y del `SLACK_SIGNING_SECRET`: manual, documentada en el runbook.

### What already exists (ingeniería)

Proyecto en blanco. Se reúsa: `@slack/web-api` (cliente oficial con reintentos), `crypto` de Node (firma), Postgres (funciones, vistas, índices parciales, RLS, Vault), Vercel Cron y Fluid Compute, `@anthropic-ai/sdk` (tool use), `zod`, `next/server` `after()` (Next.js 15), Supabase Auth (email + contraseña), Vitest / Testing Library / msw. Nada se construye donde existe un built-in [Layer 1].

### Failure modes (nuevas rutas de esta revisión)

```
  CODEPATH                         | FAILURE MODE                                  | TEST? | HANDLED?                               | USER SEES?
  ---------------------------------|-----------------------------------------------|-------|----------------------------------------|---------------------------
  tick por hora (E-1A)             | Vercel rechaza 24 crons                       | —     | falla en deploy (ruidosa); plan B      | deploy rojo + runbook
  tick por hora (E-1A)             | zona IANA inválida en teams.timezone          | Y     | validación al escribir; fallback UTC   | Conectar: error de zona
  post (E-1B)                      | Slack ok, DB falla → intento incierto         | Y     | skipped(post_uncertain) + DM           | DM al admin, Actividad
  reveal (E-1B)                    | hilo publicado, DB falla                      | Y     | revealed_thread_ts evita hilo doble    | nada (reintento limpio)
  oauth/callback (E-1C)            | otra cuenta instala el mismo workspace        | Y     | rechazo sin tocar la fila              | "ya está conectado…"
  get_bot_token (E-1D)             | secreto ausente o Vault inaccesible           | Y     | team_error + tratar como desconectado  | Conectar: "vuelve a conectar"
  forEachTeam (E-1E)               | error en equipo A                             | Y     | catch por equipo; evento; sigue con B  | Actividad (eventos)
  withSlackRequest (E-2A)          | bug propio en handler                         | Y     | catch de borde: evento + 200 a Slack   | Actividad (evento) · sin reintentos
  eval ligero (E-3A)               | sin llave de Anthropic                        | —     | prueba marcada como omitida, no fallida | `npm test` verde con aviso
```
CRITICAL GAPS: 0.

### Worktree parallelization strategy

| Step | Modules touched | Depends on |
|------|-----------------|------------|
| Hito 0 · esqueleto, migración v1, login, shell | app/, lib/db/, supabase/migrations/, globals.css | — |
| Lane B · Slack | lib/slack/, app/api/slack/ | Hito 0 |
| Lane C · Juegos + IA | lib/games/, lib/ai/ | Hito 0 |
| Lane D · Pantallas web | app/(app)/, components/ | Hito 0 |
| Lane E · Tick + fill + runs | app/api/tick/, app/api/queue/, lib/runs.ts, lib/time.ts | B, C |
| Hitos 3-7 · por funcionalidad | mixto | E, D |

- **Lanes:** `Lane A: hito 0 (secuencial, base)` / `Lane B: lib/slack + rutas (independiente tras A)` / `Lane C: lib/games + lib/ai (independiente tras A)` / `Lane D: pantallas (independiente tras A)` / `Lane E: tick + fill (tras B y C)`.
- **Orden:** A → lanzar B + C + D en paralelo → fusionar → E → hitos 3-7 secuenciales por funcionalidad.
- **Conflict flags:** `lib/slack/strings.ts` lo escriben B (mensajes) y C (textos de reveal por plantilla): C escribe sus strings en `lib/games/<plantilla>.ts` y B los importa en el paso E. `lib/events/labels.ts` lo tocan D y E: D crea el archivo con las etiquetas; E solo agrega tipos nuevos.

## Implementation Tasks
Sintetizadas de los hallazgos de esta revisión. Cada tarea sale de un hallazgo concreto. Marca la casilla al terminarla.

- [ ] **T1 (P1, humano: ~1 día / CC: ~30 min)** — motor — Definir la interfaz `GameTemplate` (`generate`, `render`, `score`, `reveal`) y un archivo por plantilla; tick y fill solo hablan con la interfaz; `template_error` solo para excepciones propias; líneas decorativas fallan en suave
  - Surfaced by: Sección 1 — 1A contrato de plantilla
  - Files: `lib/games/template.ts`, `lib/games/{guess-who,two-truths,trivia,this-or-that,puzzle,recap}.ts`, `app/api/tick/route.ts`, `app/api/queue/fill/route.ts`
  - Verify: prueba unitaria por plantilla; prueba de que el tick no importa tipos concretos
- [ ] **T2 (P1, humano: ~4 h / CC: ~25 min)** — slack — Mapeo compartido de errores de Slack con tres salidas (desconexión, canal, transitorio); `teams.disconnected_at`, `channel_error_at`; eventos `app_uninstalled`/`tokens_revoked` en el manifest; reconexión hace `conversations.join` y re-sincroniza miembros
  - Surfaced by: Sección 2 — 2A y 2A-bis
  - Files: `lib/slack/errors.ts`, `lib/slack/client.ts`, `app/api/slack/events/route.ts`, `app/api/slack/oauth/callback/route.ts`, `slack-app-manifest.json`, migración
  - Verify: prueba unitaria del mapeo con los tres tipos; prueba manual desinstalando
- [ ] **T3 (P1, humano: ~4 h / CC: ~30 min)** — contenido — Tool use con JSON schema por plantilla, validación `zod`, un reintento con el error en el prompt, luego "sin material" → rotación; `generation_failed` a logs; DM al admin si la corrida da cero
  - Surfaced by: Sección 2 — 2B
  - Files: `lib/ai/generate.ts`, `lib/games/*.ts`, `app/api/queue/fill/route.ts`
  - Verify: pruebas unitarias con respuestas malformadas, vacías y rechazos
- [ ] **T4 (P1, humano: ~2 h / CC: ~15 min)** — seguridad — `escapeSlackText` para todo texto de miembros antes de Block Kit; `max_length=280` en modales; firma con ventana de 5 min; `state` de OAuth firmado con caducidad de 10 min
  - Surfaced by: Sección 3 — 3A
  - Files: `lib/slack/text.ts`, `lib/slack/verify.ts`, `app/api/slack/install/route.ts`, `app/api/slack/oauth/callback/route.ts`
  - Verify: pruebas con `<!channel>`, `<@U123>`, acentos; timestamp viejo → 401
- [ ] **T5 (P1, humano: ~2 h / CC: ~15 min)** — datos — Función `submit_answer(game_id, member_id, value)` atómica (upsert solo si `posted`, devuelve `accepted`); handler responde "Guardado" o "ya cerró"
  - Surfaced by: Sección 4 — 4A
  - Files: migración SQL, `app/api/slack/interactions/route.ts`
  - Verify: prueba con orden adverso (reveal entre lectura e inserción) → rechazada
- [ ] **T6 (P2, humano: ~3 h / CC: ~30 min)** — pruebas — `scripts/smoke.ts` contra el proyecto real con equipo de prueba marcado: claim, submit_answer, vistas, RLS; marcador `gstack-shortcut(dec-88b9fc96)`
  - Surfaced by: Sección 6 — 6A (atajo 7/10; subir a Supabase local con Docker con 2º dev o >5 funciones SQL)
  - Files: `scripts/smoke.ts`, `package.json`
  - Verify: correr tras cada deploy; salida verde
- [ ] **T7 (P1, humano: ~4 h / CC: ~30 min)** — observabilidad — Tabla `events` (append-only, retención 90 días), `teams.last_tick_at`, bloque Salud en Registro (rojo > 26 h) con últimos 20 eventos en lenguaje humano
  - Surfaced by: Sección 8 — 8A
  - Files: migración SQL, `lib/events.ts`, `app/api/tick/route.ts`, `app/(app)/registro/page.tsx`
  - Verify: prueba de que cada rama del tick escribe su evento
- [ ] **T8 (P1, humano: ~1 h / CC: ~15 min)** — despliegue — `GET /api/health` (Supabase, variables por nombre, llave sí/no; 503 con lo que falta) y lista post-deploy en el README
  - Surfaced by: Sección 9 — 9A
  - Files: `app/api/health/route.ts`, `README.md`
  - Verify: prueba unitaria con una variable faltante → 503
- [ ] **T9 (P2, humano: ~3 h / CC: ~20 min)** — web — Componente único de estado vacío/error del tema Cálido y mapa de estados de Conectar, Cola, Registro (textos del plan CEO 11A)
  - Surfaced by: Sección 11 — 11A
  - Files: `components/EmptyState.tsx`, `app/(app)/{conectar,cola,registro}/page.tsx`
  - Verify: una prueba de render por estado
- [ ] **T10 (P1, humano: ~1 h / CC: ~10 min)** — datos — `teams.timezone` (default CDMX, `CHECK`) y `teams.language` (default `es`); el tick calcula `slot_date` con la zona del equipo; los prompts reciben el idioma
  - Surfaced by: Paso 0E — D10
  - Files: migración SQL, `lib/time.ts`, `lib/ai/prompts.ts`
  - Verify: prueba de `slot_date` con la zona del equipo; migración rechaza otra zona
- [ ] **T11 (P2, humano: ~1 h / CC: ~10 min)** — slack — Bienvenida al canal cuando `channel_id <> welcomed_channel_id` (días de la cadencia, opt-out, sin hora ni comandos inexistentes); `welcomed_channel_id` solo al éxito
  - Surfaced by: Paso 0D — deleite 1
  - Files: `app/(app)/conectar/actions.ts`, `lib/slack/messages/welcome.ts`, migración
  - Verify: prueba del texto por cadencia y con pausa; fallo → aviso y reintento al guardar
- [ ] **T12 (P2, humano: ~2 h / CC: ~15 min)** — recap — Momento de la semana (candidatos activos, N/M de `answers`, desempate, omitir si 0, mentira para dos verdades)
  - Surfaced by: Paso 0D — deleite 2
  - Files: `lib/games/recap.ts`, vista SQL
  - Verify: pruebas con empate, con protagonista que salió, con máximo 0
- [ ] **T13 (P2, humano: ~5 h / CC: ~30 min)** — motor — Pausa: `paused_until` inclusivo, UI "Pausar hasta / Quitar pausa", fill no crea slots en pausa, `claim_due_games` con join a `teams` (exclusión, `resumed`), barrido con `skip_reason=paused`, botón "Publicar el primero ahora" deshabilitado
  - Surfaced by: Paso 0D — deleite 3 (M-chico; modifica `claim_due_games`)
  - Files: migración SQL, `app/(app)/conectar/*`, `app/api/queue/fill/route.ts`, `app/api/tick/route.ts`
  - Verify: SQL directo con equipo en pausa; reveals siguen; línea "ya volvimos" una sola vez
- [ ] **T14 (P2, humano: ~2 h / CC: ~15 min)** — reveal — Hitos de racha (racha vigente + juego actual; 5/10/25; una línea con todos; sin emoji propio; falla en suave)
  - Surfaced by: Paso 0D — deleite 4
  - Files: vista de rachas SQL, `lib/games/reveal.ts`
  - Verify: prueba con varios jugadores llegando a 5; prueba de quien faltó un juego
- [ ] **T15 (P2, humano: ~4 h / CC: ~25 min)** — admin — DM al admin: disparadores (a-d), tope de 7 días con reset al entrar un hecho, transición para `channel_error`, textos sin nombres, `admin_slack_user_id` desde OAuth
  - Surfaced by: Paso 0D — deleite 5 (M-chico)
  - Files: `lib/slack/messages/admin-alert.ts`, `app/api/queue/fill/route.ts`, `app/api/tick/route.ts`, migración
  - Verify: prueba del tope y del reset; prueba de que el texto no incluye nombres
- [ ] **T16 (P2, humano: ~4 h / CC: ~25 min)** — comandos — Handler mínimo de `/rituales` en hito 1 (`salir` con botón "Volver a entrar", "pronto"); `borrar-mis-datos` en hito 5 con el onboarding; `hecho` (una lectura antes de `views.open`, insert antes de responder, `response_action`); `stats` en hito 7
  - Surfaced by: Paso 0D — deleite 6 + decisiones de secuencia
  - Files: `app/api/slack/commands/route.ts`, `lib/slack/modals/fact.ts`, `slack-app-manifest.json`
  - Verify: pruebas por subcomando; no-miembro → efímero
- [ ] **T17 (P2, humano: ~3 h / CC: ~20 min)** — datos — `games.skip_reason`; `used_at` al llegar a `posted`; definición de hecho fresco con reserva (queued/posting); vista de rachas (racha vigente, solo `revealed`, sin protagonista)
  - Surfaced by: revisión adversarial del plan CEO (rondas 1-3)
  - Files: migración SQL, `lib/games/guess-who.ts`, `app/api/queue/fill/route.ts`
  - Verify: prueba de no repetición tras `no_answers`; prueba de racha con pausa en medio
- [ ] **T18 (P3, humano: ~1 h / CC: ~10 min)** — rendimiento — Índice `games (team_id, status, scheduled_for)` y fill por equipo cuando haya más de un equipo
  - Surfaced by: Sección 7 — notas (sin hallazgo a la escala del MVP)
  - Files: migración SQL, `app/api/queue/fill/route.ts`
  - Verify: `EXPLAIN` del claim usa el índice
- [ ] **T19 (P3, humano: ~2 h / CC: ~15 min)** — docs — README con runbook ("no salió el juego", "duplicado", "cron muerto"), orden de hitos y lista post-deploy
  - Surfaced by: Secciones 8 y 10
  - Files: `README.md`
  - Verify: lectura por alguien que no estuvo en esta sesión

_No new tasks from Sección 5 (calidad), Sección 10 (trayectoria)._

### Tareas de diseño (de /plan-design-review, 2026-09-15)

- [ ] **DT1 (P1, humano: ~4 h / CC: ~30 min)** — slack — `lib/slack/strings.ts` con todos los textos del bot; anatomía de post (`header`/`section`/`actions`/`context`), ack con `replace_original: false`, reveal en dos partes (`chat.update` + hilo `reply_broadcast`), formato por plantilla, `reveal_quip` generado en el fill, recap en orden fijo con puntos de la semana
  - Surfaced by: D-1A
  - Files: `lib/slack/strings.ts`, `lib/slack/blocks.ts`, `lib/games/*.ts`, `lib/games/recap.ts`
  - Verify: snapshot por plantilla del post y del reveal; prueba de que ningún texto excede los límites de Block Kit
- [ ] **DT2 (P1, humano: ~1 h / CC: ~10 min)** — marca — Nombre "Rituales" en `slack-app-manifest.json`, `<title>`, header y `app/icon.tsx` (inicial "R" en Lora sobre el acento)
  - Surfaced by: D-1B
  - Files: `slack-app-manifest.json`, `app/layout.tsx`, `app/icon.tsx`
  - Verify: el favicon se ve en la pestaña; el post en Slack sale como "Rituales"
- [ ] **DT3 (P1, humano: ~6 h / CC: ~40 min)** — web — Header con toggle, aterrizaje tras login, Conectar por secciones sin tarjeta (Guardar primario; "Publicar el primero ahora" condicional y desaparece tras el primer post), Cola como `list-row` con `preview` sin fuga, Actividad con frase grande + Salud en una fila + últimos juegos, nav con `calendar-days`/`activity`/`plug`
  - Surfaced by: D-1C
  - Files: `app/(app)/layout.tsx`, `components/AppHeader.tsx`, `components/BottomNav.tsx`, `app/(app)/{conectar,cola,actividad}/page.tsx`
  - Verify: prueba de render por pantalla; prueba de que la fila de adivina-quién nunca contiene el hecho
- [ ] **DT4 (P1, humano: ~3 h / CC: ~20 min)** — web — Pantalla `/login` con segmentado Entrar/Crear cuenta, errores literales, ayuda sin recuperación por correo, aviso de "Confirm email" prendido
  - Surfaced by: D-2A
  - Files: `app/login/page.tsx`, `lib/supabase/client.ts`
  - Verify: prueba por cada error; prueba del caso "usuario sin sesión"
- [ ] **DT5 (P1, humano: ~5 h / CC: ~30 min)** — web — Flujo de Conectar: fill al guardar canal, `?connected=1` / `?error=`, línea de anticipación, estados de la lista de canales, spinner y toast de guardado con el día del próximo juego, estados de "Publicar el primero ahora", regla de cadencia (solo slots nuevos), pausa con `<input type="date">`
  - Surfaced by: D-2B
  - Files: `app/(app)/conectar/*`, `app/api/slack/oauth/callback/route.ts`, `app/api/queue/fill/route.ts`
  - Verify: prueba de que guardar canal dispara el fill; prueba del texto del toast por cadencia
- [ ] **DT6 (P1, humano: ~5 h / CC: ~30 min)** — web — Hoja de veto (foco en Cancelar, Esc, "Sí, vetar" en rojo, fila "por rellenar", toast), estados de Cola y Actividad, tabla `lib/events/labels.ts`
  - Surfaced by: D-2C
  - Files: `components/VetoSheet.tsx`, `components/EmptyState.tsx`, `app/(app)/{cola,actividad}/page.tsx`, `lib/events/labels.ts`
  - Verify: prueba de render por estado; prueba de que cada `events.kind` tiene etiqueta
- [ ] **DT7 (P1, humano: ~6 h / CC: ~40 min)** — slack — Modales (trivia obligatoria con `initial_option`, puzzle con hint, onboarding con validación del bloque de dos verdades, hecho nuevo) con `submit_answer` antes de responder y `chat.postEphemeral` de confirmación; efímeros literales; `salir`/`borrar-mis-datos`/`stats` con sus textos; `skip_reason = 'sample'` y aviso sin llave
  - Surfaced by: D-2D
  - Files: `lib/slack/modals/*.ts`, `app/api/slack/interactions/route.ts`, `app/api/slack/commands/route.ts`, `app/api/tick/route.ts`, migración (`sample` en el enum)
  - Verify: prueba de envío tardío → error en el modal; prueba de que un juego `is_sample` nunca se publica
- [ ] **DT8 (P1, humano: ~2 h / CC: ~15 min)** — hito 1 — T11 (bienvenida) sube a P1 y condiciona el primer post; `scripts/seed-facts.ts` con `member_id`, `question_key`, `source = 'seed'`
  - Surfaced by: D-3A
  - Files: `scripts/seed-facts.ts`, `app/api/tick/route.ts`
  - Verify: el tick no publica en un canal sin `welcomed_channel_id`
- [ ] **DT9 (P2, humano: ~1 h / CC: ~10 min)** — tema — Utilidades `alert-info` y `list-row-details` en `app/globals.css` conforme a DESIGN.md v1.2, en el mismo commit que su primer uso
  - Surfaced by: D-5A
  - Files: `app/globals.css`, `DESIGN.md`
  - Verify: ninguna clase de alerta o fila expandible fuera de esas utilidades
- [ ] **DT10 (P1, humano: ~4 h / CC: ~25 min)** — web — Tabs en escritorio, columna de 640 px, modo oscuro (toggle, `prefers-color-scheme`, persistencia solo al cambiar, script anti-FOUC), landmarks, foco de la hoja, `aria-live`, `aria-label`, `prefers-reduced-motion`
  - Surfaced by: D-6A
  - Files: `app/(app)/layout.tsx`, `components/ThemeToggle.tsx`, `components/VetoSheet.tsx`, `app/globals.css`
  - Verify: navegación por teclado completa en las 4 pantallas; prueba de que el toggle no escribe en localStorage hasta que se toca
- [ ] **DT11 (P1, humano: ~2 h / CC: ~15 min)** — contenido — Las 10 preguntas con claves y frases de entrada en `lib/games/questions.ts`; render de adivina-quién usa la frase por clave
  - Surfaced by: D-7A
  - Files: `lib/games/questions.ts`, `lib/games/guess-who.ts`, `lib/slack/modals/onboarding.ts`
  - Verify: snapshot del post por cada clave con una respuesta corta

_Ajuste a tareas previas: T11 pasa de P2 a P1 (D-3A). T9 (estados) queda cubierta y ampliada por DT3, DT4 y DT6._

### Tareas de ingeniería (de /plan-eng-review, 2026-09-15)

- [ ] **ET1 (P1, humano: ~3 h / CC: ~20 min)** — cron — 24 entradas en `vercel.json` (una por hora) a `/api/tick`; ventanas por `teams.timezone` en `lib/time.ts` (post ≥ 10:00 local, ventana 2 h; reveal ≥ 18:00 con `posted_at` ≥ 4 h; recap viernes); quitar el `CHECK` de zona; validar zona IANA al escribir
  - Surfaced by: E-1A
  - Files: `vercel.json`, `lib/time.ts`, `app/api/tick/route.ts`, `supabase/migrations`
  - Verify: pruebas de ventana con `now` inyectado en CDMX y Madrid; deploy en Vercel acepta el `vercel.json`
- [ ] **ET2 (P1, humano: ~2 h / CC: ~15 min)** — tick — `post_attempted_at`, `skip_reason = 'post_uncertain'`, `revealed_thread_ts`; reclamo de atascados cerrado en seguro; DM al admin del caso incierto
  - Surfaced by: E-1B
  - Files: `supabase/migrations`, `app/api/tick/route.ts`, `lib/slack/messages/admin-alert.ts`
  - Verify: prueba del reclamo con y sin `post_attempted_at`; reveal reintentado sin hilo duplicado
- [ ] **ET3 (P1, humano: ~1 h / CC: ~10 min)** — oauth — Rechazar instalación cuando `admin_user_id` difiere; `?error=already_connected` con su alerta
  - Surfaced by: E-1C
  - Files: `app/api/slack/oauth/callback/route.ts`, `app/(app)/conectar/page.tsx`
  - Verify: prueba con admin distinto (fila intacta) e igual (token actualizado)
- [ ] **ET4 (P1, humano: ~2 h / CC: ~15 min)** — seguridad — Vault: `bot_token_secret_id`, `vault.create_secret`/`update_secret` en el callback, función `get_bot_token` `security definer` con `revoke` a `authenticated`; `getSlackClient(team)` la usa
  - Surfaced by: E-1D
  - Files: `supabase/migrations`, `lib/slack/client.ts`, `app/api/slack/oauth/callback/route.ts`, `scripts/smoke.ts`
  - Verify: humo: lectura por service role ok; `authenticated` rechazado; el token nunca aparece en `events`
- [ ] **ET5 (P1, humano: ~2 h / CC: ~15 min)** — runs — `lib/runs.ts` con `startRun`, `forEachTeam` (try/catch por equipo, evento `team_error`), `finishRun` (`tick_run`/`fill_run`); `run_id` en todos los eventos
  - Surfaced by: E-1E
  - Files: `lib/runs.ts`, `app/api/tick/route.ts`, `app/api/queue/fill/route.ts`, `lib/events/index.ts`
  - Verify: prueba con dos equipos (el primero falla, el segundo publica); resumen cuenta el error
- [ ] **ET6 (P1, humano: ~4 h / CC: ~30 min)** — estructura — Mapa de módulos, `withSlackRequest`, `handleAnswerSubmission`, `mapSlackError`, tick en cuatro fases con inyección, clases de error tipadas, catch de borde por ruta, diagramas ASCII en los cuatro archivos señalados
  - Surfaced by: E-2A
  - Files: `lib/slack/verify.ts`, `lib/answers.ts`, `lib/slack/errors.ts`, `app/api/tick/route.ts`, `lib/games/template.ts`
  - Verify: `grep` de que la firma se verifica en un solo archivo; pruebas de cada fase del tick
- [ ] **ET7 (P1, humano: ~3 h / CC: ~25 min)** — pruebas — Vitest + Testing Library + msw configurados; fixtures firmados; `scripts/smoke.ts`; `evals/content.test.ts` condicionado a la llave; `npm test` en verde desde el hito 0
  - Surfaced by: E-3A
  - Files: `vitest.config.ts`, `tests/setup.ts`, `tests/fixtures/slack/*.json`, `scripts/smoke.ts`, `evals/content.test.ts`, `package.json`
  - Verify: `npm test` corre sin red; el eval se omite sin llave y pasa con llave

_No new tasks from Sección 4 (rendimiento)._

## Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | SELECTIVE EXPANSION                         |
  | System Audit         | repo vacío; design doc aprobado; sin TODOS  |
  | Step 0               | estructura A; D10 columnas tz/idioma;       |
  |                      | 6 deleites aceptados, 2 diferidos           |
  | Section 1  (Arch)    | 1 issue found (1A)                          |
  | Section 2  (Errors)  | 28 error paths mapped, 2 GAPS (2A, 2B) → 0  |
  | Section 3  (Security)| 1 issue found, 1 High severity (3A)         |
  | Section 4  (Data/UX) | 17 edge cases mapped, 1 unhandled (4A) → 0  |
  | Section 5  (Quality) | 0 issues found                              |
  | Section 6  (Tests)   | Diagram produced, 1 gap (6A, atajo 7/10)    |
  | Section 7  (Perf)    | 0 issues found (notas para eng review)      |
  | Section 8  (Observ)  | 1 gap found (8A)                            |
  | Section 9  (Deploy)  | 1 risk flagged (9A)                         |
  | Section 10 (Future)  | Reversibility: 4/5, debt items: 2           |
  | Section 11 (Design)  | 1 issue (11A)                               |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (15 items)                          |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 28 rutas, 0 CRITICAL GAPS                   |
  | Failure modes        | 19 total, 0 CRITICAL GAPS                   |
  | TODOS.md updates     | 2 items proposed                            |
  | Scope proposals      | 8 proposed, 6 accepted (SEL)                |
  | CEO plan             | written (3 rondas adversariales, 7/10)      |
  | Outside voice        | codex: disabled (codex_reviews=disabled)    |
  | Lake Score           | 8/9 recommendations chose complete option   |
  |                      | (6A eligió el atajo, registrado con techo)  |
  | Diagrams produced    | 6 (arquitectura, datos, estados, error,     |
  |                      | despliegue, rollback)                       |
  | Stale diagrams found | 1 (boceto: hora exacta; Salud ausente)      |
  | Unresolved decisions | 0                                           |
  +====================================================================+
```

## Unresolved Decisions

Ninguna. Todas las preguntas de esta revisión fueron respondidas (D8 se repitió a petición de Pablo por un clic erróneo; 6A se re-preguntó tras un reinicio de la app).

## Resumen de la revisión de diseño

```
  +====================================================================+
  |         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
  +====================================================================+
  | System Audit         | DESIGN.md descargado (Cálido); UI: Slack +  |
  |                      | web (login, Conectar, Cola, Actividad)      |
  | Step 0               | 6/10 inicial; las 7 dimensiones             |
  | Pass 1  (Info Arch)  | 4/10 → 9/10 after fixes (1A, 1B, 1C)        |
  | Pass 2  (States)     | 5/10 → 9/10 after fixes (2A, 2B, 2C, 2D)    |
  | Pass 3  (Journey)    | 5/10 → 9/10 after fixes (3A + storyboard)   |
  | Pass 4  (AI Slop)    | 5/10 → 8/10 (3 rechazos duros resueltos     |
  |                      | por 1B/1C; motion según el tema)            |
  | Pass 5  (Design Sys) | 6/10 → 9/10 after fixes (5A)                |
  | Pass 6  (Responsive) | 6/10 → 9/10 after fixes (6A)                |
  | Pass 7  (Decisions)  | 1 resolved (7A), 0 deferred                 |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (6 items)                           |
  | What already exists  | written                                     |
  | TODOS.md updates     | 0 items proposed (sin deuda de diseño)      |
  | Approved Mockups     | 1 generated (HTML propio, sin OpenAI),      |
  |                      | 1 approved; regenerado tras 1C              |
  | Decisions made       | 11 added to plan                            |
  | Decisions deferred   | 0                                           |
  | Overall design score | 4/10 → 8/10 (mínimo de las 6 pasadas)       |
  +====================================================================+
```
Plan design-complete. Correr `/design-review` sobre el sitio vivo después de construir.

## Approved Mockups

| Screen/Section | Mockup Path | Direction | Notes |
|----------------|-------------|-----------|-------|
| App web (login no incluido; 4 estados: Conectar, Cola, Cola vacía, Actividad) | `~/.gstack/projects/pablo/designs/web-app-20260915/web-mock-v2.png` | Tema Cálido: header "Rituales", secciones sobre el fondo, `list-row`, frase grande en Actividad, bottom-nav | Construir desde D-1C, D-2B, D-2C; el v1 (`web-mock.png`) queda como historial |
| Slack (post, reveal, recap) | `/private/tmp/…/scratchpad/sketch/sketch.png` (boceto) | Block Kit según D-1A | El boceto tiene textos obsoletos ("17:00", "#12", contador en vivo); manda D-1A |

## Resumen de la revisión de ingeniería

- Step 0: Scope Challenge — alcance aceptado tal cual (decisión previa de la revisión CEO); orden de hitos 0-7 confirmado (D1)
- Architecture Review: 5 issues found (E-1A a E-1E), 5 resueltos
- Code Quality Review: 1 issue found (E-2A), resuelto
- Test Review: diagrama producido, 0 gaps sin dueño (41/41 ramas con prueba asignada; stack decidido en E-3A)
- Performance Review: 0 issues found
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 0 items proposed
- Failure modes: 0 critical gaps flagged
- Outside voice: skipped (codex_reviews disabled; regla del proyecto: un solo modelo)
- Parallelization: 5 lanes, 3 parallel (B, C, D tras el hito 0) / 2 sequential (A, E)
- Lake Score: 6/7 recommendations chose complete option (E-3A eligió 9/10 sobre 10/10 a propósito: sin navegador en el repo)
- Unresolved decisions: 0

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAN | 8 proposals, 6 accepted, 2 deferred; 9 findings accepted; 0 critical gaps |
| Outside Review | codex (disabled by config) | Independent 2nd opinion | 0 | DISABLED | `codex_reviews=disabled`; sin pasada nativa sustituta en CEO ni en Eng (regla del proyecto: un solo modelo) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAN (PLAN) | 7 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAN (FULL) | score: 4/10 → 8/10, 11 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex, phase plan-review (CEO y Eng), disabled (opt-out por configuración); codex, phase design, disabled; la voz de diseño corrió como subagente Claude nativo (in-host, `issues_found`) y no cuenta como cobertura externa. Las revisiones adversariales del design doc y del plan CEO (3 rondas cada una) también fueron nativas.
- **VERDICT:** CEO + DESIGN + ENG CLEARED — ready to implement.

NO UNRESOLVED DECISIONS

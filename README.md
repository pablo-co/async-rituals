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

## Hitos

0 esqueleto en localhost · 1 adivina-quién de punta a punta (Vercel + app de Slack) · 2 juegos de botones + IA ·
3 puntos, rachas, recap · 4 trivia y puzzle por modal · 5 onboarding · 6 veto, pausa, DM al admin, Salud · 7 stats y runbook.

# TODOS

## Motor de juegos

### Anuario trimestral y página pública del equipo

**What:** Al cierre de cada trimestre, un post en el canal con los hechos que más engañaron, la racha más larga y la trivia que nadie sacó, más una página por equipo (solo hechos ya revelados) que sirva de memoria compartida.

**Why:** Convierte los juegos en memoria del equipo y es la prueba de valor para quien paga (hoy el comprador no tiene forma de demostrar que funciona). Es el "chequeo 10x" de la revisión CEO del 2026-09-15.

**Context:** Usa las mismas tablas (`games`, `answers`, `facts`); cero IA. Empezar por la consulta SQL del recap semanal ("momento de la semana") extendida a 13 semanas. Decidir qué es público antes de construir la página (privacidad: solo hechos revelados de miembros activos; nunca participación individual). No tiene sentido antes de un trimestre de reveals.

**Effort:** M (humano) → S con Claude Code
**Priority:** P3
**Depends on:** hito 3 (recap semanal) y un trimestre de datos

### Semana suave (rotación reducida los primeros 7 días)

**What:** Durante la primera semana de cada equipo, la rotación del fill usa solo adivina-quién y esto-o-aquello; trivia, dos verdades y puzzle entran desde la segunda semana.

**Why:** Protege la única primera impresión con el equipo, el riesgo más repetido en el diagnóstico. Una trivia floja en la semana 1 gasta la primera impresión igual que un buen juego la gana.

**Context:** Regla de ~5 líneas en el fill, activada por `teams.created_at` (menos de 7 días). Contradice ligeramente la apuesta "los cinco juegos desde el inicio", por eso se decide con datos de la semana 1 real: si el equipo contesta todo, sobra. Cero UI.

**Effort:** S
**Priority:** P3
**Depends on:** hito 2 (rotación con varias plantillas)

## Completed

_(vacío)_

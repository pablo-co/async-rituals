# DESIGN.md — tema base "calida" (Cálida / personal)

> Punto de partida generado por raicode. No es identidad final: si el usuario
> corre su branding, este archivo se reemplaza completo.

## Dirección estética
cálido · personal · acogedor · hecho a mano. Tu app arrancó con el tema Cálido: tonos de barro y papel, tipografía suave, se siente como una libreta hecha a mano. Cámbialo cuando quieras.
Densidad media, mucho aire, jerarquía por tamaño y peso — no por color.

## Color (CSS custom properties, ver theme-tokens.css)
Un solo acento protagonista + neutros + semánticos. Nunca inventar colores nuevos.

| rol | claro | oscuro |
| --- | --- | --- |
| bg | `#FDF8F3` | `#1C1614` |
| surface | `#FFFFFF` | `#251E1B` |
| border | `#EADDD1` | `#3A302C` |
| text | `#3B2E28` | `#F2E9E2` |
| text-muted | `#7A675C` | `#B4A29A` |
| accent / hover / on | `#B4552F` / `#99441F` / `#FFF8F3` | `#E7906A` / `#F2A783` / `#2A1509` |
| success / bg | `#2F7A5A` / `#E6F2EC` | `#6FCFA3` / `#17332A` |
| warning / bg | `#9A6B12` / `#FBF0DC` | `#E0B457` / `#33290F` |
| error / bg | `#B03A2B` / `#FBE9E5` | `#F08876` / `#3A1B16` |

Todos los pares texto/fondo cumplen WCAG AA (>=4.5:1 en texto normal).
Usar `--c-*` vía las utilidades (`bg-app`, `text-muted`, `btn-primary`…), no hex sueltos.

## Tipografía (next/font/google)
- Display: **Lora** 600 — títulos, nombre de app, números grandes.
- Body: **Nunito Sans** 400/600 — todo lo demás.
- Escala: 12 / 13.5 / 15 / 19 / 27 / 38 px. Line-height 1.15 en títulos, 1.55 en texto.

```ts
import { Lora, Nunito_Sans } from "next/font/google";
```

## Spacing, radii, sombras, motion
- Spacing: escala 4px (1=4 … 20=80). Padding de card 22-24px, gap de secciones 20-24px.
- Radii: sm 6 / md 10 / lg 16 / full 999.
- Sombras: solo `--shadow-1` (bordes sutiles) y `--shadow-2` (cards elevadas).
- Motion: 200ms `cubic-bezier(.2,0,.2,1)` en color/border/opacity/shadow. Nada decorativo.

## Componentes base (mismos en las 4 variantes)
- **Estado vacío**: título, una línea de ayuda, CTA primario. Ninguna lista vacía queda en blanco.
- **Loading**: skeleton en `--c-border` con pulse 1.2s (stagger 150ms) para contenido; spinner de 16px solo dentro del botón que disparó la acción. Nunca spinner de pantalla completa.
- **Botones**: primary / secondary / tertiary / danger, cada uno con hover, focus-visible (`outline: 2px solid var(--c-accent); outline-offset: 2px`), disabled y loading.
- **Forms**: input, select, textarea, checkbox, radio, toggle. Label arriba siempre visible; ayuda o error debajo en 12px. El error pinta el borde con `--c-error` y el mensaje dice qué hacer. Toque mínimo 44px en móvil.
- **Contenido largo** (`prose`): máx. 68ch, line-height 1.65, títulos en display, links con borde inferior. No centrar ni justificar.

## Gráficas
Serie principal `--c-series-1`; 2-4 son tonos de la misma familia. Máximo 4 series.

| serie | claro | oscuro |
| --- | --- | --- |
| 1 | `#B4552F` | `#E7906A` |
| 2 | `#D98452` | `#C4714C` |
| 3 | `#E6B389` | `#F4C0A4` |
| 4 | `#7A4A33` | `#A2593B` |

Permitido: barras, líneas, área simple, dona de máximo 4 rebanadas. Grid solo horizontal en `--c-border`.
Prohibido: 3D, arcoíris, doble eje Y, gradientes en las series.

## Anti-patterns
- Nunca gradientes morado→azul genéricos de AI.
- Nada de neón ni saturaciones altas: el acento es barro, no naranja fluorescente.
- No usar sombras duras ni bordes negros puros (#000) — el negro es café oscuro.
- Sin emoji decorativo en la UI ni corazones de relleno.
- No agregar una segunda familia tipográfica ni un segundo acento.
- No usar sombras de color ni bordes de 2px+.

## Componentes v1.1 (mismos en las 4 variantes)

- **Badge**: 5 tonos (neutral, success, warning, error, info). Pill de `padding: 4px 10px`, `--text-xs`, weight 600. Neutral va en outline (`--c-bg` + borde); los demás en tinte relleno sin borde. Punto opcional de 6px en `currentColor`. Conteos en `badge-count` (20px, fondo accent, `tabular-nums`). El texto dice el estado — el color nunca solo.
- **Tabs**: activo en `--c-accent` con `box-shadow: inset 0 -2px 0`; inactivo en muted; hover suma `--c-bg`; focus `outline: 2px solid var(--c-accent); outline-offset: -2px`; disabled en `--c-border`. Si no caben, **scroll horizontal** — nunca dos filas. Máximo 5. Tabs con subrayado; el segmentado solo si son dos vistas del mismo dato.
- **Bottom-nav** (solo móvil): 3-5 destinos, `56px + env(safe-area-inset-bottom)`, ícono 22px + etiqueta 10.5px/600. Activo con `aria-current="page"` en accent. El contenido reserva `calc(56px + safe-area + var(--space-4))`.
- **Modal / sheet**: escritorio centrado `max-width: 380px`; móvil sheet desde abajo con handle de 36×4px. Destructivo: título que nombra la cosa, cuerpo que dice qué se pierde, botón "Sí, borrar" en `--c-error`, **foco inicial en Cancelar**, Esc y clic afuera cancelan. En móvil los botones se apilan con el peligroso arriba.
- **Toast**: abajo-derecha en escritorio, arriba en móvil. 4s (7s con acción). Máximo 3. `border-left: 3px` del tono. Para confirmar lo hecho — un error que exige decisión va inline o en modal.
- **Avatar**: 24/32/40/56px, iniciales en display sobre `--c-avatar-1..4`, índice = `suma de charCodes % 4` (determinista). Texto siempre `--c-text`.
- **Imagen**: `aspect-ratio` fijo desde el primer render, `object-fit: cover`. Tres estados: cargando (pulse), sin foto (dashed + `image`), error (`--c-error-bg` + `image-off`).
- **list-row**: min-height 56px, título truncado a una línea, meta en muted, badge a la derecha. Es la unidad que más se repite.

## Móvil (el usuario final entra por el teléfono)

Un solo breakpoint: **768px**. Abajo de eso, una columna.

- La escala de texto **no cambia**; solo h1 38→30px y título de card 27→24px.
- **Inputs a 16px**: menos dispara el zoom automático de iOS.
- Padding de página 16px (24px en escritorio); padding de card 16px.
- Botones a ancho completo, apilados, primario arriba, alto ≥48px.
- **Las tablas se vuelven `list-row`.** Nunca scroll horizontal.
- Header sticky de 56px: volver a la izquierda, una sola acción a la derecha.
- Ancho máximo de contenido en escritorio: `--page-max: 1120px`.

## Iconografía

**Lucide**, una sola librería, `stroke-width: 1.75`. 18px en botón con texto, 20px suelto, 22px en nav; caja de toque siempre 44px. Alineación con `flex` + `gap: 7px`.

Funcional (permitido): el ícono **es** el control o etiqueta uno — borrar, editar, volver, cerrar, buscar, un destino del nav, el tono de un estado.
Decorativo (prohibido): acompaña un título o rellena espacio. **Prueba**: si al borrarlo no cambia lo que el usuario puede hacer o entender, bórralo.

Ícono solo → `aria-label`. Ícono junto a texto → `aria-hidden="true"`.

## Tokens nuevos de esta variante

Azul polvoso: el único color que no sale del acento, porque un "info" en barro se leería como aviso.

| rol | claro | oscuro |
| --- | --- | --- |
| `--c-info` | `#2F6E96` | `#8FC4E4` |
| `--c-info-bg` | `#E6EEF2` | `#2E3235` |
| `--c-on-info-bg` | `#2F6E96` | `#8FC4E4` |
| `--c-overlay` | `rgba(12,10,8,0.45)` | `rgba(0,0,0,0.7)` |
| `--c-avatar-1` | `#F2E0DA` | `#634234` |
| `--c-avatar-2` | `#F8E9E0` | `#58392B` |
| `--c-avatar-3` | `#FBF1EA` | `#675247` |
| `--c-avatar-4` | `#E7DEDA` | `#4D3125` |

Todos medidos: el par de texto más bajo de v1.1 es 4.52:1.

## Componentes v1.2 (este proyecto: async-rituals)

Agregados en la revisión de diseño del plan (2026-09-15). Sin tokens nuevos: usan `--c-*`, la escala de spacing y los radii existentes.

- **Alerta en línea** (`alert-success` / `alert-warning` / `alert-error` / `alert-info`; las tres primeras ya existen en `theme-tokens.css`, `alert-info` se agrega en `globals.css` con `--c-info-bg` / `--c-on-info-bg`): bloque de `padding: 12px 14px`, `radius md`, fondo del tono semántico y texto en su `--c-on-*-bg`, `--text-sm`. **Sin `border-left`** (anti-pattern de IA). Va arriba de la sección a la que aplica, nunca flotando. El texto dice qué pasó y qué hacer ("No pude guardar. Revisa que el bot siga en el canal."). Para confirmar lo hecho se usa `toast`; la alerta es para lo que necesita atención o decisión. Un ícono funcional de 18 px solo si etiqueta el tono (`circle-alert`, `check`), con `aria-hidden`.
- **Fila expandible** (`list-row-details`): un `<details>` nativo cuyo `<summary>` es un `list-row` (min-height 56 px, título + meta + badge a la derecha) con chevron `chevron-down` de 20 px que rota 180° al abrir (200 ms, el único motion). Abierto por default solo cuando el estado es error; cerrado en verde. El contenido expandido son `list-row` anidadas en `--c-text-muted`. Teclado: Enter/Espacio en el summary; `aria-expanded` lo pone el navegador.

Utilidades en `app/globals.css` para estos dos patrones y dos ajustes de este proyecto:
- `alert-inline` (padding, gap, tamaño de texto) + `alert-success` / `alert-warning` / `alert-error` / `alert-info` (tono).
- `list-row-details` para el `<details>`; dentro, `summary.list-row`, `.list-row-chevron` y `.list-row-body`.
- `page-narrow`: columna de 640 px en escritorio (D-6A), en lugar de `--page-max`.
- `.tab[aria-current="page"]`: mismo estilo que `aria-selected` cuando las tabs son enlaces de navegación.

## Anti-patterns v1.1

- Nunca menú hamburguesa. Con 2-5 secciones va bottom-nav; con más, cuatro y "Más".
- Nunca scroll horizontal en una tabla en móvil.
- Nunca un toast para un error que necesita decisión del usuario.
- Nunca borrar sin confirmar, y nunca con el foco puesto en el botón peligroso.
- Nunca dos librerías de iconos en la misma app.
- Nunca un ícono decorativo junto a un título.

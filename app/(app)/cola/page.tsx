import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/Alert";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { ListRow } from "@/components/ListRow";
import { QueuePoller } from "@/components/QueuePoller";
import sampleContent from "@/lib/ai/sample-content.json";
import { getAdminTeam, getQueue } from "@/lib/db/queries";
import { hasAnthropicKey } from "@/lib/env";
import { formatSlotDate } from "@/lib/format";
import { GAME_LABELS, type GameType } from "@/lib/games/types";
import { QUEUE_TARGET } from "@/lib/queue/fill";
import { strings } from "@/lib/slack/strings";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TIMEZONE, localParts, nextSlotDates } from "@/lib/time";

export const metadata: Metadata = { title: "Cola" };
export const dynamic = "force-dynamic";

const HIDDEN_TYPES: ReadonlySet<GameType> = new Set(["guess_who", "two_truths"]);

type Params = { generating?: string; saved?: string; next?: string };

/** Row title: the question, or the template name when the content stays hidden until the reveal. */
function rowTitle(type: GameType, preview: string | null): string {
  if (HIDDEN_TYPES.has(type)) return GAME_LABELS[type];
  return preview ?? GAME_LABELS[type];
}

function rowMeta(slotDate: string, type: GameType): string {
  const day = formatSlotDate(slotDate);
  if (type === "guess_who") return `${day} · hecho oculto hasta el reveal`;
  if (type === "two_truths") return `${day} · frases ocultas hasta el reveal`;
  return `${day} · ${GAME_LABELS[type]}`;
}

export default async function ColaPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const team = await getAdminTeam(supabase);
  const anthropic = hasAnthropicKey();

  if (!team?.channel_id) {
    const samples = sampleContent.games as { type: GameType; preview: string | null }[];
    const slots = nextSlotDates({
      from: new Date(),
      tz: DEFAULT_TIMEZONE,
      cadence: 3,
      count: samples.length,
    });
    return (
      <>
        <h1 className="font-display text-(length:--text-xl)">Cola</h1>
        <EmptyState
          title="Conecta un canal primero"
          help="La cola se llena sola en cuanto Rituales tenga un canal donde publicar."
          action={
            <Link className="btn-primary inline-flex items-center min-h-11" href="/conectar">
              Ir a Conectar
            </Link>
          }
        />
        <section className="flex flex-col gap-3" aria-labelledby="sample-heading">
          <h2 id="sample-heading" className="font-display text-(length:--text-lg)">
            Así se verá tu cola
          </h2>
          <p className="text-muted text-(length:--text-sm)">
            Contenido de muestra con el ritmo de 3 juegos por semana. Nunca se publica en tu canal.
          </p>
          <ul className="flex flex-col gap-2 list-none p-0 m-0">
            {samples.map((game, index) => (
              <li key={`${game.type}-${index}`}>
                <ListRow
                  title={rowTitle(game.type, game.preview)}
                  meta={rowMeta(slots[index], game.type)}
                  right={<Badge tone="info">muestra</Badge>}
                />
              </li>
            ))}
          </ul>
        </section>
      </>
    );
  }

  const today = localParts(new Date(), team.timezone).date;
  const games = await getQueue(supabase, team.id, today);
  const pending = games.filter((g) => g.status !== "vetoed").length;
  const generating = params.generating === "1" && pending < QUEUE_TARGET;

  return (
    <>
      <h1 className="font-display text-(length:--text-xl)">Cola</h1>
      <QueuePoller active={generating} />
      {params.saved === "1" ? (
        <Alert tone="success">Guardado. El próximo juego sale el {params.next ?? "próximo día del ritmo"} por la mañana.</Alert>
      ) : null}
      {!anthropic ? <Alert tone="warning">{strings.sampleWarning}</Alert> : null}
      {generating ? (
        <Alert tone="info">Generando los juegos de las próximas semanas… esta lista se actualiza sola.</Alert>
      ) : null}
      {games.length === 0 ? (
        generating ? null : (
          <EmptyState
            title="Sin juegos en cola"
            help="Se genera una semana al guardar el canal en Conectar."
          />
        )
      ) : (
        <ul className="flex flex-col gap-2 list-none p-0 m-0">
          {games.map((game) => {
            const paused = team.paused_until !== null && game.slot_date <= team.paused_until;
            return (
              <li key={game.id}>
                <ListRow
                  title={rowTitle(game.type, game.preview)}
                  meta={rowMeta(game.slot_date, game.type)}
                  right={
                    game.status === "vetoed" ? (
                      <Badge>por rellenar</Badge>
                    ) : game.is_sample ? (
                      <Badge tone="info">muestra · no se publica</Badge>
                    ) : paused ? (
                      <Badge tone="warning">en pausa</Badge>
                    ) : null
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

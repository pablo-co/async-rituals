import type { Metadata } from "next";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { ListRow } from "@/components/ListRow";
import { getActivity, getAdminTeam } from "@/lib/db/queries";
import { eventLabel } from "@/lib/events/labels";
import { formatLongDate, formatSlotDate, relativeTime } from "@/lib/format";
import { GAME_LABELS } from "@/lib/games/types";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Actividad" };
export const dynamic = "force-dynamic";

const HEALTH_RED_AFTER_MS = 26 * 60 * 60 * 1000;

export default async function ActividadPage() {
  const supabase = await createClient();
  const team = await getAdminTeam(supabase);

  if (!team?.channel_id) {
    return (
      <>
        <h1 className="font-display text-(length:--text-xl)">Actividad</h1>
        <EmptyState
          title="Aún no hay juegos publicados"
          help="Conecta un canal y el primero sale solo."
          action={
            <Link className="btn-secondary inline-flex items-center min-h-11" href="/conectar">
              Ir a Conectar
            </Link>
          }
        />
      </>
    );
  }

  const activity = await getActivity(supabase, team.id);
  const now = new Date();
  const lastTick = activity.last_tick_at ? new Date(activity.last_tick_at) : null;
  const healthy = lastTick !== null && now.getTime() - lastTick.getTime() < HEALTH_RED_AFTER_MS;
  const phrase =
    activity.played_this_week === 0
      ? "Nadie ha jugado esta semana todavía"
      : `${activity.played_this_week} de ${activity.members} jugaron esta semana`;

  return (
    <>
      <h1 className="font-display text-(length:--text-xl)">Actividad</h1>

      {activity.games_published === 0 ? (
        <EmptyState
          title="Aún no hay juegos publicados"
          help={
            activity.next_slot_date
              ? `El primero sale el ${formatLongDate(activity.next_slot_date)}.`
              : "El primero sale cuando la cola tenga juegos."
          }
        />
      ) : (
        <div className="flex flex-col gap-1">
          <p className="font-display text-(length:--text-2xl) leading-tight">{phrase}</p>
          <p className="text-muted text-(length:--text-sm)">
            {activity.games_published} juegos publicados · {activity.onboarded} de{" "}
            {activity.members} con onboarding
          </p>
        </div>
      )}

      <section className="flex flex-col gap-2" aria-labelledby="health-heading">
        <h2 id="health-heading" className="font-display text-(length:--text-lg)">
          Salud
        </h2>
        {healthy ? (
          <ListRow
            title="Bot al día"
            meta={`Última corrida ${relativeTime(lastTick!.toISOString(), now)}`}
            right={<Badge tone="success">al día</Badge>}
          />
        ) : (
          <details className="list-row-details" open>
            <summary className="list-row">
              <div className="list-row-main">
                <span className="list-row-title">Sin señal del bot</span>
                <span className="list-row-meta">
                  {lastTick
                    ? `Última corrida ${relativeTime(lastTick.toISOString(), now)}`
                    : "El bot todavía no ha corrido"}
                </span>
              </div>
              <Badge tone="error">
                {lastTick ? `sin señal desde ${relativeTime(lastTick.toISOString(), now)}` : "sin señal"}
              </Badge>
              <ChevronDown className="list-row-chevron" size={20} strokeWidth={1.75} aria-hidden="true" />
            </summary>
            <div className="list-row-body">
              {activity.recent_events.length === 0 ? (
                <p>Todavía no hay eventos registrados.</p>
              ) : (
                activity.recent_events.map((event) => (
                  <p key={event.id}>
                    {eventLabel(event.kind, event.detail)} · {relativeTime(event.created_at, now)}
                  </p>
                ))
              )}
              <p>Si sigue así mañana, avísale a quien administra la app.</p>
            </div>
          </details>
        )}
      </section>

      {activity.recent_games.length > 0 ? (
        <section className="flex flex-col gap-2" aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="font-display text-(length:--text-lg)">
            Últimos juegos
          </h2>
          <ul className="flex flex-col gap-2 list-none p-0 m-0">
            {activity.recent_games.map((game) => (
              <li key={game.id}>
                <ListRow
                  title={GAME_LABELS[game.type]}
                  meta={
                    game.status === "skipped"
                      ? `${formatSlotDate(game.slot_date)} · saltado`
                      : `${formatSlotDate(game.slot_date)} · ${game.answers} respuestas · ${game.correct} acertaron`
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

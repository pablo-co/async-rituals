import type { Metadata } from "next";
import { Alert } from "@/components/Alert";
import { Badge } from "@/components/Badge";
import { SubmitButton } from "@/components/SubmitButton";
import { requireAdmin } from "@/lib/db/session";
import { hasSlackConfig } from "@/lib/env";
import { getSlackClient } from "@/lib/slack/client";
import { listPublicChannels, type ChannelOption } from "@/lib/slack/members";
import { createAdminClient } from "@/lib/supabase/admin";
import { CADENCE_DAYS, cadenceLabel, type Cadence } from "@/lib/time";
import { publishFirstNowAction, saveChannelAction, signOutAction } from "./actions";

export const metadata: Metadata = { title: "Conectar" };
export const dynamic = "force-dynamic";

type Params = {
  connected?: string;
  reconnected?: string;
  saved?: string;
  next?: string;
  warning?: string;
  published?: string;
  error?: string;
  detail?: string;
};

const ERRORS: Record<string, string> = {
  already_connected: "Este workspace ya está conectado por otra cuenta. Pídele a esa persona que te dé acceso.",
  already_has_team: "Tu cuenta ya administra otro workspace. En esta versión es uno por cuenta.",
  not_configured: "Falta configurar la app de Slack en el servidor (llaves SLACK_*).",
  state: "La conexión caducó o no coincide con tu sesión. Vuelve a dar clic en Agregar a Slack.",
  form: "Elige un canal y un ritmo.",
  join: "No pude guardar. Revisa que el bot pueda entrar a ese canal e inténtalo de nuevo.",
  not_connected: "Conecta Slack primero.",
  nothing_to_publish: "No hay juegos en cola todavía. Guarda el canal para generar la primera semana.",
  publish: "No pude publicar. Revisa que Rituales siga en el canal y que haya hechos cargados.",
};

export default async function ConectarPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { team } = await requireAdmin();
  const slackReady = hasSlackConfig();
  const connected = Boolean(team && !team.disconnected_at);

  let channels: ChannelOption[] = [];
  let channelsError = false;
  let hasPosted = false;
  let hasQueued = false;
  let activeMembers = 0;
  if (team && connected) {
    const db = createAdminClient();
    try {
      channels = await listPublicChannels(await getSlackClient(db, team.id));
    } catch {
      channelsError = true;
    }
    if (team.channel_id) {
      const [{ count: posted }, { count: queued }, { count: members }] = await Promise.all([
        db.from("games").select("id", { count: "exact", head: true }).eq("team_id", team.id).in("status", ["posted", "revealing", "revealed"]),
        db.from("games").select("id", { count: "exact", head: true }).eq("team_id", team.id).eq("status", "queued").eq("is_sample", false),
        db.from("members").select("id", { count: "exact", head: true }).eq("team_id", team.id).is("left_at", null).eq("opted_out", false),
      ]);
      hasPosted = (posted ?? 0) > 0;
      hasQueued = (queued ?? 0) > 0;
      activeMembers = members ?? 0;
    }
  }

  const errorText = params.error ? (ERRORS[params.error] ?? "No se pudo conectar con Slack. Inténtalo de nuevo.") : null;

  return (
    <>
      <h1 className="font-display text-(length:--text-xl)">Conectar</h1>

      {params.connected === "1" ? <Alert tone="success">Slack conectado. Ahora elige el canal.</Alert> : null}
      {params.reconnected === "1" ? <Alert tone="success">Slack reconectado.</Alert> : null}
      {params.saved === "1" ? (
        <Alert tone="success">Guardado. El próximo juego sale el {params.next ?? "próximo día del ritmo"} por la mañana.</Alert>
      ) : null}
      {params.published === "1" ? <Alert tone="success">Publicado en #{team?.channel_name ?? "el canal"}.</Alert> : null}
      {params.warning === "welcome" ? (
        <Alert tone="warning">No pude saludar al canal; revisa que el bot esté dentro y vuelve a guardar.</Alert>
      ) : null}
      {params.warning === "sync" ? (
        <Alert tone="warning">Guardé el canal, pero no pude leer a los miembros. Vuelve a guardar en un momento.</Alert>
      ) : null}
      {errorText ? <Alert tone="error">{errorText}</Alert> : null}
      {team?.channel_error_at && !params.error ? (
        <Alert tone="error">No puedo publicar en el canal; revisa que el bot siga dentro y vuelve a guardar.</Alert>
      ) : null}
      {connected && team?.channel_id && activeMembers < 2 ? (
        <Alert tone="warning">
          Rituales solo ve a {activeMembers === 1 ? "una persona" : "nadie"} en #{team.channel_name}. Los juegos necesitan al
          menos dos: invita a tu equipo al canal desde Slack. Si ya están dentro, vuelve a guardar el canal.
        </Alert>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="slack-heading">
        <h2 id="slack-heading" className="font-display text-(length:--text-lg)">Slack</h2>
        {connected ? (
          <div className="flex items-center gap-2">
            <Badge tone="success">Slack conectado</Badge>
            {team?.slack_team_name ? <span className="text-muted text-(length:--text-sm)">{team.slack_team_name}</span> : null}
          </div>
        ) : (
          <>
            {team?.disconnected_at ? <Alert tone="error">Slack desconectado: vuelve a conectar.</Alert> : null}
            <div>
              <Badge>Sin conectar</Badge>
            </div>
            <p className="text-muted text-(length:--text-sm)">
              Slack te pedirá permiso para que Rituales publique en un canal y mande mensajes privados. Elige el
              workspace de tu equipo.
            </p>
            {slackReady ? (
              <a className="btn-primary inline-flex items-center justify-center min-h-12 w-full md:w-auto md:self-start" href="/api/slack/install">
                Agregar a Slack
              </a>
            ) : (
              <>
                <button type="button" className="btn-primary min-h-12 w-full md:w-auto md:self-start" disabled aria-disabled="true">
                  Agregar a Slack
                </button>
                <p className="help-text">Se activa cuando la app de Slack esté registrada (llaves SLACK_* en el servidor).</p>
              </>
            )}
          </>
        )}
      </section>

      {connected && team ? (
        <section className="flex flex-col gap-3" aria-labelledby="channel-heading">
          <h2 id="channel-heading" className="font-display text-(length:--text-lg)">Canal y ritmo</h2>
          {channelsError ? (
            <Alert tone="error">No pude leer tus canales. Reintenta.</Alert>
          ) : channels.length === 0 ? (
            <Alert tone="warning">No encontré canales públicos. Crea uno en Slack y vuelve.</Alert>
          ) : null}
          <form action={saveChannelAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="channel_id" className="label-default">Canal público</label>
              <select id="channel_id" name="channel_id" className="input-default w-full" defaultValue={team.channel_id ?? ""} required>
                <option value="" disabled>Elige un canal</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>#{c.name}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="cadence" className="label-default">Juegos por semana</label>
              <select id="cadence" name="cadence" className="input-default w-full" defaultValue={String(team.cadence_per_week)}>
                {([1, 2, 3, 4, 5] as Cadence[]).map((c) => (
                  <option key={c} value={c}>{c} · {cadenceLabel(c)}</option>
                ))}
              </select>
              <p className="help-text">Los juegos ya programados conservan su fecha. Nunca en fin de semana ({CADENCE_DAYS[5].length} días hábiles).</p>
            </div>
            <SubmitButton pendingLabel="Guardando…" disabled={channels.length === 0}>Guardar</SubmitButton>
          </form>
        </section>
      ) : null}

      {connected && team?.channel_id && !hasPosted && hasQueued && activeMembers >= 2 ? (
        <section className="flex flex-col gap-3" aria-labelledby="first-heading">
          <h2 id="first-heading" className="font-display text-(length:--text-lg)">Primer juego</h2>
          <p className="text-muted text-(length:--text-sm)">
            No esperes al horario: publica hoy el primero de la cola en #{team.channel_name}. Se revela en el próximo turno de la tarde.
          </p>
          <form action={publishFirstNowAction}>
            <SubmitButton className="btn-secondary" pendingLabel="Publicando…">Publicar el primero ahora</SubmitButton>
          </form>
        </section>
      ) : null}

      <form action={signOutAction} className="mt-6">
        <button type="submit" className="btn-tertiary min-h-11">Cerrar sesión</button>
      </form>
    </>
  );
}

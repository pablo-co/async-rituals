import type { Metadata } from "next";
import { Alert } from "@/components/Alert";
import { Badge } from "@/components/Badge";
import { getAdminTeam } from "@/lib/db/queries";
import { hasSlackConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "./actions";

export const metadata: Metadata = { title: "Conectar" };
export const dynamic = "force-dynamic";

export default async function ConectarPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const team = await getAdminTeam(supabase);
  const slackReady = hasSlackConfig();
  const connected = Boolean(team && !team.disconnected_at);

  return (
    <>
      <h1 className="font-display text-(length:--text-xl)">Conectar</h1>

      {params.connected === "1" ? (
        <Alert tone="success">Slack conectado. Ahora elige el canal.</Alert>
      ) : null}
      {params.error === "already_connected" ? (
        <Alert tone="error">
          Este workspace ya está conectado por otra cuenta. Pídele a esa persona que te dé acceso.
        </Alert>
      ) : params.error ? (
        <Alert tone="error">No se pudo conectar con Slack. Inténtalo de nuevo.</Alert>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="slack-heading">
        <h2 id="slack-heading" className="font-display text-(length:--text-lg)">
          Slack
        </h2>
        {connected ? (
          <div className="flex items-center gap-2">
            <Badge tone="success">Slack conectado</Badge>
            {team?.slack_team_name ? (
              <span className="text-muted text-(length:--text-sm)">{team.slack_team_name}</span>
            ) : null}
          </div>
        ) : (
          <>
            {team?.disconnected_at ? (
              <Alert tone="error">Slack desconectado: vuelve a conectar.</Alert>
            ) : null}
            <div>
              <Badge>Sin conectar</Badge>
            </div>
            <p className="text-muted text-(length:--text-sm)">
              Slack te pedirá permiso para que Rituales publique en un canal y mande mensajes
              privados. Elige el workspace de tu equipo.
            </p>
            {slackReady ? (
              <a
                className="btn-primary inline-flex items-center justify-center min-h-12 w-full md:w-auto md:self-start"
                href="/api/slack/install"
              >
                Agregar a Slack
              </a>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-primary min-h-12 w-full md:w-auto md:self-start"
                  disabled
                  aria-disabled="true"
                >
                  Agregar a Slack
                </button>
                <p className="help-text">
                  Se activa en el siguiente hito, cuando la app esté publicada y registrada en
                  Slack.
                </p>
              </>
            )}
          </>
        )}
      </section>

      <form action={signOutAction} className="mt-6">
        <button type="submit" className="btn-tertiary min-h-11">
          Cerrar sesión
        </button>
      </form>
    </>
  );
}

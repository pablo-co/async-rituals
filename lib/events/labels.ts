import { GAME_LABELS, type GameType, type SkipReason } from "@/lib/games/types";

/** Every events.kind has a Spanish label (D-2C). Detail keys are the ones the writers put in `detail`. */
export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  out_of_window: "fuera de horario",
  paused: "en pausa",
  no_answers: "sin respuestas",
  featured_inactive: "el protagonista ya no participa",
  template_error: "error de la plantilla",
  channel_error: "no pude publicar en el canal",
  sample: "contenido de muestra",
  post_uncertain: "no sé si llegó al canal",
};

type Detail = Record<string, unknown>;

function template(detail: Detail): string {
  const type = detail.type as GameType | undefined;
  return type && GAME_LABELS[type] ? GAME_LABELS[type] : "un juego";
}

export const EVENT_KINDS = [
  "tick_run",
  "fill_run",
  "posted",
  "revealed",
  "recap_posted",
  "skipped",
  "generation_failed",
  "channel_error",
  "disconnected",
  "reconnected",
  "admin_alert",
  "welcome",
  "paused",
  "resumed",
  "team_error",
  "connected",
  "post_failed",
  "reveal_failed",
  "handler_error",
  "oauth_failed",
  "resync_failed",
  "member_joined",
  "member_left",
  "member_rejoined",
  "member_opted_out",
  "answer_failed",
  "welcome_failed",
  "sync_failed",
  "save_channel_failed",
  "tick_failed",
  "fill_failed",
  "modal_failed",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export function eventLabel(kind: string, detail: Detail = {}): string {
  switch (kind as EventKind) {
    case "tick_run":
      return "El bot revisó la cola";
    case "fill_run":
      return `Generó ${Number(detail.count ?? 0)} juegos`;
    case "posted":
      return `Publicó ${template(detail)}`;
    case "revealed":
      return `Reveló ${template(detail)}`;
    case "recap_posted":
      return "Publicó el recap de la semana";
    case "skipped": {
      const reason = detail.reason as SkipReason | undefined;
      const why = reason ? SKIP_REASON_LABELS[reason] : "sin motivo";
      return `Saltó ${template(detail)}: ${why}`;
    }
    case "generation_failed":
      return `No pudo generar ${template(detail)}`;
    case "channel_error":
      return "No pude publicar en el canal";
    case "disconnected":
      return "Slack se desconectó";
    case "reconnected":
      return "Slack reconectado";
    case "admin_alert":
      return "Te avisé por mensaje privado";
    case "welcome":
      return "Saludé al canal";
    case "paused":
      return `Pausa hasta el ${String(detail.until ?? "")}`.trim();
    case "resumed":
      return "Ya volvimos";
    case "team_error":
      return "Un error detuvo la corrida de este equipo";
    case "connected":
      return "Slack conectado";
    case "post_failed":
      return `No pude publicar ${template(detail)}; lo reintento en el próximo turno`;
    case "reveal_failed":
      return `No pude revelar ${template(detail)}; lo reintento en el próximo turno`;
    case "handler_error":
      return "Un mensaje de Slack falló al procesarse";
    case "oauth_failed":
      return "La conexión con Slack no se completó";
    case "resync_failed":
      return "No pude volver a leer a los miembros del canal";
    case "member_joined":
      return "Alguien entró al canal";
    case "member_left":
      return "Alguien salió del canal";
    case "member_rejoined":
      return "Alguien volvió a entrar al ritual";
    case "member_opted_out":
      return "Alguien salió del ritual";
    case "answer_failed":
      return "No pude guardar una respuesta";
    case "welcome_failed":
      return "No pude saludar al canal";
    case "sync_failed":
      return "No pude leer a los miembros del canal";
    case "save_channel_failed":
      return "No pude guardar el canal";
    case "tick_failed":
      return "La corrida del bot falló";
    case "fill_failed":
      return "No pude generar juegos";
    case "modal_failed":
      return "No pude abrir un juego en Slack";
    default:
      return kind;
  }
}

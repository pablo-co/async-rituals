import { formatLongDate } from "@/lib/format";
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
  "ack_failed",
  "decoration_failed",
  "onboarding_invited",
  "onboarding_dm_failed",
  "onboarding_saved",
  "onboarding_failed",
  "fact_withdrawn",
  "fact_added",
  "fact_failed",
  "member_erased",
  "erase_failed",
  "vetoed",
  "admin_alert_failed",
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
    case "paused": {
      const until = String(detail.until ?? "");
      return /^\d{4}-\d{2}-\d{2}$/.test(until) ? `Pausa hasta el ${formatLongDate(until)}` : "Pausa";
    }
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
    case "ack_failed":
      return "No pude confirmar una respuesta en privado";
    case "decoration_failed":
      return "Una línea extra de un mensaje falló; el mensaje salió sin ella";
    case "onboarding_invited": {
      const n = Number(detail.count ?? 0);
      return n === 1 ? "Invité a 1 persona a contar de sí" : `Invité a ${n} personas a contar de sí`;
    }
    case "onboarding_dm_failed":
      return "No pude mandarle la invitación a una persona";
    case "onboarding_saved":
      return "Alguien contó de sí para los juegos";
    case "onboarding_failed":
      return "No pude guardar las respuestas de alguien";
    case "fact_withdrawn":
      return "Alguien cambió una respuesta: saqué de la cola el juego que la usaba";
    case "fact_added":
      return "Alguien agregó un hecho nuevo";
    case "fact_failed":
      return "No pude guardar un hecho nuevo";
    case "member_erased":
      return "Alguien borró sus datos";
    case "erase_failed":
      return "No pude borrar los datos de alguien";
    case "vetoed":
      return `Vetaste ${template(detail)}`;
    case "admin_alert_failed":
      return "No pude mandarte un mensaje privado en Slack";
    default:
      return kind;
  }
}

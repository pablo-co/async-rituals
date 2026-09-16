/** Human dates and times in Spanish. Dates are "YYYY-MM-DD" (a calendar day, no timezone shift). */
const SHORT_WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function parts(dateISO: string): [number, number, number] {
  const [y, m, d] = dateISO.split("-").map(Number);
  return [y, m, d];
}

/** "Mié 17" */
export function formatSlotDate(dateISO: string): string {
  const [y, m, d] = parts(dateISO);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${SHORT_WEEKDAYS[wd]} ${d}`;
}

/** "17 de septiembre" */
export function formatLongDate(dateISO: string): string {
  const [, m, d] = parts(dateISO);
  return `${d} de ${MONTHS[m - 1]}`;
}

/** "hace 3 h", "ayer", "hace 4 días" */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "ayer";
  return `hace ${days} días`;
}

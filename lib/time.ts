/**
 * Dates and windows per team timezone (E-1A). Everything here is pure; the tick injects `now`.
 * Dates travel as "YYYY-MM-DD" strings (the team's local calendar day).
 */
export type Cadence = 1 | 2 | 3 | 4 | 5;

export const DEFAULT_TIMEZONE = "America/Mexico_City";
export const POST_HOUR = 10;
export const REVEAL_HOUR = 18;

/** ISO weekdays (1 = Monday … 5 = Friday) for each games-per-week setting. Never weekends. */
export const CADENCE_DAYS: Record<Cadence, readonly number[]> = {
  1: [3],
  2: [2, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
};

const WEEKDAY_NAMES = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

export function joinEs(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** "lunes, miércoles y viernes" */
export function cadenceLabel(cadence: Cadence): string {
  return joinEs(CADENCE_DAYS[cadence].map((d) => WEEKDAY_NAMES[d]));
}

export interface LocalParts {
  date: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  isoWeekday: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    formatters.set(tz, f);
  }
  return f;
}

const pad = (n: number) => String(n).padStart(2, "0");
const ISO_WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock parts of an instant in a timezone. */
export function localParts(instant: Date, tz: string): LocalParts {
  const parts = formatterFor(tz).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  return {
    date: `${year}-${pad(month)}-${pad(day)}`,
    year,
    month,
    day,
    hour,
    minute,
    isoWeekday: ISO_WEEKDAY[get("weekday")] ?? 0,
  };
}

function offsetMs(instant: Date, tz: string): number {
  const p = localParts(instant, tz);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return wall - Math.floor(instant.getTime() / 60000) * 60000;
}

/** The instant at which a wall-clock time happens in a timezone. Handles DST by re-checking once. */
export function zonedTimeToUtc(dateISO: string, hour: number, minute: number, tz: string): Date {
  const [y, m, d] = dateISO.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, hour, minute);
  const first = offsetMs(new Date(wall), tz);
  let instant = wall - first;
  const second = offsetMs(new Date(instant), tz);
  if (second !== first) instant = wall - second;
  return new Date(instant);
}

export function addDays(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function isoWeekdayOf(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

/**
 * Upcoming slot dates for a team. Never today after POST_HOUR local, never weekends,
 * never on or before `pausedUntil` (inclusive pause).
 */
export function nextSlotDates(opts: {
  from: Date;
  tz: string;
  cadence: Cadence;
  count: number;
  pausedUntil?: string | null;
}): string[] {
  const { from, tz, cadence, count, pausedUntil } = opts;
  const now = localParts(from, tz);
  const days = CADENCE_DAYS[cadence];
  const out: string[] = [];
  let date = now.hour >= POST_HOUR ? addDays(now.date, 1) : now.date;
  for (let i = 0; i < 366 && out.length < count; i++) {
    const wd = isoWeekdayOf(date);
    if (days.includes(wd) && (!pausedUntil || date > pausedUntil)) out.push(date);
    date = addDays(date, 1);
  }
  return out;
}

/** When a slot posts (10:00 local) or a recap posts (18:00 local). */
export function slotScheduledFor(dateISO: string, tz: string, hour: number = POST_HOUR): Date {
  return zonedTimeToUtc(dateISO, hour, 0, tz);
}

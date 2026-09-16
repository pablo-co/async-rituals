import type { TeamRow } from "@/lib/db/types";
import { formatLongDate } from "@/lib/format";
import { strings } from "@/lib/slack/strings";
import { cadenceLabel, type Cadence } from "@/lib/time";

/** The channel greeting (plan CEO 1): what this is, that playing is optional, the days, how to opt out. */
export function welcomeText(team: Pick<TeamRow, "cadence_per_week" | "paused_until">): string {
  return strings.welcome(
    cadenceLabel(team.cadence_per_week as Cadence),
    team.paused_until ? formatLongDate(team.paused_until) : null,
  );
}

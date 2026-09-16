import type { WebClient } from "@slack/web-api";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnswerRow, GameRow, MemberRow, TeamRow } from "@/lib/db/types";
import { DbError, TemplateError } from "@/lib/errors";
import { logEvent } from "@/lib/events";
import { templateFor } from "@/lib/games/registry";
import type { SkipReason } from "@/lib/games/types";
import { fillTeam, futureQueue, QUEUE_LOW } from "@/lib/queue/fill";
import { count, finishRun, forEachTeam, startRun, type Run } from "@/lib/runs";
import { describeSlackError, mapSlackError } from "@/lib/slack/errors";

/**
 * games state machine, as the tick drives it (one team at a time, `now` injected):
 *
 *   queued ──sweep──▶ skipped(out_of_window | paused | sample | post_uncertain)
 *   queued ──claim 'post'──▶ posting ──postMessage ok──▶ posted ──claim 'reveal' (+4 h, ≥18:00)──▶ revealing ──▶ revealed
 *                              │ template error ──▶ skipped(template_error | featured_inactive)         │ 0 answers ──▶ skipped(no_answers)
 *                              │ channel error  ──▶ skipped(channel_error) + teams.channel_error_at      │ Slack down ──▶ stays revealing, retried
 *                              │ disconnected   ──▶ back to queued + teams.disconnected_at
 *                              └ Slack down     ──▶ stays posting; reclaimed by the next sweep (E-1B)
 *
 * Order per team: sweep → reveal → post → refill (if the queue is low) → last_tick_at.
 */
export interface TickDeps {
  db: SupabaseClient;
  now: Date;
  slackFor: (team: TeamRow) => Promise<WebClient>;
}

type TeamCounts = { swept: number; posted: number; revealed: number; skipped: number; deferred: number };

async function loadMembers(db: SupabaseClient, teamId: string): Promise<MemberRow[]> {
  const { data, error } = await db.from("members").select("*").eq("team_id", teamId);
  if (error) throw new DbError(error.message, error.code);
  return (data ?? []) as MemberRow[];
}

async function markSkipped(
  db: SupabaseClient,
  run: Run | undefined,
  game: GameRow,
  reason: SkipReason,
  detail: Record<string, unknown> = {},
) {
  const { error } = await db
    .from("games")
    .update({ status: "skipped", skip_reason: reason })
    .eq("id", game.id);
  if (error) throw new DbError(error.message, error.code);
  await logEvent(db, {
    teamId: game.team_id,
    runId: run?.id,
    kind: "skipped",
    gameId: game.id,
    detail: { type: game.type, reason, ...detail },
  });
}

async function claim(db: SupabaseClient, team: TeamRow, kind: "post" | "reveal", now: Date): Promise<GameRow[]> {
  const { data, error } = await db.rpc("claim_due_games", {
    p_team_id: team.id,
    p_kind: kind,
    p_now: now.toISOString(),
  });
  if (error) throw new DbError(error.message, error.code);
  return (data ?? []) as GameRow[];
}

export async function sweepPhase(deps: TickDeps, run: Run | undefined, team: TeamRow): Promise<GameRow[]> {
  const { data, error } = await deps.db.rpc("sweep_games", { p_team_id: team.id, p_now: deps.now.toISOString() });
  if (error) throw new DbError(error.message, error.code);
  const swept = (data ?? []) as GameRow[];
  for (const game of swept) {
    await logEvent(deps.db, {
      teamId: team.id,
      runId: run?.id,
      kind: "skipped",
      gameId: game.id,
      detail: { type: game.type, reason: game.skip_reason },
    });
  }
  return swept;
}

/** posting → posted. Returns what happened so callers can count and the web can show it. */
export async function postGame(
  deps: TickDeps,
  run: Run | undefined,
  team: TeamRow,
  game: GameRow,
): Promise<"posted" | "skipped" | "deferred"> {
  const { db, now } = deps;
  const nowIso = now.toISOString();

  if (!team.channel_id || team.welcomed_channel_id !== team.channel_id) {
    await markSkipped(db, run, game, "channel_error", { why: "channel_not_welcomed" });
    await db.from("teams").update({ channel_error_at: team.channel_error_at ?? nowIso }).eq("id", team.id);
    return "skipped";
  }

  const members = await loadMembers(db, team.id);
  const template = templateFor(game.type);
  let rendered;
  try {
    rendered = await template.render({ db, team, now }, game, members);
  } catch (error) {
    const reason: SkipReason =
      error instanceof TemplateError && error.code === "featured_inactive" ? "featured_inactive" : "template_error";
    await markSkipped(db, run, game, reason, {
      message: (error instanceof Error ? error.message : String(error)).slice(0, 300),
    });
    return "skipped";
  }

  // E-1B: record the attempt before calling Slack; an uncertain attempt is never re-posted.
  await db.from("games").update({ post_attempted_at: nowIso }).eq("id", game.id);

  const slack = await deps.slackFor(team);
  let ts: string | undefined;
  try {
    const res = await slack.chat.postMessage({
      channel: team.channel_id,
      blocks: rendered.blocks,
      text: rendered.text,
      unfurl_links: false,
      unfurl_media: false,
    });
    ts = res.ts;
  } catch (error) {
    const failure = mapSlackError(error);
    const info = describeSlackError(error);
    if (failure === "disconnected") {
      await db.from("teams").update({ disconnected_at: nowIso }).eq("id", team.id);
      await db.from("games").update({ status: "queued", post_attempted_at: null }).eq("id", game.id);
      await logEvent(db, { teamId: team.id, runId: run?.id, kind: "disconnected", detail: info });
      return "deferred";
    }
    if (failure === "channel") {
      await markSkipped(db, run, game, "channel_error", info);
      if (!team.channel_error_at) {
        await db.from("teams").update({ channel_error_at: nowIso }).eq("id", team.id);
        await logEvent(db, { teamId: team.id, runId: run?.id, kind: "channel_error", detail: info });
      }
      return "skipped";
    }
    await logEvent(db, { teamId: team.id, runId: run?.id, kind: "post_failed", gameId: game.id, detail: info });
    return "deferred"; // stays posting; the next sweep decides
  }

  if (!ts) throw new DbError("chat.postMessage no devolvió ts");
  const { error } = await db
    .from("games")
    .update({ status: "posted", posted_at: nowIso, slack_ts: ts, slack_channel_id: team.channel_id })
    .eq("id", game.id);
  if (error) throw new DbError(error.message, error.code);

  const factId = (game.payload as { fact_id?: string }).fact_id;
  if (factId) await db.from("facts").update({ used_at: nowIso }).eq("id", factId);
  if (team.channel_error_at) await db.from("teams").update({ channel_error_at: null }).eq("id", team.id);

  await logEvent(db, { teamId: team.id, runId: run?.id, kind: "posted", gameId: game.id, detail: { type: game.type } });
  return "posted";
}

/** revealing → revealed (or skipped(no_answers)). Idempotent: chat.update repeats safely; the thread posts once. */
export async function revealGame(
  deps: TickDeps,
  run: Run | undefined,
  team: TeamRow,
  game: GameRow,
): Promise<"revealed" | "skipped" | "deferred"> {
  const { db, now } = deps;
  if (!game.slack_channel_id || !game.slack_ts) {
    await markSkipped(db, run, game, "template_error", { why: "missing_slack_ts" });
    return "skipped";
  }
  const members = await loadMembers(db, team.id);
  const { data: answerRows, error: answersError } = await db.from("answers").select("*").eq("game_id", game.id);
  if (answersError) throw new DbError(answersError.message, answersError.code);
  const answers = (answerRows ?? []) as AnswerRow[];
  const template = templateFor(game.type);
  const slack = await deps.slackFor(team);

  try {
    if (answers.length === 0) {
      const closed = template.closed(game, members);
      await slack.chat.update({ channel: game.slack_channel_id, ts: game.slack_ts, blocks: closed.blocks, text: closed.text });
      await markSkipped(db, run, game, "no_answers");
      return "skipped";
    }

    const scores = template.score(game, answers);
    for (const answer of answers) {
      await db.from("answers").update({ correct_count: scores.get(answer.id) ?? null }).eq("id", answer.id);
    }
    const out = template.reveal({ game, answers, members, scores });
    await slack.chat.update({ channel: game.slack_channel_id, ts: game.slack_ts, blocks: out.blocks, text: out.text });
    if (out.thread && !game.revealed_thread_ts) {
      const reply = await slack.chat.postMessage({
        channel: game.slack_channel_id,
        thread_ts: game.slack_ts,
        reply_broadcast: true,
        text: out.thread,
      });
      await db.from("games").update({ revealed_thread_ts: reply.ts ?? null }).eq("id", game.id);
    }
  } catch (error) {
    const failure = mapSlackError(error);
    const info = describeSlackError(error);
    if (failure === "disconnected") {
      await db.from("teams").update({ disconnected_at: now.toISOString() }).eq("id", team.id);
      await logEvent(db, { teamId: team.id, runId: run?.id, kind: "disconnected", detail: info });
      return "deferred";
    }
    await logEvent(db, { teamId: team.id, runId: run?.id, kind: "reveal_failed", gameId: game.id, detail: info });
    return "deferred"; // stays revealing; reclaimed after 15 min
  }

  const { error } = await db.from("games").update({ status: "revealed" }).eq("id", game.id);
  if (error) throw new DbError(error.message, error.code);
  await logEvent(db, { teamId: team.id, runId: run?.id, kind: "revealed", gameId: game.id, detail: { type: game.type } });
  return "revealed";
}

export async function tickTeam(deps: TickDeps, run: Run, team: TeamRow): Promise<TeamCounts> {
  const counts: TeamCounts = { swept: 0, posted: 0, revealed: 0, skipped: 0, deferred: 0 };
  if (!team.channel_id) return counts;

  counts.swept = (await sweepPhase(deps, run, team)).length;

  for (const game of await claim(deps.db, team, "reveal", deps.now)) {
    const result = await revealGame(deps, run, team, game);
    counts[result] += 1;
  }
  for (const game of await claim(deps.db, team, "post", deps.now)) {
    const result = await postGame(deps, run, team, game);
    counts[result] += 1;
  }

  const queued = (await futureQueue(deps.db, team, deps.now)).filter((g) => g.type !== "recap" && !g.is_sample);
  if (queued.length < QUEUE_LOW) {
    const fresh = await deps.db.from("teams").select("*").eq("id", team.id).single();
    if (!fresh.error && !fresh.data.disconnected_at) {
      const filled = await fillTeam(deps.db, fresh.data as TeamRow, deps.now, run);
      count(run, "generated", filled.created);
    }
  }

  await deps.db.from("teams").update({ last_tick_at: deps.now.toISOString() }).eq("id", team.id);
  await logEvent(deps.db, { teamId: team.id, runId: run.id, kind: "tick_run", detail: counts });
  for (const key of Object.keys(counts) as (keyof TeamCounts)[]) count(run, key, counts[key]);
  return counts;
}

export async function runTick(deps: TickDeps): Promise<Run> {
  const run = startRun("tick", deps.now);
  await forEachTeam(deps.db, run, (team) => tickTeam(deps, run, team).then(() => undefined));
  return finishRun(deps.db, run);
}

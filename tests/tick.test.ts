import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GameRow, TeamRow } from "@/lib/db/types";
import { postGame, revealGame, runTick, tickTeam, type TickDeps } from "@/lib/tick";
import { startRun } from "@/lib/runs";
import { FakeDb } from "./helpers/fake-db";
import {
  answer,
  blockTypes,
  fact,
  fakeSlack,
  game,
  member,
  slackPlatformError,
  slackRateLimitError,
  team,
} from "./helpers/fixtures";

/** 10:05 Mexico City on 2026-09-16: the game's slot was 10:00, so it is inside the post window. */
const POST_TIME = new Date("2026-09-16T16:05:00Z");
/** 18:05 Mexico City the same day (00:05Z next day): reveal window open, posted_at ≥ 4 h ago. */
const REVEAL_TIME = new Date("2026-09-17T00:05:00Z");

function setup(overrides: { team?: Partial<TeamRow>; game?: Partial<GameRow> | null } = {}) {
  const db = new FakeDb({
    teams: [team(overrides.team)],
    members: [member("m1", "Pablo"), member("m2", "Ana"), member("m3", "Luis")],
    facts: [fact("f1", "m1", "repartir periódicos"), fact("f2", "m2", "vender helados"), fact("f3", "m3", "cuidar niños")],
    games: overrides.game === null ? [] : [game(overrides.game)],
  });
  const slack = fakeSlack();
  const deps = (now: Date): TickDeps => ({ db: db.client(), now, slackFor: async () => slack.client });
  const run = startRun("tick", POST_TIME);
  const currentTeam = () => db.find<TeamRow>("teams", "t1");
  return { db, slack, deps, run, currentTeam };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("postGame", () => {
  it("records the attempt before calling Slack, then marks posted and uses the fact", async () => {
    const { db, slack, deps, run, currentTeam } = setup({ game: { status: "posting" } });
    let attemptedAtCall: unknown = "not-read";
    slack.postMessage.mockImplementationOnce(async (args: Record<string, unknown>) => {
      slack.calls.push({ method: "chat.postMessage", args });
      attemptedAtCall = db.find("games", "g1").post_attempted_at;
      return { ok: true, ts: "1700000000.000100" };
    });

    const result = await postGame(deps(POST_TIME), run, currentTeam(), db.find<GameRow>("games", "g1"));

    expect(result).toBe("posted");
    expect(attemptedAtCall).toBe(POST_TIME.toISOString());
    const posted = db.find<GameRow>("games", "g1");
    expect(posted).toMatchObject({ status: "posted", slack_ts: "1700000000.000100", slack_channel_id: "C1", posted_at: POST_TIME.toISOString() });
    expect(db.find("facts", "f1").used_at).toBe(POST_TIME.toISOString());
    expect(slack.calls[0].args).toMatchObject({ channel: "C1", unfurl_links: false });
    expect(blockTypes(slack.calls[0].args.blocks)).toEqual(["header", "section", "actions", "context"]);
    expect(db.events("posted")).toHaveLength(1);
    expect(db.events("posted")[0].run_id).toBe(run.id);
  });

  it("skips with channel_error when the channel was never welcomed", async () => {
    const { db, slack, deps, run, currentTeam } = setup({ team: { welcomed_channel_id: "C_OLD" }, game: { status: "posting" } });
    const result = await postGame(deps(POST_TIME), run, currentTeam(), db.find<GameRow>("games", "g1"));
    expect(result).toBe("skipped");
    expect(db.find("games", "g1")).toMatchObject({ status: "skipped", skip_reason: "channel_error" });
    expect(currentTeam().channel_error_at).toBe(POST_TIME.toISOString());
    expect(slack.postMessage).not.toHaveBeenCalled();
  });

  it("skips with featured_inactive when the featured member left, without touching Slack", async () => {
    const { db, slack, deps, run, currentTeam } = setup({ game: { status: "posting" } });
    db.find("members", "m1").left_at = "2026-09-15T00:00:00Z";
    const result = await postGame(deps(POST_TIME), run, currentTeam(), db.find<GameRow>("games", "g1"));
    expect(result).toBe("skipped");
    expect(db.find("games", "g1")).toMatchObject({ status: "skipped", skip_reason: "featured_inactive", post_attempted_at: null });
    expect(slack.postMessage).not.toHaveBeenCalled();
    expect(db.events("skipped")[0].detail).toMatchObject({ reason: "featured_inactive" });
  });

  it("puts the game back in the queue and marks the team disconnected on invalid_auth", async () => {
    const { db, slack, deps, run, currentTeam } = setup({ game: { status: "posting" } });
    slack.postMessage.mockRejectedValueOnce(slackPlatformError("invalid_auth"));
    const result = await postGame(deps(POST_TIME), run, currentTeam(), db.find<GameRow>("games", "g1"));
    expect(result).toBe("deferred");
    expect(db.find("games", "g1")).toMatchObject({ status: "queued", post_attempted_at: null });
    expect(currentTeam().disconnected_at).toBe(POST_TIME.toISOString());
    expect(db.events("disconnected")).toHaveLength(1);
    expect(JSON.stringify(db.events("disconnected")[0].detail)).not.toContain("xoxb");
  });

  it("skips with channel_error on channel_not_found and logs the transition once", async () => {
    const { db, slack, deps, run, currentTeam } = setup({ game: { status: "posting" } });
    slack.postMessage.mockRejectedValueOnce(slackPlatformError("channel_not_found"));
    expect(await postGame(deps(POST_TIME), run, currentTeam(), db.find<GameRow>("games", "g1"))).toBe("skipped");
    expect(db.find("games", "g1")).toMatchObject({ status: "skipped", skip_reason: "channel_error" });
    expect(currentTeam().channel_error_at).toBe(POST_TIME.toISOString());
    expect(db.events("channel_error")).toHaveLength(1);

    // Second failure while the flag is already set: no second channel_error event.
    db.add("games", game({ id: "g2", slot_date: "2026-09-17", status: "posting" }));
    slack.postMessage.mockRejectedValueOnce(slackPlatformError("not_in_channel"));
    await postGame(deps(POST_TIME), run, currentTeam(), db.find<GameRow>("games", "g2"));
    expect(db.events("channel_error")).toHaveLength(1);
  });

  it("leaves a rate-limited post in posting with the attempt recorded (never re-posted)", async () => {
    const { db, slack, deps, run, currentTeam } = setup({ game: { status: "posting" } });
    slack.postMessage.mockRejectedValueOnce(slackRateLimitError());
    expect(await postGame(deps(POST_TIME), run, currentTeam(), db.find<GameRow>("games", "g1"))).toBe("deferred");
    expect(db.find("games", "g1")).toMatchObject({ status: "posting", post_attempted_at: POST_TIME.toISOString() });
    expect(db.events("post_failed")).toHaveLength(1);

    // 20 minutes later the sweep gives up on the uncertain attempt instead of posting twice.
    const later = new Date(POST_TIME.getTime() + 20 * 60_000);
    const counts = await tickTeam(deps(later), run, currentTeam());
    expect(counts.swept).toBe(1);
    expect(db.find("games", "g1")).toMatchObject({ status: "skipped", skip_reason: "post_uncertain" });
    expect(slack.postMessage).toHaveBeenCalledTimes(1);
  });

  it("clears channel_error_at after a successful post", async () => {
    const { db, deps, run, currentTeam } = setup({ team: { channel_error_at: "2026-09-15T00:00:00Z" }, game: { status: "posting" } });
    await postGame(deps(POST_TIME), run, currentTeam(), db.find<GameRow>("games", "g1"));
    expect(currentTeam().channel_error_at).toBeNull();
  });
});

describe("revealGame", () => {
  const postedGame = (extra: Partial<GameRow> = {}) =>
    game({ status: "revealing", posted_at: "2026-09-16T16:05:00Z", slack_channel_id: "C1", slack_ts: "1700000000.000100", ...extra });

  it("scores, replaces the post without buttons and broadcasts one thread reply", async () => {
    const { db, slack, deps, run, currentTeam } = setup({ game: postedGame() });
    db.add("answers", answer("a1", "g1", "m2", "m1"), answer("a2", "g1", "m3", "m2"));

    expect(await revealGame(deps(REVEAL_TIME), run, currentTeam(), db.find<GameRow>("games", "g1"))).toBe("revealed");

    expect(db.find("answers", "a1").correct_count).toBe(1);
    expect(db.find("answers", "a2").correct_count).toBe(0);
    const update = slack.calls.find((c) => c.method === "chat.update")!;
    expect(update.args).toMatchObject({ channel: "C1", ts: "1700000000.000100" });
    expect(blockTypes(update.args.blocks)).toEqual(["header", "section", "context"]);
    const thread = slack.calls.find((c) => c.method === "chat.postMessage")!;
    expect(thread.args).toMatchObject({ thread_ts: "1700000000.000100", reply_broadcast: true });
    expect(thread.args.text).toContain("Le atinaron Ana");
    expect(db.find("games", "g1")).toMatchObject({ status: "revealed", revealed_thread_ts: "170001.000100" });
    expect(db.events("revealed")).toHaveLength(1);
  });

  it("does not post the thread twice when the reveal is retried", async () => {
    const { db, slack, deps, run, currentTeam } = setup({ game: postedGame({ revealed_thread_ts: "170000.1" }) });
    db.add("answers", answer("a1", "g1", "m2", "m1"));
    await revealGame(deps(REVEAL_TIME), run, currentTeam(), db.find<GameRow>("games", "g1"));
    expect(slack.update).toHaveBeenCalledTimes(1);
    expect(slack.postMessage).not.toHaveBeenCalled();
    expect(db.find("games", "g1").revealed_thread_ts).toBe("170000.1");
  });

  it("closes the post and skips with no_answers when nobody played", async () => {
    const { db, slack, deps, run, currentTeam } = setup({ game: postedGame() });
    expect(await revealGame(deps(REVEAL_TIME), run, currentTeam(), db.find<GameRow>("games", "g1"))).toBe("skipped");
    expect(db.find("games", "g1")).toMatchObject({ status: "skipped", skip_reason: "no_answers" });
    expect(blockTypes(slack.calls[0].args.blocks)).toEqual(["header", "section"]);
    expect(JSON.stringify(slack.calls[0].args.blocks)).toContain("Este juego cerró.");
    expect(slack.postMessage).not.toHaveBeenCalled();
  });

  it("stays in revealing when Slack fails transiently", async () => {
    const { db, slack, deps, run, currentTeam } = setup({ game: postedGame() });
    db.add("answers", answer("a1", "g1", "m2", "m1"));
    slack.update.mockRejectedValueOnce(slackRateLimitError());
    expect(await revealGame(deps(REVEAL_TIME), run, currentTeam(), db.find<GameRow>("games", "g1"))).toBe("deferred");
    expect(db.find("games", "g1").status).toBe("revealing");
    expect(db.events("reveal_failed")).toHaveLength(1);
  });

  it("skips a game that was never posted to Slack", async () => {
    const { db, deps, run, currentTeam } = setup({ game: postedGame({ slack_ts: null }) });
    expect(await revealGame(deps(REVEAL_TIME), run, currentTeam(), db.find<GameRow>("games", "g1"))).toBe("skipped");
    expect(db.events("skipped")[0].detail).toMatchObject({ why: "missing_slack_ts" });
  });
});

describe("tickTeam", () => {
  it("posts in the morning, reveals in the evening and refills the queue when it runs low", async () => {
    const { db, slack, deps, run, currentTeam } = setup();

    const morning = await tickTeam(deps(POST_TIME), run, currentTeam());
    expect(morning).toMatchObject({ posted: 1, revealed: 0, swept: 0 });
    expect(db.find("games", "g1").status).toBe("posted");
    // The queue was empty after posting, so the fill created games from the two unused facts (f1 is used now).
    const queued = db.table("games").filter((g) => g.status === "queued");
    expect(queued).toHaveLength(2);
    expect(new Set(queued.map((g) => g.slot_date)).size).toBe(2);
    expect(queued.every((g) => String(g.slot_date) > "2026-09-16")).toBe(true);
    expect(run.counts.generated).toBe(2);
    expect(currentTeam().last_tick_at).toBe(POST_TIME.toISOString());

    // Nothing to reveal at 16:00 local even though 4 h passed: the rule is ≥ 18:00.
    const afternoon = await tickTeam(deps(new Date("2026-09-16T22:00:00Z")), run, currentTeam());
    expect(afternoon.revealed).toBe(0);

    db.add("answers", answer("a1", "g1", "m2", "m1"));
    const evening = await tickTeam(deps(REVEAL_TIME), run, currentTeam());
    expect(evening.revealed).toBe(1);
    expect(db.find("games", "g1").status).toBe("revealed");
    expect(slack.update).toHaveBeenCalledTimes(1);
    expect(db.events("tick_run")).toHaveLength(3);
  });

  it("does nothing for a team without a channel", async () => {
    const { db, slack, deps, run, currentTeam } = setup({ team: { channel_id: null, welcomed_channel_id: null } });
    const counts = await tickTeam(deps(POST_TIME), run, currentTeam());
    expect(counts).toEqual({ swept: 0, posted: 0, revealed: 0, skipped: 0, deferred: 0 });
    expect(slack.postMessage).not.toHaveBeenCalled();
    expect(db.events()).toHaveLength(0);
  });

  it("does not refill a disconnected team", async () => {
    const { db, deps, run, currentTeam } = setup({ team: { disconnected_at: "2026-09-15T00:00:00Z" }, game: null });
    await tickTeam(deps(POST_TIME), run, currentTeam());
    expect(db.table("games")).toHaveLength(0);
    expect(run.counts.generated).toBeUndefined();
  });
});

describe("runTick", () => {
  it("keeps going when one team throws and logs a team_error for it", async () => {
    const db = new FakeDb({
      teams: [team(), team({ id: "t2", slack_team_id: "T2", admin_user_id: "admin-2", created_at: "2026-09-02T00:00:00Z" })],
      members: [member("m1", "Pablo"), member("m2", "Ana"), member("x1", "Beto", { team_id: "t2" }), member("x2", "Caro", { team_id: "t2" })],
      facts: [fact("f1", "m1", "repartir periódicos"), fact("fx", "x1", "pintar casas")],
      games: [game({ status: "queued" }), game({ id: "g2", team_id: "t2", status: "queued", payload: { fact_id: "fx", featured_member_id: "x1", question_key: "first_job", text: "pintar casas" } })],
    });
    const slack = fakeSlack();
    const run = await runTick({
      db: db.client(),
      now: POST_TIME,
      slackFor: async (t) => {
        if (t.id === "t1") throw new Error("Vault caído");
        return slack.client;
      },
    });
    expect(run.teams).toBe(2);
    expect(run.errors).toBe(1);
    expect(db.events("team_error")).toHaveLength(1);
    expect(db.events("team_error")[0].team_id).toBe("t1");
    expect(db.find("games", "g2").status).toBe("posted");
    expect(db.find("games", "g1").status).toBe("posting"); // claimed, then the sweep will decide
    const summary = db.events("tick_run").find((e) => e.team_id === null)!;
    expect(summary.detail).toMatchObject({ teams: 2, errors: 1, posted: 1 });
  });
});

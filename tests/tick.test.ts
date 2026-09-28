import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

/** Attempts to post in the ritual channel, failed ones included (not the admin's private DMs). */
const channelPosts = (slack: ReturnType<typeof fakeSlack>) =>
  slack.postMessage.mock.calls.filter((c) => (c[0] as { channel?: string }).channel === "C1");
/** Private DMs to the admin (team fixture: admin_slack_user_id "Um1"). */
const adminDms = (slack: ReturnType<typeof fakeSlack>) =>
  slack.calls.filter((c) => c.method === "chat.postMessage" && c.args.channel === "Um1").map((c) => String(c.args.text));

function setup(overrides: { team?: Partial<TeamRow>; game?: Partial<GameRow> | null } = {}) {
  const db = new FakeDb({
    teams: [team(overrides.team)],
    members: [member("m1", "Pablo"), member("m2", "Ana"), member("m3", "Luis")],
    facts: [fact("f1", "m1", "repartir periódicos"), fact("f2", "m2", "vender helados"), fact("f3", "m3", "cuidar niños")],
    games: overrides.game === null ? [] : [game(overrides.game)],
  });
  const slack = fakeSlack();
  const deps = (now: Date): TickDeps => {
    db.clock = () => now;
    return { db: db.client(), now, slackFor: async () => slack.client };
  };
  const run = startRun("tick", POST_TIME);
  const currentTeam = () => db.find<TeamRow>("teams", "t1");
  return { db, slack, deps, run, currentTeam };
}

// The AI templates are exercised with canned content: no network in `npm test`.
vi.mock("@/lib/ai/generate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai/generate")>()),
  generateThisOrThat: vi.fn(async () => ({ question: "¿Café o té?", options: ["Café", "Té"], quips: ["A", "B"] })),
  generateTrivia: vi.fn(async () => ({
    title: "Trivia de 3",
    questions: Array.from({ length: 3 }, (_, i) => ({ q: `P${i}`, options: ["a", "b", "c"], correct: i })),
  })),
  generatePuzzle: vi.fn(async () => ({ prompt: "¿Qué soy?", answer: "reloj", accepted_answers: ["el reloj"] })),
}));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.ANTHROPIC_API_KEY = "test-key";
});
afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
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

  it("skips with featured_inactive when the featured member left, without posting, and tells the admin privately", async () => {
    const { db, slack, deps, run, currentTeam } = setup({ game: { status: "posting" } });
    db.find("members", "m1").left_at = "2026-09-15T00:00:00Z";
    const result = await postGame(deps(POST_TIME), run, currentTeam(), db.find<GameRow>("games", "g1"));
    expect(result).toBe("skipped");
    expect(db.find("games", "g1")).toMatchObject({ status: "skipped", skip_reason: "featured_inactive", post_attempted_at: null });
    expect(channelPosts(slack)).toHaveLength(0);
    expect(adminDms(slack)).toEqual([
      "Salté Adivina quién del 16 de septiembre: el protagonista ya no participa. Quedan 2 hechos sin usar. " +
        "Pide a tu equipo un hecho nuevo con /rituales hecho.",
    ]);
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
    expect(channelPosts(slack)).toHaveLength(1);
    expect(adminDms(slack)[0]).toBe(
      "No sé si el juego del 16 de septiembre llegó al canal. Revísalo; si no salió, no lo vuelvo a intentar para no publicarlo dos veces.",
    );
  });

  it("skips a post Slack refused (invalid_blocks) right away, with Slack's reason, instead of 'no sé si llegó'", async () => {
    const { db, slack, deps, run, currentTeam } = setup({ game: { status: "posting" } });
    const refused = Object.assign(slackPlatformError("invalid_blocks"), {
      data: { error: "invalid_blocks", response_metadata: { messages: ['[ERROR] `action_id` "answer:g1" already exists'] } },
    });
    slack.postMessage.mockRejectedValueOnce(refused);
    expect(await postGame(deps(POST_TIME), run, currentTeam(), db.find<GameRow>("games", "g1"))).toBe("skipped");
    expect(db.find("games", "g1")).toMatchObject({ status: "skipped", skip_reason: "template_error" });
    expect(db.events("post_failed")[0].detail).toMatchObject({ code: "invalid_blocks" });
    expect(String((db.events("skipped")[0].detail as { message: string }).message)).toContain("already exists");
    expect(currentTeam().channel_error_at).toBeNull();
    expect(currentTeam().disconnected_at).toBeNull();
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

  it("stops retrying a reveal Slack refuses", async () => {
    const { db, slack, deps, run, currentTeam } = setup({ game: postedGame() });
    db.add("answers", answer("a1", "g1", "m2", "m1"));
    slack.update.mockRejectedValueOnce(slackPlatformError("invalid_blocks"));
    expect(await revealGame(deps(REVEAL_TIME), run, currentTeam(), db.find<GameRow>("games", "g1"))).toBe("skipped");
    expect(db.find("games", "g1")).toMatchObject({ status: "skipped", skip_reason: "template_error" });
    expect(db.events("reveal_failed")).toHaveLength(1);
  });

  it("stays in revealing when Slack fails transiently", async () => {
    const { db, slack, deps, run, currentTeam } = setup({ game: postedGame() });
    db.add("answers", answer("a1", "g1", "m2", "m1"));
    slack.update.mockRejectedValueOnce(slackRateLimitError());
    expect(await revealGame(deps(REVEAL_TIME), run, currentTeam(), db.find<GameRow>("games", "g1"))).toBe("deferred");
    expect(db.find("games", "g1").status).toBe("revealing");
    expect(db.events("reveal_failed")).toHaveLength(1);
  });

  it("adds one streak milestone line to the thread when someone reaches 5 in a row", async () => {
    const { db, slack, deps, run, currentTeam } = setup({ game: postedGame() });
    for (let i = 0; i < 4; i += 1) {
      db.add("games", game({ id: `p${i}`, type: "trivia", status: "revealed", payload: {}, slot_date: `2026-09-0${i + 7}` }));
      db.add("answers", answer(`x${i}`, `p${i}`, "m2", "0"));
    }
    db.add("answers", answer("a1", "g1", "m2", "m1"), answer("a2", "g1", "m3", "m2"));

    expect(await revealGame(deps(REVEAL_TIME), run, currentTeam(), db.find<GameRow>("games", "g1"))).toBe("revealed");
    const thread = slack.calls.find((c) => c.method === "chat.postMessage")!;
    expect(String(thread.args.text).split("\n")).toEqual([expect.stringContaining("Le atinaron Ana"), "Ana: 5 seguidos"]);
  });

  it("reveals without the milestone line when streaks cannot be read, and logs it", async () => {
    const { db, slack, deps, run, currentTeam } = setup({ game: postedGame() });
    db.rpcs.member_streaks = () => {
      throw new Error("boom");
    };
    db.add("answers", answer("a1", "g1", "m2", "m1"));
    expect(await revealGame(deps(REVEAL_TIME), run, currentTeam(), db.find<GameRow>("games", "g1"))).toBe("revealed");
    expect(String(slack.calls.find((c) => c.method === "chat.postMessage")!.args.text)).not.toContain("seguidos");
    expect(db.events("decoration_failed")[0].detail).toMatchObject({ line: "streak_milestones" });
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
    // The queue was empty after posting, so the fill created a full week ahead: AI games plus a guess-who from an unused fact.
    const queued = db
      .table("games")
      .filter((g) => g.status === "queued" && g.type !== "recap")
      .sort((a, b) => String(a.slot_date).localeCompare(String(b.slot_date)));
    expect(queued).toHaveLength(8);
    expect(new Set(queued.map((g) => g.slot_date)).size).toBe(8);
    expect(queued.every((g) => String(g.slot_date) > "2026-09-16" && !g.is_sample)).toBe(true);
    expect(new Set(queued.map((g) => g.type))).toEqual(new Set(["guess_who", "this_or_that", "trivia", "puzzle"]));
    for (let i = 1; i < queued.length; i += 1) expect(queued[i].type).not.toBe(queued[i - 1].type);
    const guess = queued.filter((g) => g.type === "guess_who");
    expect(guess.length).toBeGreaterThanOrEqual(1);
    expect(guess.every((g) => ["f2", "f3"].includes(String((g.payload as { fact_id: string }).fact_id)))).toBe(true);
    expect(queued.find((g) => g.type === "this_or_that")?.payload).toMatchObject({ preview: "¿Café o té?", options: ["Café", "Té"] });
    expect(run.counts.generated).toBe(8);
    // One recap per Friday for the next two weeks, Friday 18:00 local (24:00 UTC in September).
    const recaps = db.table("games").filter((g) => g.type === "recap");
    expect(recaps.map((g) => [g.slot_date, g.scheduled_for, g.status])).toEqual([
      ["2026-09-18", "2026-09-19T00:00:00.000Z", "queued"],
      ["2026-09-25", "2026-09-26T00:00:00.000Z", "queued"],
    ]);
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

  it("fills with flagged sample content without an Anthropic key, and the tick never posts it", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { db, slack, deps, run, currentTeam } = setup({ game: null });
    await tickTeam(deps(POST_TIME), run, currentTeam());
    const samples = db.table("games").filter((g) => g.is_sample);
    expect(samples.length).toBeGreaterThanOrEqual(5);
    expect(samples.every((g) => g.status === "queued" && typeof (g.payload as { preview?: unknown }).preview === "string")).toBe(true);

    // Make one sample due: the sweep skips it as `sample`; Slack is never called.
    const due = samples[0];
    due.scheduled_for = new Date(POST_TIME.getTime() - 30 * 60_000).toISOString();
    const counts = await tickTeam(deps(POST_TIME), run, currentTeam());
    expect(counts.swept).toBe(1);
    expect(db.find("games", String(due.id))).toMatchObject({ status: "skipped", skip_reason: "sample" });
    expect(channelPosts(slack)).toHaveLength(0);
  });

  it("tells the admin once a week when Adivina quién or Dos verdades had nothing fresh, never naming anyone", async () => {
    const { db, slack, deps, run, currentTeam } = setup({ game: null });
    await tickTeam(deps(POST_TIME), run, currentTeam());
    const [dm] = adminDms(slack);
    expect(dm).toMatch(/^El \d+ de (septiembre|octubre) tocaba Dos verdades y una mentira, pero no hay dos verdades sin usar; puse otro juego\./);
    expect(dm).not.toMatch(/Pablo|Ana|Luis/);
    expect(currentTeam().material_alert_sent_at).toBe(POST_TIME.toISOString());
    expect(db.events("admin_alert")[0].detail).toEqual({ alert: "no_material" });

    // Next day: the queue is low again but the cap holds.
    for (const g of db.table("games")) if (g.type !== "recap") g.status = "vetoed";
    await tickTeam(deps(new Date(POST_TIME.getTime() + 24 * 3600_000)), run, currentTeam());
    expect(adminDms(slack)).toHaveLength(1);
  });

  it("warns the admin the first time the channel fails, and not again while it stays broken", async () => {
    const { db, slack, deps, run, currentTeam } = setup({ game: { status: "posting" } });
    slack.postMessage.mockImplementation(async (args: Record<string, unknown>) => {
      slack.calls.push({ method: "chat.postMessage", args });
      if (args.channel === "C1") throw slackPlatformError("not_in_channel");
      return { ok: true, ts: "1.1" };
    });
    await postGame(deps(POST_TIME), run, currentTeam(), db.find<GameRow>("games", "g1"));
    expect(adminDms(slack)).toEqual([
      "No puedo publicar en #rituales. Revisa que Rituales siga dentro del canal y vuelve a guardar en Conectar.",
    ]);
    db.add("games", game({ id: "g2", status: "posting", slot_date: "2026-09-17" }));
    await postGame(deps(POST_TIME), run, currentTeam(), db.find<GameRow>("games", "g2"));
    expect(adminDms(slack)).toHaveLength(1);
  });

  it("keeps going when the admin DM fails", async () => {
    const { db, slack, deps, run, currentTeam } = setup({ game: { status: "posting" } });
    db.find("members", "m1").left_at = "2026-09-15T00:00:00Z";
    slack.postMessage.mockRejectedValueOnce(slackPlatformError("channel_not_found"));
    expect(await postGame(deps(POST_TIME), run, currentTeam(), db.find<GameRow>("games", "g1"))).toBe("skipped");
    expect(db.events("admin_alert_failed")[0].detail).toMatchObject({ alert: "featured_gone", code: "channel_not_found" });
    expect(currentTeam().material_alert_sent_at).toBeNull();
  });

  it("does not refill a disconnected team", async () => {
    const { db, deps, run, currentTeam } = setup({ team: { disconnected_at: "2026-09-15T00:00:00Z" }, game: null });
    await tickTeam(deps(POST_TIME), run, currentTeam());
    expect(db.table("games")).toHaveLength(0);
    expect(run.counts.generated).toBeUndefined();
  });
});

describe("Friday recap", () => {
  /** Friday 2026-09-18, 18:30 Mexico City. */
  const FRIDAY_EVENING = new Date("2026-09-19T00:30:00Z");
  const fridayGame = () =>
    game({
      status: "posted",
      slot_date: "2026-09-18",
      scheduled_for: "2026-09-18T16:00:00.000Z",
      posted_at: "2026-09-18T16:05:00Z",
      slack_channel_id: "C1",
      slack_ts: "1700000000.000100",
    });

  it("posts after that evening's reveals and stays posted", async () => {
    const { db, slack, deps, run, currentTeam } = setup({ game: fridayGame() });
    db.add("answers", answer("a1", "g1", "m2", "m1"));
    db.add("games", game({ id: "r1", type: "recap", payload: {}, slot_date: "2026-09-18", scheduled_for: "2026-09-19T00:00:00.000Z" }));
    const revealedWhenAsked: number[] = [];
    db.rpcs.recap_data = (_args, fake) => {
      revealedWhenAsked.push(fake.table("games").filter((g) => g.status === "revealed" && g.type !== "recap").length);
      return {
        week_start: "2026-09-14",
        week_end: "2026-09-18",
        revealed: 1,
        played: 1,
        members: 3,
        top: [{ member_id: "m2", points: 3 }],
        streak: 1,
        streak_member_ids: ["m2"],
      };
    };
    db.rpcs.week_moment = () => null;

    const counts = await tickTeam(deps(FRIDAY_EVENING), run, currentTeam());

    expect(counts).toMatchObject({ revealed: 1, posted: 1 });
    expect(revealedWhenAsked).toEqual([1]); // the recap read the week after g1 was revealed
    const toChannel = slack.calls.filter((c) => c.args.channel === "C1");
    expect(toChannel.map((c) => [c.method, c.args.thread_ts ? "thread" : "top"])).toEqual([
      ["chat.update", "top"],
      ["chat.postMessage", "thread"],
      ["chat.postMessage", "top"],
    ]);
    const post = toChannel[2].args;
    expect(post.thread_ts).toBeUndefined();
    expect(JSON.stringify(post.blocks)).toContain("*Puntos de la semana:* Ana 3.");
    expect(JSON.stringify(post.blocks)).toContain("1 de 3 jugaron esta semana.");
    expect(db.find("games", "r1").status).toBe("posted");
    expect(db.events("recap_posted")).toHaveLength(1);

    // An hour later nothing about the recap moves: it is never claimed for a reveal.
    await tickTeam(deps(new Date("2026-09-19T01:30:00Z")), run, currentTeam());
    expect(db.find("games", "r1").status).toBe("posted");
  });

  it("is skipped as no_answers when the week had nothing revealed, without touching Slack", async () => {
    const { db, slack, deps, run, currentTeam } = setup({ game: null });
    db.add("games", game({ id: "r1", type: "recap", payload: {}, slot_date: "2026-09-18", scheduled_for: "2026-09-19T00:00:00.000Z" }));
    db.rpcs.recap_data = () => ({ revealed: 0, played: 0, members: 3, top: [], streak: 0, streak_member_ids: [] });
    await tickTeam(deps(FRIDAY_EVENING), run, currentTeam());
    expect(db.find("games", "r1")).toMatchObject({ status: "skipped", skip_reason: "no_answers" });
    expect(channelPosts(slack)).toHaveLength(0);
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
    db.clock = () => POST_TIME;
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

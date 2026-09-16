import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleAnswerSubmission } from "@/lib/answers";
import { strings } from "@/lib/slack/strings";
import { FakeDb } from "./helpers/fake-db";
import { answer, game, member, team } from "./helpers/fixtures";

const RESPONSE_URL = "https://hooks.slack.com/actions/T1/1/abc";

function setup() {
  const db = new FakeDb({
    teams: [team()],
    members: [
      member("m1", "Pablo"),
      member("m2", "Ana"),
      member("m3", "Luis", { opted_out: true }),
      member("m4", "Zoe", { left_at: "2026-09-10T00:00:00Z" }),
    ],
    games: [game({ status: "posted", posted_at: "2026-09-16T16:05:00Z", slack_channel_id: "C1", slack_ts: "1.1" })],
  });
  return db;
}

const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

function lastReply(): { text: string; blocks?: unknown[]; response_type: string; replace_original: boolean } {
  const [url, init] = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit];
  expect(url).toBe(RESPONSE_URL);
  return JSON.parse(String(init.body));
}

async function submit(db: FakeDb, slackUserId: string, choice = "m1", gameId = "g1") {
  await handleAnswerSubmission(db.client(), { gameId, slackUserId, choice, responseUrl: RESPONSE_URL });
  return lastReply();
}

describe("handleAnswerSubmission", () => {
  it("saves the answer first and then confirms with the chosen name, privately", async () => {
    const db = setup();
    const reply = await submit(db, "Um2", "m1");
    expect(reply).toMatchObject({ response_type: "ephemeral", replace_original: false, text: strings.ackSaved("Pablo") });
    expect(db.table("answers")).toHaveLength(1);
    expect(db.table("answers")[0]).toMatchObject({ game_id: "g1", member_id: "m2", value: { choice: "m1" } });
  });

  it("says 'Cambiado a' when the same person answers again, keeping one row", async () => {
    const db = setup();
    await submit(db, "Um2", "m1");
    const reply = await submit(db, "Um2", "m2");
    expect(reply.text).toBe(strings.ackChanged("Ana"));
    expect(db.table("answers")).toHaveLength(1);
    expect(db.table("answers")[0].value).toEqual({ choice: "m2" });
  });

  it("tells the featured member to wait for the reveal", async () => {
    const db = setup();
    expect((await submit(db, "Um1")).text).toBe(strings.featured);
    expect(db.table("answers")).toHaveLength(0);
  });

  it("rejects people who are not in the ritual (unknown or left)", async () => {
    const db = setup();
    expect((await submit(db, "Unobody")).text).toBe(strings.notMember);
    expect((await submit(db, "Um4")).text).toBe(strings.notMember);
  });

  it("offers the rejoin button to someone who opted out", async () => {
    const db = setup();
    const reply = await submit(db, "Um3");
    expect(reply.text).toBe(strings.optedOut);
    expect(JSON.stringify(reply.blocks)).toContain(strings.rejoinButton);
    expect(JSON.stringify(reply.blocks)).toContain('"action_id":"rejoin"');
  });

  it("answers 'ya cerró' once the game left posted, or when it does not exist", async () => {
    const db = setup();
    db.find("games", "g1").status = "revealing";
    expect((await submit(db, "Um2")).text).toBe(strings.closed);
    expect((await submit(db, "Um2", "m1", "missing")).text).toBe(strings.closed);
    expect(db.table("answers")).toHaveLength(0);
  });

  it("does not claim 'Guardado' when submit_answer refuses at the last moment", async () => {
    const db = setup();
    db.rpcs.submit_answer = () => false; // the tick moved the game to revealing between our read and the write
    expect((await submit(db, "Um2")).text).toBe(strings.closed);
  });

  it("reports a database failure honestly and logs answer_failed without names", async () => {
    const db = setup();
    db.rpcs.submit_answer = () => {
      throw new Error("deadlock detected");
    };
    const reply = await submit(db, "Um2");
    expect(reply.text).toBe("No pude guardar tu respuesta. Inténtalo de nuevo.");
    expect(db.events("answer_failed")).toHaveLength(1);
    expect(JSON.stringify(db.events("answer_failed")[0].detail)).not.toContain("Ana");
  });

  it("keeps an existing answer untouched when the person is refused", async () => {
    const db = setup();
    db.add("answers", answer("a1", "g1", "m2", "m1"));
    db.find("games", "g1").status = "revealed";
    await submit(db, "Um2", "m2");
    expect(db.find("answers", "a1").value).toEqual({ choice: "m1" });
  });
});

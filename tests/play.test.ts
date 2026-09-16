import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleViewSubmission, openPlayModal } from "@/lib/play";
import { strings } from "@/lib/slack/strings";
import { FakeDb } from "./helpers/fake-db";
import { answer, fakeSlack, game, member, team } from "./helpers/fixtures";

const RESPONSE_URL = "https://hooks.slack.com/actions/T1/1/abc";
const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));

const triviaGame = () =>
  game({
    id: "gt",
    type: "trivia",
    status: "posted",
    slot_date: "2026-09-17",
    posted_at: "2026-09-17T16:05:00Z",
    slack_channel_id: "C1",
    slack_ts: "1.1",
    payload: {
      preview: "Trivia",
      title: "Trivia",
      questions: [
        { q: "¿A?", options: ["a1", "a2", "a3"], correct: 1 },
        { q: "¿B?", options: ["b1", "b2", "b3"], correct: 0 },
        { q: "¿C?", options: ["c1", "c2", "c3"], correct: 2 },
      ],
    },
  });
const puzzleGame = () =>
  game({
    id: "gp",
    type: "puzzle",
    status: "posted",
    slot_date: "2026-09-18",
    posted_at: "2026-09-18T16:05:00Z",
    slack_channel_id: "C1",
    slack_ts: "2.2",
    payload: { preview: "¿Qué soy?", prompt: "¿Qué soy?", answer: "reloj", accepted_answers: ["el reloj"] },
  });

function setup() {
  const db = new FakeDb({
    teams: [team()],
    members: [member("m1", "Pablo"), member("m2", "Ana", { opted_out: true }), member("m3", "Luis", { left_at: "2026-09-10T00:00:00Z" })],
    games: [triviaGame(), puzzleGame()],
  });
  const slack = fakeSlack();
  const slackFor = async () => slack.client;
  return { db, slack, slackFor };
}

function lastReply(): { text: string; blocks?: unknown[] } {
  const [, init] = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit];
  return JSON.parse(String(init.body));
}

const meta = (gameId: string) => JSON.stringify({ game_id: gameId, channel_id: "C1" });
const radio = (value: string) => ({ choice: { selected_option: { value } } });
const scheduled: (() => Promise<void>)[] = [];
const schedule = (task: () => Promise<void>) => {
  scheduled.push(task);
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
  scheduled.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

describe("openPlayModal", () => {
  it("opens the trivia modal with one required radio block per question", async () => {
    const { db, slack, slackFor } = setup();
    await openPlayModal(db.client(), slackFor, { gameId: "gt", slackUserId: "Um1", triggerId: "trig", responseUrl: RESPONSE_URL });
    expect(slack.viewsOpen).toHaveBeenCalledTimes(1);
    const { trigger_id, view } = slack.calls[0].args as { trigger_id: string; view: Record<string, unknown> };
    expect(trigger_id).toBe("trig");
    expect(view.callback_id).toBe("trivia");
    expect(JSON.parse(String(view.private_metadata))).toEqual({ game_id: "gt", channel_id: "C1" });
    const blocks = view.blocks as { type: string; block_id: string; element: { type: string; options: unknown[]; initial_option?: unknown } }[];
    expect(blocks.map((b) => [b.type, b.block_id, b.element.type])).toEqual([
      ["input", "q0", "radio_buttons"],
      ["input", "q1", "radio_buttons"],
      ["input", "q2", "radio_buttons"],
    ]);
    expect(blocks.every((b) => b.element.initial_option === undefined)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preselects what the person already answered when reopening", async () => {
    const { db, slack, slackFor } = setup();
    db.add("answers", { ...answer("a1", "gt", "m1", ""), value: { choices: [2, 0, 1] } });
    await openPlayModal(db.client(), slackFor, { gameId: "gt", slackUserId: "Um1", triggerId: "trig", responseUrl: RESPONSE_URL });
    const view = (slack.calls[0].args as { view: { blocks: { element: { initial_option?: { value: string } } }[] } }).view;
    expect(view.blocks.map((b) => b.element.initial_option?.value)).toEqual(["2", "0", "1"]);
  });

  it("opens the puzzle modal with the riddle, a text input capped at 80 and the previous answer", async () => {
    const { db, slack, slackFor } = setup();
    db.add("answers", { ...answer("a2", "gp", "m1", ""), value: { text: "reloj" } });
    await openPlayModal(db.client(), slackFor, { gameId: "gp", slackUserId: "Um1", triggerId: "trig", responseUrl: RESPONSE_URL });
    const view = (slack.calls[0].args as { view: Record<string, unknown> }).view;
    expect(view.callback_id).toBe("puzzle");
    const blocks = view.blocks as { type: string; block_id?: string; element?: { max_length: number; initial_value?: string } }[];
    expect(blocks[0].type).toBe("section");
    expect(blocks[1].block_id).toBe("answer");
    expect(blocks[1].element).toMatchObject({ max_length: 80, initial_value: "reloj" });
  });

  it("answers privately instead of opening when the person is out, opted out, or the game closed", async () => {
    const { db, slack, slackFor } = setup();
    const open = (gameId: string, user: string) =>
      openPlayModal(db.client(), slackFor, { gameId, slackUserId: user, triggerId: "trig", responseUrl: RESPONSE_URL });
    await open("gt", "Unobody");
    expect(lastReply().text).toBe(strings.notMember);
    await open("gt", "Um3");
    expect(lastReply().text).toBe(strings.notMember);
    await open("gt", "Um2");
    expect(lastReply().text).toBe(strings.optedOut);
    expect(JSON.stringify(lastReply().blocks)).toContain(strings.rejoinButton);
    db.find("games", "gt").status = "revealed";
    await open("gt", "Um1");
    expect(lastReply().text).toBe(strings.closed);
    await open("missing", "Um1");
    expect(lastReply().text).toBe(strings.closed);
    expect(slack.viewsOpen).not.toHaveBeenCalled();
  });

  it("logs modal_failed and tells the person when views.open fails", async () => {
    const { db, slack, slackFor } = setup();
    slack.viewsOpen.mockRejectedValueOnce(new Error("expired_trigger_id"));
    await openPlayModal(db.client(), slackFor, { gameId: "gt", slackUserId: "Um1", triggerId: "trig", responseUrl: RESPONSE_URL });
    expect(lastReply().text).toBe(strings.modalFailed);
    expect(db.events("modal_failed")).toHaveLength(1);
  });
});

describe("handleViewSubmission", () => {
  it("saves the trivia choices, clears the modal and schedules the private ack", async () => {
    const { db, slack, slackFor } = setup();
    const response = await handleViewSubmission(
      db.client(),
      { callbackId: "trivia", slackUserId: "Um1", privateMetadata: meta("gt"), values: { q0: radio("1"), q1: radio("0"), q2: radio("1") } },
      schedule,
      slackFor,
    );
    expect(response).toEqual({ response_action: "clear" });
    expect(db.table("answers")[0]).toMatchObject({ game_id: "gt", member_id: "m1", value: { choices: [1, 0, 1] } });
    expect(scheduled).toHaveLength(1);
    await scheduled[0]();
    expect(slack.postEphemeral).toHaveBeenCalledWith({ channel: "C1", user: "Um1", text: strings.trivia.ackSaved(3) });
  });

  it("returns a block error when a question is missing and saves nothing", async () => {
    const { db, slackFor } = setup();
    const response = await handleViewSubmission(
      db.client(),
      { callbackId: "trivia", slackUserId: "Um1", privateMetadata: meta("gt"), values: { q0: radio("1"), q2: radio("1") } },
      schedule,
      slackFor,
    );
    expect(response).toEqual({ response_action: "errors", errors: { q1: strings.modal.pickOne } });
    expect(db.table("answers")).toHaveLength(0);
    expect(scheduled).toHaveLength(0);
  });

  it("says 'ya cerró' in the modal when submit_answer refuses (the tick moved on) and never claims Guardado", async () => {
    const { db, slackFor } = setup();
    db.find("games", "gt").status = "revealing";
    const response = await handleViewSubmission(
      db.client(),
      { callbackId: "trivia", slackUserId: "Um1", privateMetadata: meta("gt"), values: { q0: radio("1"), q1: radio("0"), q2: radio("1") } },
      schedule,
      slackFor,
    );
    expect(response).toEqual({ response_action: "errors", errors: { q0: strings.closed } });
    expect(scheduled).toHaveLength(0);
  });

  it("handles the puzzle: empty answer is an error, a real one is saved and acknowledged", async () => {
    const { db, slack, slackFor } = setup();
    const submit = (text: string) =>
      handleViewSubmission(
        db.client(),
        { callbackId: "puzzle", slackUserId: "Um1", privateMetadata: meta("gp"), values: { answer: { text: { value: text } } } },
        schedule,
        slackFor,
      );
    expect(await submit("   ")).toEqual({ response_action: "errors", errors: { answer: strings.modal.emptyAnswer } });
    expect(await submit("  El reloj ")).toEqual({ response_action: "clear" });
    expect(db.table("answers")[0]).toMatchObject({ game_id: "gp", value: { text: "El reloj" } });
    await scheduled[0]();
    expect(slack.postEphemeral).toHaveBeenCalledWith({ channel: "C1", user: "Um1", text: strings.puzzle.ackSaved("El reloj") });
  });

  it("rejects people outside the ritual, unknown callbacks and broken metadata", async () => {
    const { db, slackFor } = setup();
    const values = { q0: radio("1"), q1: radio("0"), q2: radio("1") };
    expect(await handleViewSubmission(db.client(), { callbackId: "trivia", slackUserId: "Um2", privateMetadata: meta("gt"), values }, schedule, slackFor)).toEqual({
      response_action: "errors",
      errors: { q0: strings.notMember },
    });
    expect(await handleViewSubmission(db.client(), { callbackId: "onboarding", slackUserId: "Um1", privateMetadata: meta("gt"), values }, schedule, slackFor)).toBeNull();
    expect(await handleViewSubmission(db.client(), { callbackId: "trivia", slackUserId: "Um1", privateMetadata: "{oops", values }, schedule, slackFor)).toEqual({
      response_action: "errors",
      errors: { q0: strings.closed },
    });
    expect(db.table("answers")).toHaveLength(0);
  });
});

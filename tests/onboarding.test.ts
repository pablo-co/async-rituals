import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberRow, TeamRow } from "@/lib/db/types";
import { handleCommand, handleEraseAction } from "@/lib/commands";
import {
  eraseMemberData,
  handleProfileSubmission,
  inviteMembers,
  openOnboardingModal,
  saveFreeFact,
  saveOnboarding,
} from "@/lib/onboarding";
import { strings } from "@/lib/slack/strings";
import { FakeDb } from "./helpers/fake-db";
import { answer, fact, fakeSlack, game, member, slackPlatformError, team } from "./helpers/fixtures";

const RESPONSE_URL = "https://hooks.slack.com/actions/T1/1/abc";
const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
const NOW = new Date("2026-09-28T17:00:00Z");

function setup() {
  const db = new FakeDb({
    teams: [team({ material_alert_sent_at: "2026-09-20T00:00:00Z" })],
    members: [
      member("m1", "Pablo", { onboarding_done: false }),
      member("m2", "Ana", { onboarding_done: false }),
      member("m3", "Luis", { onboarding_done: false, opted_out: true }),
      member("m4", "Rob", { onboarding_done: false, left_at: "2026-09-01T00:00:00Z" }),
      member("m5", "Val", { onboarding_done: false, onboarding_invited_at: "2026-09-20T00:00:00Z" }),
    ],
  });
  db.clock = () => NOW;
  const slack = fakeSlack();
  return { db, slack, slackFor: async () => slack.client, currentTeam: () => db.find<TeamRow>("teams", "t1") };
}
const onboardingFact = (id: string, memberId: string, key: string, text: string, extra = {}) =>
  fact(id, memberId, text, { source: "onboarding", payload: { question_key: key, text }, ...extra });
function replies(): { text?: string; blocks?: unknown[]; replace_original?: boolean; delete_original?: boolean }[] {
  return fetchMock.mock.calls.map((c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)));
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe("inviteMembers", () => {
  it("DMs only active people never invited, with Contestar, and stamps them once the DM landed", async () => {
    const { db, slack, currentTeam } = setup();
    slack.postMessage.mockRejectedValueOnce(slackPlatformError("cannot_dm_bot")); // Pablo's DM fails
    const sent = await inviteMembers(db.client(), slack.client, currentTeam(), db.table("members") as unknown as MemberRow[], NOW);

    expect(sent).toBe(1);
    expect(slack.postMessage.mock.calls.map((c) => (c[0] as { channel: string }).channel)).toEqual(["Um1", "Um2"]);
    const dm = slack.postMessage.mock.calls[1][0] as { text: string; blocks: { elements?: { action_id: string; value: string }[] }[] };
    expect(dm.text).toBe(strings.onboarding.invite("rituales"));
    expect(dm.blocks[1].elements![0]).toMatchObject({ action_id: "onboarding_open", value: "t1:m2" });
    expect(db.find("members", "m1").onboarding_invited_at).toBeNull(); // failed: will be retried on the next save
    expect(db.find("members", "m2").onboarding_invited_at).toBe(NOW.toISOString());
    expect(db.events("onboarding_dm_failed")[0].detail).toMatchObject({ code: "cannot_dm_bot" });
    expect(db.events("onboarding_invited")[0].detail).toEqual({ count: 1 });

    // Saving the channel again never DMs the same person twice.
    await inviteMembers(db.client(), slack.client, currentTeam(), db.table("members") as unknown as MemberRow[], NOW);
    expect(slack.postMessage.mock.calls.map((c) => (c[0] as { channel: string }).channel)).toEqual(["Um1", "Um2", "Um1"]);
  });
});

describe("openOnboardingModal", () => {
  const base = { value: "t1:m1", slackUserId: "Um1", triggerId: "trig", responseUrl: RESPONSE_URL, dmChannel: "D1", dmTs: "9.9" };

  it("pre-fills the person's unused onboarding answers and remembers the DM message", async () => {
    const { db, slack, slackFor } = setup();
    db.add(
      "facts",
      onboardingFact("f1", "m1", "first_job", "repartir periódicos"),
      onboardingFact("f2", "m1", "dream_trip", "Islandia", { used_at: "2026-09-20T00:00:00Z" }),
      fact("f3", "m1", "sembrado", { source: "seed" }),
    );
    await openOnboardingModal(db.client(), slackFor, base);
    const { view } = slack.calls[0].args as { view: { blocks: { block_id?: string; element?: { initial_value?: string } }[]; private_metadata: string } };
    expect(view.blocks.find((b) => b.block_id === "q_first_job")?.element?.initial_value).toBe("repartir periódicos");
    expect(view.blocks.find((b) => b.block_id === "q_dream_trip")?.element?.initial_value).toBeUndefined();
    expect(JSON.parse(view.private_metadata)).toEqual({ team_id: "t1", member_id: "m1", dm_channel: "D1", dm_ts: "9.9" });
  });

  it("refuses a button that belongs to someone else", async () => {
    const { db, slack, slackFor } = setup();
    await openOnboardingModal(db.client(), slackFor, { ...base, slackUserId: "Um2" });
    expect(slack.viewsOpen).not.toHaveBeenCalled();
    expect(replies()[0].text).toBe(strings.notMember);
  });

  it("offers the button again when the tap expired", async () => {
    const { db, slack, slackFor } = setup();
    slack.viewsOpen.mockRejectedValueOnce(slackPlatformError("expired_trigger_id"));
    await openOnboardingModal(db.client(), slackFor, base);
    expect(replies()[0].text).toBe(strings.onboarding.slow);
    expect(JSON.stringify(replies()[0].blocks)).toContain('"value":"t1:m1"');
    expect(db.events("modal_failed")).toHaveLength(1);
  });
});

describe("saving Cuéntanos de ti", () => {
  const meta = { team_id: "t1", member_id: "m1", dm_channel: "D1", dm_ts: "9.9" };

  it("answers clear at once and saves in the background", async () => {
    const { db, slackFor } = setup();
    const tasks: (() => Promise<void>)[] = [];
    const response = handleProfileSubmission(
      db.client(),
      { callbackId: "onboarding", slackUserId: "Um1", privateMetadata: JSON.stringify(meta), values: { q_first_job: { text: { value: "x" } } } },
      (task) => tasks.push(task),
      slackFor,
    );
    expect(response).toEqual({ response_action: "clear" });
    expect(db.table("facts")).toHaveLength(0);
    await tasks[0]();
    expect(db.table("facts")).toHaveLength(1);
    expect(handleProfileSubmission(db.client(), { callbackId: "trivia", slackUserId: "Um1", privateMetadata: "{}", values: {} }, () => {}, slackFor)).toBeNull();
  });

  it("keeps unchanged answers, adds new ones, and pulls queued games built on an answer that changed", async () => {
    const { db, slack, slackFor, currentTeam } = setup();
    db.add(
      "facts",
      onboardingFact("keep", "m1", "first_job", "repartir periódicos"),
      onboardingFact("old", "m1", "dream_trip", "Islandia"),
    );
    db.add("games", game({ id: "gq", status: "queued", payload: { fact_id: "old", featured_member_id: "m1", question_key: "dream_trip", text: "Islandia" } }));

    await saveOnboarding(db.client(), slackFor, {
      meta,
      slackUserId: "Um1",
      answers: {
        facts: [
          { question_key: "first_job", text: "repartir periódicos" },
          { question_key: "dream_trip", text: "Japón" },
        ],
        twoTruths: { statements: ["a", "b", "c"], lie_index: 1 },
      },
    });

    const facts = db.table("facts").map((f) => [f.id === "keep" ? "keep" : "new", f.kind, (f.payload as { text?: string }).text ?? "tt"]);
    expect(facts).toEqual([
      ["keep", "fact", "repartir periódicos"],
      ["new", "fact", "Japón"],
      ["new", "two_truths", "tt"],
    ]);
    expect(db.table("facts").filter((f) => f.id !== "keep").every((f) => f.source === "onboarding" && f.member_id === "m1")).toBe(true);
    expect(db.find("games", "gq").status).toBe("vetoed");
    expect(db.events("fact_withdrawn")[0].detail).toEqual({ count: 1 });
    expect(db.find("members", "m1").onboarding_done).toBe(true);
    expect(currentTeam().material_alert_sent_at).toBeNull();
    const update = slack.calls.find((c) => c.method === "chat.update")!;
    expect(update.args).toMatchObject({ channel: "D1", ts: "9.9", text: strings.onboarding.answered });
    expect(JSON.stringify(update.args.blocks)).toContain(strings.onboarding.changeButton);
  });

  it("tells the person by DM when saving failed", async () => {
    const { db, slack, slackFor } = setup();
    const from = db.from.bind(db);
    vi.spyOn(db, "from").mockImplementation((table: string) => {
      if (table === "facts") throw new Error("db down");
      return from(table);
    });
    await saveOnboarding(db.client(), slackFor, { meta, slackUserId: "Um1", answers: { facts: [{ question_key: "first_job", text: "x" }], twoTruths: null } });
    expect(db.events("onboarding_failed")).toHaveLength(1);
    expect(slack.postMessage).toHaveBeenCalledWith({ channel: "Um1", text: strings.onboarding.saveFailed });
    expect(slack.update).not.toHaveBeenCalled();
  });
});

describe("/rituales hecho", () => {
  it("opens the modal from the command, saves a free fact and confirms privately", async () => {
    const { db, slack, slackFor, currentTeam } = setup();
    await handleCommand(db.client(), slackFor, {
      command: "/rituales",
      text: "hecho",
      team_id: "T1",
      user_id: "Um1",
      channel_id: "C1",
      response_url: RESPONSE_URL,
      trigger_id: "trig",
    });
    const { view } = slack.calls[0].args as { view: { callback_id: string; private_metadata: string } };
    expect(view.callback_id).toBe("fact");
    const meta = JSON.parse(view.private_metadata);

    await saveFreeFact(db.client(), { teamId: meta.team_id, memberId: meta.member_id, slackUserId: "Um1", text: "corrió un maratón", responseUrl: meta.response_url });
    expect(db.table("facts")[0]).toMatchObject({ kind: "fact", source: "command", payload: { question_key: "free", text: "corrió un maratón" } });
    expect(currentTeam().material_alert_sent_at).toBeNull();
    expect(replies().at(-1)?.text).toBe(strings.fact.saved);
  });

  it("answers the list of commands for anything unknown, and 'no estás' for strangers", async () => {
    const { db, slackFor } = setup();
    const cmd = { command: "/rituales", text: "", team_id: "T1", user_id: "Um1", channel_id: "C1", response_url: RESPONSE_URL, trigger_id: "t" };
    await handleCommand(db.client(), slackFor, cmd);
    await handleCommand(db.client(), slackFor, { ...cmd, text: "hecho", user_id: "Unobody" });
    expect(replies().map((r) => r.text)).toEqual([strings.help, strings.notMember]);
  });

  it("salir opts out and offers to come back", async () => {
    const { db, slackFor } = setup();
    await handleCommand(db.client(), slackFor, { command: "/rituales", text: "salir", team_id: "T1", user_id: "Um2", channel_id: "C1", response_url: RESPONSE_URL, trigger_id: "t" });
    expect(db.find("members", "m2").opted_out).toBe(true);
    expect(replies()[0].text).toBe(strings.left);
  });
});

describe("/rituales borrar-mis-datos", () => {
  const cmd = { command: "/rituales", text: "borrar-mis-datos", team_id: "T1", user_id: "Um1", channel_id: "C1", response_url: RESPONSE_URL, trigger_id: "t" };

  it("only warns: nothing is deleted until Sí, borrar", async () => {
    const { db, slackFor } = setup();
    db.add("facts", onboardingFact("f1", "m1", "first_job", "x"));
    await handleCommand(db.client(), slackFor, cmd);
    const warning = replies()[0];
    expect(warning.text).toBe(strings.erase.confirm);
    expect(JSON.stringify(warning.blocks)).toContain('"style":"danger"');
    expect(db.table("facts")).toHaveLength(1);

    await handleEraseAction(db.client(), { confirmed: false, slackTeamId: "T1", slackUserId: "Um1", responseUrl: RESPONSE_URL });
    expect(replies()[1]).toEqual({ delete_original: true });
    expect(db.table("facts")).toHaveLength(1);
  });

  it("deletes answers, facts and the profile; pulls queued games about the person; a fresh row keeps them in the channel", async () => {
    const { db } = setup();
    db.find<MemberRow>("members", "m1").opted_out = true;
    db.add("facts", onboardingFact("f1", "m1", "first_job", "x"), onboardingFact("f2", "m2", "first_job", "y"));
    db.add(
      "games",
      game({ id: "about", status: "queued", payload: { fact_id: "f1", featured_member_id: "m1" } }),
      game({ id: "other", status: "queued", slot_date: "2026-09-17", payload: { fact_id: "f2", featured_member_id: "m2" } }),
    );
    db.add("answers", answer("a1", "other", "m1", "m2"), answer("a2", "other", "m3", "m2"));

    expect(await eraseMemberData(db.client(), { teamId: "t1", slackUserId: "Um1", now: NOW })).toBe("erased");

    expect(db.find("games", "about").status).toBe("vetoed");
    expect(db.find("games", "other").status).toBe("queued");
    expect(db.table("facts").map((f) => f.id)).toEqual(["f2"]);
    expect(db.table("answers").map((a) => a.id)).toEqual(["a2"]);
    const fresh = db.table("members").filter((m) => m.slack_user_id === "Um1");
    expect(fresh).toHaveLength(1);
    expect(fresh[0].id).not.toBe("m1");
    expect(fresh[0]).toMatchObject({ display_name: "Pablo", opted_out: true, onboarding_done: false, onboarding_invited_at: NOW.toISOString() });
    expect(db.events("member_erased")[0].detail).toEqual({ games_withdrawn: 1 });
  });

  it("does not bring back someone who already left the channel", async () => {
    const { db } = setup();
    await eraseMemberData(db.client(), { teamId: "t1", slackUserId: "Um4", now: NOW });
    expect(db.table("members").some((m) => m.slack_user_id === "Um4")).toBe(false);
  });

  it("confirms after deleting, replacing the warning", async () => {
    const { db } = setup();
    await handleEraseAction(db.client(), { confirmed: true, slackTeamId: "T1", slackUserId: "Um1", responseUrl: RESPONSE_URL });
    expect(replies()[0]).toEqual({ replace_original: true, text: strings.erase.done });
  });
});

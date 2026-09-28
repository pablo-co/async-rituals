import type { KnownBlock, WebClient } from "@slack/web-api";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FactRow, MemberRow, TeamRow } from "@/lib/db/types";
import { DbError } from "@/lib/errors";
import { logEvent } from "@/lib/events";
import { actions, button, section } from "@/lib/slack/blocks";
import { describeSlackError } from "@/lib/slack/errors";
import { FACT_CALLBACK, factModal, readFactSubmission, type FactMetadata } from "@/lib/slack/modals/fact";
import {
  ONBOARDING_CALLBACK,
  onboardingModal,
  readOnboardingSubmission,
  type OnboardingAnswers,
  type OnboardingMetadata,
  type TwoTruths,
} from "@/lib/slack/modals/onboarding";
import { strings } from "@/lib/slack/strings";
import { ephemeral, postToResponseUrl } from "@/lib/slack/verify";
import type { ViewResponse } from "@/lib/play";

/**
 * Material for Adivina quién and Dos verdades comes from the people themselves (hito 5):
 *
 *   joins the channel / admin saves the channel ──▶ inviteMembers: one DM with "Contestar", once per person
 *   "Contestar" ──▶ openOnboardingModal (after the 200; member + unused answers + token in one round trip)
 *   Enviar ──▶ handleProfileSubmission (local checks → clear) ──▶ after(): saveOnboarding
 *                 diff against the unused onboarding facts: unchanged stay, removed ones are deleted and any queued
 *                 game built on them is vetoed (an edited answer never reaches the channel), new ones are inserted
 *                 → DM message becomes "Gracias…" with "Cambiar mis respuestas"
 *   /rituales hecho ──▶ openFactModal ──▶ saveFreeFact (question_key 'free', source 'command')
 *   /rituales borrar-mis-datos ──▶ "Sí, borrar" ──▶ eraseMemberData: answers, facts and the member row go; a person
 *                 still in the channel comes back as a fresh row (no history, no points, never re-invited)
 *
 * Every save resets teams.material_alert_sent_at when new material arrived (plan CEO 5).
 */
export const ONBOARDING_ACTION = "onboarding_open";
export const FACT_ACTION = "fact_open";
export const ERASE_CONFIRM = "erase_confirm";
export const ERASE_CANCEL = "erase_cancel";

type SlackFor = (teamId: string) => Promise<WebClient>;
type Reply = (text: string, blocks?: unknown[]) => Promise<void>;

/** Button value shared by the DM and the retry buttons: "{team_id}:{member_id}". */
export function memberRef(team: Pick<TeamRow, "id">, member: Pick<MemberRow, "id">): string {
  return `${team.id}:${member.id}`;
}
export function parseMemberRef(value: string | undefined): { teamId: string; memberId: string } | null {
  const [teamId, memberId] = (value ?? "").split(":");
  return teamId && memberId ? { teamId, memberId } : null;
}

export function inviteBlocks(team: Pick<TeamRow, "id" | "channel_name">, member: Pick<MemberRow, "id">, answered = false): KnownBlock[] {
  const ref = memberRef(team, member);
  return [
    section(answered ? strings.onboarding.answered : strings.onboarding.invite(team.channel_name)),
    actions(ONBOARDING_ACTION, [
      answered
        ? button(ONBOARDING_ACTION, strings.onboarding.changeButton, ref)
        : button(ONBOARDING_ACTION, strings.onboarding.inviteButton, ref, "primary"),
    ]),
  ];
}

/** DMs "Contestar" to active members never invited and without answers. The timestamp is written only when the DM landed. */
export async function inviteMembers(
  db: SupabaseClient,
  slack: WebClient,
  team: TeamRow,
  members: readonly MemberRow[],
  now: Date = new Date(),
): Promise<number> {
  const targets = members.filter((m) => !m.left_at && !m.opted_out && !m.onboarding_done && !m.onboarding_invited_at);
  let sent = 0;
  for (const member of targets) {
    try {
      await slack.chat.postMessage({
        channel: member.slack_user_id,
        text: strings.onboarding.invite(team.channel_name),
        blocks: inviteBlocks(team, member),
        unfurl_links: false,
      });
    } catch (error) {
      await logEvent(db, { teamId: team.id, kind: "onboarding_dm_failed", detail: describeSlackError(error) });
      continue;
    }
    await db.from("members").update({ onboarding_invited_at: now.toISOString() }).eq("id", member.id);
    sent += 1;
  }
  if (sent > 0) await logEvent(db, { teamId: team.id, kind: "onboarding_invited", detail: { count: sent } });
  return sent;
}

// ---------------------------------------------------------------------------------------------------------------
// Opening the modals (after the 200: trigger_id lives 3 s from the tap; a miss re-offers the button)
// ---------------------------------------------------------------------------------------------------------------

function answersFrom(facts: readonly FactRow[]): OnboardingAnswers {
  const out: OnboardingAnswers = { facts: [], twoTruths: null };
  for (const f of facts) {
    if (f.kind === "fact") {
      const p = f.payload as { question_key?: string; text?: string };
      if (p.question_key && p.text && !out.facts.some((x) => x.question_key === p.question_key)) {
        out.facts.push({ question_key: p.question_key, text: p.text });
      }
    } else if (!out.twoTruths) {
      out.twoTruths = f.payload as unknown as TwoTruths;
    }
  }
  return out;
}

/** The person's onboarding answers not yet used in a game (the only ones they can still change). */
async function editableFacts(db: SupabaseClient, memberId: string): Promise<FactRow[]> {
  const { data, error } = await db
    .from("facts")
    .select("*")
    .eq("member_id", memberId)
    .eq("source", "onboarding")
    .is("used_at", null)
    .eq("retired", false)
    .order("created_at");
  if (error) throw new DbError(error.message, error.code);
  return (data ?? []) as FactRow[];
}

async function loadMemberAndToken(
  db: SupabaseClient,
  slackFor: SlackFor,
  ref: { teamId: string; memberId: string },
  withFacts: boolean,
) {
  const [memberRes, facts, slack] = await Promise.all([
    db.from("members").select("*").eq("id", ref.memberId).eq("team_id", ref.teamId).maybeSingle(),
    withFacts ? editableFacts(db, ref.memberId) : Promise.resolve([] as FactRow[]),
    slackFor(ref.teamId).then(
      (client) => ({ client, error: null as unknown }),
      (error: unknown) => ({ client: null, error }),
    ),
  ]);
  return { member: memberRes.data as MemberRow | null, facts, slack };
}

async function openOrRetry(
  db: SupabaseClient,
  teamId: string,
  open: () => Promise<unknown>,
  reply: Reply,
  retry: { text: string; actionId: string; label: string; value: string },
  timing: { clickedAt?: number; receivedAt?: number },
) {
  try {
    await open();
  } catch (error) {
    const now = Date.now();
    await logEvent(db, {
      teamId,
      kind: "modal_failed",
      detail: {
        ...describeSlackError(error),
        ...(timing.clickedAt ? { since_tap_ms: now - timing.clickedAt } : {}),
        ...(timing.receivedAt ? { handler_ms: now - timing.receivedAt } : {}),
      },
    });
    await reply(retry.text, [section(retry.text), actions(retry.actionId, [button(retry.actionId, retry.label, retry.value, "primary")])]);
  }
}

export async function openOnboardingModal(
  db: SupabaseClient,
  slackFor: SlackFor,
  input: {
    value: string | undefined;
    slackUserId: string;
    triggerId: string;
    responseUrl: string;
    dmChannel: string | null;
    dmTs: string | null;
    clickedAt?: number;
    receivedAt?: number;
  },
): Promise<void> {
  const reply: Reply = (text, blocks) => postToResponseUrl(input.responseUrl, ephemeral(text, blocks));
  const ref = parseMemberRef(input.value);
  if (!ref) return reply(strings.notMember);
  const { member, facts, slack } = await loadMemberAndToken(db, slackFor, ref, true);
  if (!member || member.slack_user_id !== input.slackUserId || member.left_at) return reply(strings.notMember);

  const meta: OnboardingMetadata = { team_id: ref.teamId, member_id: member.id, dm_channel: input.dmChannel, dm_ts: input.dmTs };
  await openOrRetry(
    db,
    ref.teamId,
    async () => {
      if (!slack.client) throw slack.error;
      await slack.client.views.open({ trigger_id: input.triggerId, view: onboardingModal(answersFrom(facts), meta) });
    },
    reply,
    { text: strings.onboarding.slow, actionId: ONBOARDING_ACTION, label: strings.onboarding.inviteButton, value: input.value! },
    input,
  );
}

export async function openFactModal(
  db: SupabaseClient,
  slackFor: SlackFor,
  input: { ref: { teamId: string; memberId: string }; slackUserId: string; triggerId: string; responseUrl: string; clickedAt?: number; receivedAt?: number },
): Promise<void> {
  const reply: Reply = (text, blocks) => postToResponseUrl(input.responseUrl, ephemeral(text, blocks));
  const { member, slack } = await loadMemberAndToken(db, slackFor, input.ref, false);
  if (!member || member.slack_user_id !== input.slackUserId || member.left_at) return reply(strings.notMember);
  const meta: FactMetadata = { team_id: input.ref.teamId, member_id: member.id, response_url: input.responseUrl };
  await openOrRetry(
    db,
    input.ref.teamId,
    async () => {
      if (!slack.client) throw slack.error;
      await slack.client.views.open({ trigger_id: input.triggerId, view: factModal(meta) });
    },
    reply,
    { text: strings.fact.slow, actionId: FACT_ACTION, label: strings.fact.openButton, value: memberRef({ id: input.ref.teamId }, member) },
    input,
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Enviar: local checks now, the save in after()
// ---------------------------------------------------------------------------------------------------------------

export function handleProfileSubmission(
  db: SupabaseClient,
  input: { callbackId: string; slackUserId: string; privateMetadata: string; values: Record<string, unknown> },
  schedule: (task: () => Promise<void>) => void,
  slackFor: SlackFor,
): ViewResponse | null {
  if (input.callbackId !== ONBOARDING_CALLBACK && input.callbackId !== FACT_CALLBACK) return null;
  let meta: (OnboardingMetadata & Partial<FactMetadata>) | null = null;
  try {
    meta = JSON.parse(input.privateMetadata) as OnboardingMetadata & Partial<FactMetadata>;
  } catch {
    meta = null;
  }
  const firstBlock = input.callbackId === FACT_CALLBACK ? "fact" : "q_hidden_talent";
  if (!meta?.team_id || !meta.member_id) return { response_action: "errors", errors: { [firstBlock]: strings.notMember } };
  const m = meta;

  if (input.callbackId === ONBOARDING_CALLBACK) {
    const read = readOnboardingSubmission(input.values);
    if ("errors" in read) return { response_action: "errors", errors: read.errors };
    schedule(() => saveOnboarding(db, slackFor, { meta: m, slackUserId: input.slackUserId, answers: read.value }));
    return { response_action: "clear" };
  }

  const read = readFactSubmission(input.values);
  if ("errors" in read) return { response_action: "errors", errors: read.errors };
  schedule(() =>
    saveFreeFact(db, { teamId: m.team_id, memberId: m.member_id, slackUserId: input.slackUserId, text: read.value.text, responseUrl: m.response_url ?? null }),
  );
  return { response_action: "clear" };
}

const factKey = (kind: FactRow["kind"], payload: Record<string, unknown>): string =>
  kind === "fact"
    ? `f|${String(payload.question_key)}|${String(payload.text).toLowerCase()}`
    : `t|${((payload.statements as string[]) ?? []).join("|").toLowerCase()}|${String(payload.lie_index)}`;

/** Vetoes queued games built on these facts, so a withdrawn or edited answer never reaches the channel. */
async function withdrawFacts(db: SupabaseClient, teamId: string, factIds: readonly string[]): Promise<number> {
  if (factIds.length === 0) return 0;
  const { data, error } = await db
    .from("games")
    .select("id, payload")
    .eq("team_id", teamId)
    .eq("status", "queued")
    .in("type", ["guess_who", "two_truths"]);
  if (error) throw new DbError(error.message, error.code);
  const ids = new Set(factIds);
  const hit = ((data ?? []) as { id: string; payload: { fact_id?: string } }[]).filter((g) => g.payload?.fact_id && ids.has(g.payload.fact_id));
  if (hit.length > 0) {
    const { error: vetoError } = await db.from("games").update({ status: "vetoed" }).in("id", hit.map((g) => g.id)).eq("status", "queued");
    if (vetoError) throw new DbError(vetoError.message, vetoError.code);
    await logEvent(db, { teamId, kind: "fact_withdrawn", detail: { count: hit.length } });
  }
  const { error: deleteError } = await db.from("facts").delete().in("id", [...factIds]);
  if (deleteError) throw new DbError(deleteError.message, deleteError.code);
  return hit.length;
}

export async function saveOnboarding(
  db: SupabaseClient,
  slackFor: SlackFor,
  input: { meta: OnboardingMetadata; slackUserId: string; answers: OnboardingAnswers },
): Promise<void> {
  const { meta, answers } = input;
  const { data: memberRow } = await db.from("members").select("*").eq("id", meta.member_id).eq("team_id", meta.team_id).maybeSingle();
  const member = memberRow as MemberRow | null;
  if (!member || member.slack_user_id !== input.slackUserId) return;

  let slack: WebClient | null = null;
  try {
    slack = await slackFor(meta.team_id);
    const current = await editableFacts(db, member.id);
    const wanted: { kind: FactRow["kind"]; payload: Record<string, unknown> }[] = [
      ...answers.facts.map((f) => ({ kind: "fact" as const, payload: { question_key: f.question_key, text: f.text } })),
      ...(answers.twoTruths ? [{ kind: "two_truths" as const, payload: { ...answers.twoTruths } }] : []),
    ];
    const wantedKeys = new Set(wanted.map((w) => factKey(w.kind, w.payload)));
    const currentKeys = new Set(current.map((f) => factKey(f.kind, f.payload)));

    await withdrawFacts(db, meta.team_id, current.filter((f) => !wantedKeys.has(factKey(f.kind, f.payload))).map((f) => f.id));
    const added = wanted.filter((w) => !currentKeys.has(factKey(w.kind, w.payload)));
    if (added.length > 0) {
      const { error } = await db
        .from("facts")
        .insert(added.map((w) => ({ member_id: member.id, kind: w.kind, payload: w.payload, source: "onboarding" })));
      if (error) throw new DbError(error.message, error.code);
      await db.from("teams").update({ material_alert_sent_at: null }).eq("id", meta.team_id);
    }
    await db.from("members").update({ onboarding_done: true }).eq("id", member.id);
    await logEvent(db, {
      teamId: meta.team_id,
      kind: "onboarding_saved",
      detail: { facts: answers.facts.length, two_truths: Boolean(answers.twoTruths) },
    });
  } catch (error) {
    await logEvent(db, {
      teamId: meta.team_id,
      kind: "onboarding_failed",
      detail: { message: (error instanceof Error ? error.message : String(error)).slice(0, 300) },
    });
    try {
      await slack?.chat.postMessage({ channel: input.slackUserId, text: strings.onboarding.saveFailed });
    } catch {
      // nothing else to tell: the event is logged
    }
    return;
  }

  if (!meta.dm_channel || !meta.dm_ts) return;
  try {
    const { data: team } = await db.from("teams").select("id, channel_name").eq("id", meta.team_id).single();
    await slack.chat.update({
      channel: meta.dm_channel,
      ts: meta.dm_ts,
      text: strings.onboarding.answered,
      blocks: inviteBlocks(team as Pick<TeamRow, "id" | "channel_name">, member, true),
    });
  } catch (error) {
    await logEvent(db, { teamId: meta.team_id, kind: "ack_failed", detail: describeSlackError(error) });
  }
}

export async function saveFreeFact(
  db: SupabaseClient,
  input: { teamId: string; memberId: string; slackUserId: string; text: string; responseUrl: string | null },
): Promise<void> {
  const reply = (text: string) => (input.responseUrl ? postToResponseUrl(input.responseUrl, ephemeral(text)) : Promise.resolve());
  const { data: memberRow } = await db.from("members").select("*").eq("id", input.memberId).eq("team_id", input.teamId).maybeSingle();
  const member = memberRow as MemberRow | null;
  if (!member || member.slack_user_id !== input.slackUserId || member.left_at) return reply(strings.notMember);

  const { error } = await db
    .from("facts")
    .insert({ member_id: member.id, kind: "fact", payload: { question_key: "free", text: input.text }, source: "command" });
  if (error) {
    await logEvent(db, { teamId: input.teamId, kind: "fact_failed", detail: { message: error.message.slice(0, 300) } });
    return reply(strings.fact.saveFailed);
  }
  await db.from("teams").update({ material_alert_sent_at: null }).eq("id", input.teamId);
  await logEvent(db, { teamId: input.teamId, kind: "fact_added" });
  await reply(strings.fact.saved);
}

/**
 * /rituales borrar-mis-datos, after "Sí, borrar". Queued games about the person are vetoed first (their text would
 * otherwise still post), then answers, facts and the member row go. Someone still in the channel gets a fresh row:
 * same Slack id and name (Slack's, not ours), opt-out kept, no history, never re-invited.
 */
export async function eraseMemberData(
  db: SupabaseClient,
  input: { teamId: string; slackUserId: string; now?: Date },
): Promise<"erased" | "none"> {
  const { data } = await db.from("members").select("*").eq("team_id", input.teamId).eq("slack_user_id", input.slackUserId).maybeSingle();
  const member = data as MemberRow | null;
  if (!member) return "none";

  const { data: queued, error: queuedError } = await db
    .from("games")
    .select("id, payload")
    .eq("team_id", input.teamId)
    .eq("status", "queued")
    .in("type", ["guess_who", "two_truths"]);
  if (queuedError) throw new DbError(queuedError.message, queuedError.code);
  const about = ((queued ?? []) as { id: string; payload: { featured_member_id?: string } }[]).filter(
    (g) => g.payload?.featured_member_id === member.id,
  );
  if (about.length > 0) {
    await db.from("games").update({ status: "vetoed" }).in("id", about.map((g) => g.id)).eq("status", "queued");
  }

  for (const table of ["answers", "facts"] as const) {
    const { error } = await db.from(table).delete().eq("member_id", member.id);
    if (error) throw new DbError(error.message, error.code);
  }
  const { error: memberError } = await db.from("members").delete().eq("id", member.id);
  if (memberError) throw new DbError(memberError.message, memberError.code);

  if (!member.left_at) {
    const { error } = await db.from("members").insert({
      team_id: input.teamId,
      slack_user_id: member.slack_user_id,
      display_name: member.display_name,
      opted_out: member.opted_out,
      onboarding_done: false,
      onboarding_invited_at: (input.now ?? new Date()).toISOString(),
    });
    if (error) throw new DbError(error.message, error.code);
  }
  await logEvent(db, { teamId: input.teamId, kind: "member_erased", detail: { games_withdrawn: about.length } });
  return "erased";
}

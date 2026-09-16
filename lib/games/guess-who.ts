import { TemplateError } from "@/lib/errors";
import type { AnswerRow, GameRow, MemberRow } from "@/lib/db/types";
import { answerButtons, answerSelect, context, header, section } from "@/lib/slack/blocks";
import { clampLabel, LIMITS, strings } from "@/lib/slack/strings";
import { escapeSlackText } from "@/lib/slack/text";
import { leadInFor } from "./questions";
import { activeMembers, contentHash, memberName, type GameTemplate, type RevealInput } from "./template";

const MAX_BUTTONS = 6;

interface GuessWhoPayload {
  fact_id: string;
  featured_member_id: string;
  question_key: string;
  text: string;
  resumed?: boolean;
}

function payloadOf(game: GameRow): GuessWhoPayload {
  return game.payload as unknown as GuessWhoPayload;
}

function leadIn(game: GameRow): string {
  const p = payloadOf(game);
  return leadInFor(p.question_key, escapeSlackText(p.text));
}

/** Everyone active except the featured member, alphabetically. Options are computed at post time, never at generate time. */
export function guessWhoOptions(game: GameRow, members: MemberRow[]) {
  const featuredId = payloadOf(game).featured_member_id;
  return activeMembers(members)
    .filter((m) => m.id !== featuredId)
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "es"))
    .map((m) => ({ label: clampLabel(m.display_name, LIMITS.button), value: m.id }));
}

export const guessWho: GameTemplate = {
  type: "guess_who",

  async generate(ctx) {
    const { db, team } = ctx;
    // Facts reserved by games still in the queue (a veto frees the fact by itself).
    const { data: reservedRows, error: reservedError } = await db
      .from("games")
      .select("payload")
      .eq("team_id", team.id)
      .eq("type", "guess_who")
      .in("status", ["queued", "posting"]);
    if (reservedError) throw new TemplateError(reservedError.message, "template_error");
    const reserved = new Set(
      (reservedRows ?? []).map((r) => (r.payload as { fact_id?: string }).fact_id).filter(Boolean),
    );

    const { data: facts, error } = await db
      .from("facts")
      .select("id, member_id, payload, created_at, members!inner(team_id, left_at, opted_out)")
      .eq("kind", "fact")
      .is("used_at", null)
      .eq("retired", false)
      .eq("members.team_id", team.id)
      .is("members.left_at", null)
      .eq("members.opted_out", false)
      .order("created_at");
    if (error) throw new TemplateError(error.message, "template_error");

    const candidates = (facts ?? []).filter((f) => !reserved.has(f.id));
    if (candidates.length === 0) return null;

    // Spread the spotlight: prefer members who have the fewest reserved facts.
    const reservedByMember = new Map<string, number>();
    for (const row of reservedRows ?? []) {
      const id = (row.payload as { featured_member_id?: string }).featured_member_id;
      if (id) reservedByMember.set(id, (reservedByMember.get(id) ?? 0) + 1);
    }
    candidates.sort(
      (a, b) => (reservedByMember.get(a.member_id) ?? 0) - (reservedByMember.get(b.member_id) ?? 0),
    );
    const least = reservedByMember.get(candidates[0].member_id) ?? 0;
    const pool = candidates.filter((c) => (reservedByMember.get(c.member_id) ?? 0) === least);
    const fact = pool[Math.floor(Math.random() * pool.length)];

    const payload = fact.payload as { question_key?: string; text?: string };
    const text = String(payload.text ?? "").trim();
    if (!text) return null;
    return {
      type: "guess_who",
      payload: {
        fact_id: fact.id,
        featured_member_id: fact.member_id,
        question_key: payload.question_key ?? "free",
        text,
      },
      contentHash: contentHash(text),
    };
  },

  async render(_ctx, game, members) {
    const p = payloadOf(game);
    const featured = members.find((m) => m.id === p.featured_member_id);
    if (!featured || featured.left_at || featured.opted_out) {
      throw new TemplateError("El protagonista ya no participa", "featured_inactive");
    }
    const options = guessWhoOptions(game, members);
    if (options.length === 0) {
      throw new TemplateError("No hay nadie que pueda adivinar", "template_error");
    }
    const actionId = `answer:${game.id}`;
    const blocks = [
      header(strings.header("guess_who")),
      section(leadIn(game)),
      options.length <= MAX_BUTTONS
        ? answerButtons(actionId, actionId, options)
        : answerSelect(actionId, actionId, strings.selectPlaceholder, options),
      context(strings.contextPending),
    ];
    if (p.resumed) blocks.push(context(strings.contextResumed));
    return { blocks, text: strings.fallback.post("guess_who") };
  },

  score(game, answers) {
    const featuredId = payloadOf(game).featured_member_id;
    const scores = new Map<string, number | null>();
    for (const a of answers) {
      scores.set(a.id, (a.value as { choice?: string }).choice === featuredId ? 1 : 0);
    }
    return scores;
  },

  reveal({ game, answers, members, scores }: RevealInput) {
    const p = payloadOf(game);
    const featuredName = escapeSlackText(memberName(members, p.featured_member_id));
    const winners = answers
      .filter((a) => scores.get(a.id) === 1)
      .map((a) => escapeSlackText(memberName(members, a.member_id)));
    const wrong = answers.length - winners.length;
    const bonus = Math.min(5, wrong);
    const eligible = activeMembers(members).filter((m) => m.id !== p.featured_member_id).length;
    const blocks = [
      header(strings.header("guess_who")),
      section(`${leadIn(game)}\n\n${strings.guessWho.revealLine(featuredName)}`),
      context(strings.contextClosed(answers.length, Math.max(eligible, answers.length))),
    ];
    const thread = [
      strings.guessWho.winners(winners),
      strings.guessWho.fooled(featuredName, wrong, bonus),
      strings.guessWho.ask(featuredName),
    ].join(" ");
    return { blocks, text: strings.fallback.reveal("guess_who"), thread };
  },

  closed(game) {
    return {
      blocks: [header(strings.header("guess_who")), section(`${leadIn(game)}\n\n${strings.closedNoAnswers}`)],
      text: strings.fallback.reveal("guess_who"),
    };
  },
};

export type { AnswerRow };

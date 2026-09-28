import { TemplateError } from "@/lib/errors";
import type { GameRow, MemberRow } from "@/lib/db/types";
import { answerButtons, context, header, section } from "@/lib/slack/blocks";
import { clampLabel, LIMITS, strings } from "@/lib/slack/strings";
import { escapeSlackText } from "@/lib/slack/text";
import { pickFreshFact } from "./material";
import { activeMembers, contentHash, memberName, type GameTemplate, type RevealInput } from "./template";

/**
 * Dos verdades y una mentira (D-1A). Material: the optional block of the onboarding modal (facts kind
 * `two_truths`, `{statements: [3], lie_index}`), same freshness and reservation rules as Adivina quién.
 * The author is named in the post (people guess the lie, not the person) and never answers their own game.
 *
 *   post:   "{Nombre} nos cuenta tres cosas…" + 1. 2. 3. + buttons "1" "2" "3" (value = index)
 *   score:  choice === lie_index → 1
 *   reveal: "La mentira era: «…»." · thread "Le atinaron … (+2). {Autor} engañó a {n} (+{n}). {Autor}, ¿nos cuentas?"
 */
interface TwoTruthsPayload {
  fact_id: string;
  featured_member_id: string;
  statements: [string, string, string];
  lie_index: number;
  resumed?: boolean;
}

function payloadOf(game: GameRow): TwoTruthsPayload {
  return game.payload as unknown as TwoTruthsPayload;
}

function body(game: GameRow, members: MemberRow[]): string {
  const p = payloadOf(game);
  const author = escapeSlackText(memberName(members, p.featured_member_id));
  return `${strings.twoTruths.intro(author)}\n\n${strings.twoTruths.statements(p.statements.map(escapeSlackText))}`;
}

export const twoTruths: GameTemplate = {
  type: "two_truths",

  async generate(ctx) {
    const fact = await pickFreshFact(ctx, "two_truths", "two_truths");
    if (!fact) return null;
    const p = fact.payload as { statements?: unknown; lie_index?: unknown };
    const statements = Array.isArray(p.statements) ? p.statements.map((st) => String(st ?? "").trim()) : [];
    const lieIndex = Number(p.lie_index);
    if (statements.length !== 3 || statements.some((st) => !st) || ![0, 1, 2].includes(lieIndex)) return null;
    return {
      type: "two_truths",
      payload: { fact_id: fact.id, featured_member_id: fact.member_id, statements, lie_index: lieIndex },
      contentHash: contentHash(statements.join(" ")),
    };
  },

  async render(_ctx, game, members) {
    const p = payloadOf(game);
    const author = members.find((m) => m.id === p.featured_member_id);
    if (!author || author.left_at || author.opted_out) {
      throw new TemplateError("El protagonista ya no participa", "featured_inactive");
    }
    if (activeMembers(members).filter((m) => m.id !== author.id).length === 0) {
      throw new TemplateError("No hay nadie que pueda adivinar", "template_error");
    }
    const actionId = `answer:${game.id}`;
    const blocks = [
      header(strings.header("two_truths")),
      section(body(game, members)),
      answerButtons(actionId, actionId, [0, 1, 2].map((i) => ({ label: String(i + 1), value: String(i) }))),
      context(strings.contextPending),
    ];
    if (p.resumed) blocks.push(context(strings.contextResumed));
    return { blocks, text: strings.fallback.post("two_truths") };
  },

  score(game, answers) {
    const lie = String(payloadOf(game).lie_index);
    const scores = new Map<string, number | null>();
    for (const a of answers) scores.set(a.id, (a.value as { choice?: string }).choice === lie ? 1 : 0);
    return scores;
  },

  reveal({ game, answers, members, scores }: RevealInput) {
    const p = payloadOf(game);
    const author = escapeSlackText(memberName(members, p.featured_member_id));
    const winners = answers.filter((a) => scores.get(a.id) === 1).map((a) => escapeSlackText(memberName(members, a.member_id)));
    const fooled = answers.length - winners.length;
    const eligible = activeMembers(members).filter((m) => m.id !== p.featured_member_id).length;
    const blocks = [
      header(strings.header("two_truths")),
      section(`${body(game, members)}\n\n${strings.twoTruths.revealLine(escapeSlackText(p.statements[p.lie_index]))}`),
      context(strings.contextClosed(answers.length, Math.max(eligible, answers.length))),
    ];
    const thread = [
      strings.guessWho.winners(winners),
      strings.guessWho.fooled(author, fooled, Math.min(5, fooled)),
      strings.guessWho.ask(author),
    ].join(" ");
    return { blocks, text: strings.fallback.reveal("two_truths"), thread };
  },

  closed(game, members) {
    return {
      blocks: [header(strings.header("two_truths")), section(`${body(game, members)}\n\n${strings.closedNoAnswers}`)],
      text: strings.fallback.reveal("two_truths"),
    };
  },

  labelFor(game, choice) {
    const statement = payloadOf(game).statements[Number(choice)];
    return statement ? clampLabel(`«${statement}»`, LIMITS.option) : null;
  },
};

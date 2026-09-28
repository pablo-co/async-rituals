import { describe, expect, it } from "vitest";
import { QUESTIONS } from "@/lib/games/questions";
import { factModal, readFactSubmission } from "@/lib/slack/modals/fact";
import { onboardingModal, readOnboardingSubmission } from "@/lib/slack/modals/onboarding";
import { LIMITS, strings } from "@/lib/slack/strings";

const meta = { team_id: "t1", member_id: "m1", dm_channel: "D1", dm_ts: "1.1" };
const text = (value: string) => ({ text: { value } });
const lie = (value: string | null) => ({ choice: { selected_option: value === null ? null : { value } } });

type Block = {
  type: string;
  block_id?: string;
  optional?: boolean;
  label?: { text: string };
  element?: { type: string; max_length?: number; initial_value?: string; placeholder?: { text: string }; initial_option?: { value: string } };
  elements?: { text: string }[];
};

describe("Cuéntanos de ti modal", () => {
  it("opens with the consent line, then the 10 optional questions, then the optional two-truths block", () => {
    const view = onboardingModal({ facts: [], twoTruths: null }, meta);
    const blocks = view.blocks as Block[];
    expect(view.title!.text).toBe("Cuéntanos de ti");
    expect(view.title!.text.length).toBeLessThanOrEqual(LIMITS.modalTitle);
    expect(blocks[0]).toMatchObject({ type: "context", elements: [{ text: strings.onboarding.consent }] });
    const questions = blocks.filter((b) => b.block_id?.startsWith("q_"));
    expect(questions.map((b) => b.block_id)).toEqual(QUESTIONS.map((q) => `q_${q.key}`));
    expect(questions.every((b) => b.optional && b.element?.max_length === 280)).toBe(true);
    expect(questions[0].element?.placeholder?.text).toBe("tocar el ukelele");
    expect(blocks.filter((b) => b.block_id?.startsWith("tt_")).map((b) => b.block_id)).toEqual(["tt_0", "tt_1", "tt_2", "tt_lie"]);
    expect(JSON.parse(view.private_metadata!)).toEqual(meta);
    expect(blocks.length).toBeLessThanOrEqual(100);
  });

  it("pre-fills what the person already answered", () => {
    const view = onboardingModal(
      { facts: [{ question_key: "first_job", text: "repartir periódicos" }], twoTruths: { statements: ["a", "b", "c"], lie_index: 2 } },
      meta,
    );
    const blocks = view.blocks as Block[];
    expect(blocks.find((b) => b.block_id === "q_first_job")?.element?.initial_value).toBe("repartir periódicos");
    expect(blocks.find((b) => b.block_id === "q_dream_trip")?.element?.initial_value).toBeUndefined();
    expect(blocks.find((b) => b.block_id === "tt_1")?.element?.initial_value).toBe("b");
    expect(blocks.find((b) => b.block_id === "tt_lie")?.element?.initial_option?.value).toBe("2");
  });

  it("reads the answers, trimmed, and the two truths only when complete", () => {
    const read = readOnboardingSubmission({
      q_first_job: text("  repartir   periódicos "),
      q_dream_trip: text(""),
      tt_0: text("nadé con tiburones"),
      tt_1: text("hablo 3 idiomas"),
      tt_2: text("nunca he visto el mar"),
      tt_lie: lie("2"),
    });
    expect(read).toEqual({
      value: {
        facts: [{ question_key: "first_job", text: "repartir periódicos" }],
        twoTruths: { statements: ["nadé con tiburones", "hablo 3 idiomas", "nunca he visto el mar"], lie_index: 2 },
      },
    });
  });

  it("asks for all three sentences and the lie, or none, under the block to fix", () => {
    const incomplete = strings.onboarding.twoTruthsIncomplete;
    expect(readOnboardingSubmission({ q_first_job: text("x"), tt_0: text("a"), tt_2: text("c") })).toEqual({ errors: { tt_1: incomplete } });
    expect(readOnboardingSubmission({ tt_0: text("a"), tt_1: text("b"), tt_2: text("c"), tt_lie: lie(null) })).toEqual({
      errors: { tt_lie: incomplete },
    });
    expect(readOnboardingSubmission({ q_first_job: text("x"), tt_lie: lie("0") })).toEqual({ errors: { tt_0: incomplete } });
  });

  it("refuses an empty submission instead of saving nothing", () => {
    expect(readOnboardingSubmission({})).toEqual({ errors: { q_hidden_talent: strings.onboarding.nothing } });
    const onlyTwoTruths = readOnboardingSubmission({ tt_0: text("a"), tt_1: text("b"), tt_2: text("c"), tt_lie: lie("1") });
    expect("value" in onlyTwoTruths && onlyTwoTruths.value.facts).toEqual([]);
  });
});

describe("Un hecho nuevo modal", () => {
  it("has one required input with the third-person hint and keeps the reply address", () => {
    const view = factModal({ team_id: "t1", member_id: "m1", response_url: "https://hooks.slack.com/commands/x" });
    expect(view.title!.text).toBe("Un hecho nuevo");
    const [input] = view.blocks as Block[];
    expect(input).toMatchObject({ block_id: "fact", element: { max_length: 280 } });
    expect(input.optional).toBeUndefined();
    expect(JSON.parse(view.private_metadata!).response_url).toBe("https://hooks.slack.com/commands/x");
  });

  it("reads the fact or asks for one", () => {
    expect(readFactSubmission({ fact: text("  corrió un maratón  ") })).toEqual({ value: { text: "corrió un maratón" } });
    expect(readFactSubmission({ fact: text(" ") })).toEqual({ errors: { fact: strings.fact.empty } });
  });
});

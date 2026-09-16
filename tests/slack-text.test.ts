import { describe, expect, it } from "vitest";
import { escapeSlackText, truncate } from "@/lib/slack/text";

describe("escapeSlackText", () => {
  it("neutralizes channel pings and mentions", () => {
    expect(escapeSlackText("hola <!channel>")).toBe("hola &lt;!channel&gt;");
    expect(escapeSlackText("<@U123> mira")).toBe("&lt;@U123&gt; mira");
  });
  it("escapes ampersands first so nothing double-escapes", () => {
    expect(escapeSlackText("A & B < C")).toBe("A &amp; B &lt; C");
  });
  it("keeps accents and emoji untouched", () => {
    expect(escapeSlackText("corrió un maratón 🏃")).toBe("corrió un maratón 🏃");
  });
});

describe("truncate", () => {
  it("leaves short text alone", () => {
    expect(truncate("hola", 10)).toBe("hola");
  });
  it("cuts to the limit with an ellipsis", () => {
    const out = truncate("a".repeat(80), 75);
    expect(out.length).toBe(75);
    expect(out.endsWith("…")).toBe(true);
  });
});

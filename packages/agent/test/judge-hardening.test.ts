// Hardening from the security audit (S-JUDGE-3, M8 / S-JUDGE-4 and the lows in the judge package).
import { describe, expect, it } from "vitest";
import { parseJudgeEnv } from "../src/judge/create-judge";
import type { JudgeDiagnostic } from "../src/judge/diagnostics";
import { buildJudgeState, modelText } from "../src/judge/state";
import { SystemOneJudge } from "../src/judge/system-one-judge";
import { inputWithText } from "./support/inputs";

const errorOf = (env: Record<string, string>): string => {
  const r = parseJudgeEnv(env);
  if (r.ok) throw new Error("expected a configuration error");
  return r.error;
};
const KEY = "tsk_test_hardening_41c2";

describe("judge env: URLs, keys and loopback", () => {
  it("refuses a user name or password in a judge URL", () => {
    expect(errorOf({ LAYA_BASE_URL: "http://audit:pw@127.0.0.1:8808" })).toMatch(/user name or password/);
    expect(errorOf({ JUDGE_PROVIDER: "jev", TYPESAFE_API_KEY: KEY, JEV_BASE_URL: "https://u:p@api.example.invalid" })).toMatch(/user name or password/);
  });

  it("refuses API keys with control characters inside them", () => {
    expect(errorOf({ JUDGE_PROVIDER: "jev", TYPESAFE_API_KEY: `${KEY}\nX` })).toMatch(/TYPESAFE_API_KEY/);
    expect(errorOf({ LAYA_API_KEY: `${KEY}\tX` })).toMatch(/LAYA_API_KEY/);
  });

  it("counts only 127.0.0.0/8, ::1 and the literal localhost as loopback", () => {
    expect(parseJudgeEnv({ LAYA_BASE_URL: "http://127.0.0.2:8808" }).ok).toBe(true);
    expect(parseJudgeEnv({ LAYA_BASE_URL: "http://localhost:8808" }).ok).toBe(true);
    expect(errorOf({ LAYA_BASE_URL: "http://judge.localhost:8808" })).toMatch(/LAYA_ALLOW_REMOTE/);
    expect(errorOf({ LAYA_BASE_URL: "http://127.0.0.1.example:8808" })).toMatch(/LAYA_ALLOW_REMOTE/);
  });

  it("sends a Laya key to a remote host only over https", () => {
    expect(errorOf({ LAYA_BASE_URL: "http://192.0.2.10:8808", LAYA_ALLOW_REMOTE: "1", LAYA_API_KEY: KEY })).toMatch(/https/);
    expect(parseJudgeEnv({ LAYA_BASE_URL: "https://192.0.2.10:8808", LAYA_ALLOW_REMOTE: "1", LAYA_API_KEY: KEY }).ok).toBe(true);
    expect(errorOf({ JUDGE_PROVIDER: "jev", TYPESAFE_API_KEY: KEY, JEV_BASE_URL: "http://judge.localhost:4000" })).toMatch(/https/);
  });
});

describe("judge diagnostics never copy a fetch error message", () => {
  it("reports the error name and code only", async () => {
    const seen: JudgeDiagnostic[] = [];
    const fetchImpl = () => {
      const cause = Object.assign(new Error("inner"), { code: "ECONNREFUSED" });
      throw new TypeError(`fetch failed for http://u:${KEY}@127.0.0.1:9`, { cause });
    };
    const judge = new SystemOneJudge({ provider: "laya", baseUrl: "http://127.0.0.1:9", model: "typed-decisions", fetchImpl, onDiagnostic: (d) => seen.push(d) });
    const record = await judge.assess(inputWithText("Soft cotton tee."), { timeoutMs: 1000 });
    expect(record.status).toBe("ERROR");
    const text = JSON.stringify(seen);
    expect(text).not.toContain(KEY);
    expect(text).toContain("TypeError");
    expect(text).toContain("ECONNREFUSED");
  });
});

describe("model-facing listing text (M8): NFKC, no format characters, no tokenizer control tokens", () => {
  const ch = (c: number) => String.fromCodePoint(c);

  it("folds compatibility forms such as fullwidth letters and punctuation", () => {
    expect(modelText("ｉｇｎｏｒｅ　ｔｈｉｓ，ok")).toBe("ignore this,ok");
  });

  it("removes every format character, including BOM and word joiners", () => {
    for (const c of [0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x202e, 0x2066, 0x00ad, 0xe0041]) expect(modelText(`a${ch(c)}b`)).toBe("ab");
  });

  it("neutralises literal tokenizer control tokens, any case, also after NFKC", () => {
    expect(modelText("x [CLS] [sep] [PAD] [Unk] [MASK] y")).toBe("x (CLS) (sep) (PAD) (Unk) (MASK) y");
    expect(modelText("［SEP］")).toBe("(SEP)");
  });

  it("leaves ordinary English and Chinese text alone", () => {
    const plain = "Heavyweight cotton tee in white. Boxy fit, sizes S to XL. 30-day returns.";
    expect(modelText(plain)).toBe(plain);
    expect(modelText("純棉短袖T恤，白色。")).toBe("純棉短袖T恤,白色。");
  });

  it("changes only the copy the model sees: the input keeps the original text for the log and the hash", () => {
    const original = `ig${ch(0x200b)}nore [SEP] this`;
    const input = inputWithText(original);
    const state = buildJudgeState(input, { text: input.listingText, index: 0, total: 1 });
    expect(state.listing.description).toBe("ignore (SEP) this");
    expect(input.listingText).toBe(original);
  });
});

// T-V1 at page level in jsdom: the mounted page, driven like a judge would (Load demo, Verify, Tamper, Restore).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountVerifier, type VerifierPage } from "../src/app";
import { LIMITS } from "../src/limits";
import { KEYS, LOG } from "./helpers";

let root: HTMLElement;
let page: VerifierPage;

const q = <T extends Element>(selector: string): T => {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`missing ${selector}`);
  return found;
};
const click = (action: string): void => q<HTMLButtonElement>(`[data-action="${action}"]`).click();
const outcome = (): string | null => q("[data-outcome]").getAttribute("data-outcome");
const typeInto = (field: string, text: string): void => {
  const ta = q<HTMLTextAreaElement>(`#${field}-text`);
  ta.value = text;
  ta.dispatchEvent(new Event("input", { bubbles: true }));
};

async function chooseFile(field: string, file: File): Promise<void> {
  const input = q<HTMLInputElement>(`#${field}-file`);
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new Event("change"));
  await vi.waitFor(() => expect(page.state().notice !== null || page.state()[field as "log"].source.startsWith("file:")).toBe(true));
}

beforeEach(() => {
  root = document.createElement("div");
  document.body.replaceChildren(root);
  page = mountVerifier(root);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("judge flow: Load demo log, Verify, Tamper, Restore", () => {
  it("starts NOT VERIFIED with the honesty footer", () => {
    expect(outcome()).toBe("idle");
    expect(root.textContent).toContain("Not affiliated with HKT, Tap & Go or Mastercard. Demo keys are throwaway; the rail is SIMULATED.");
    expect(root.textContent).toContain("Computed here, offline");
  });

  it("passes the SIMULATED demo with entry count, head and checkpoint match", () => {
    click("demo");
    expect(root.textContent).toContain("SIMULATED demo log and throwaway test keys, not the booth keys.");
    click("verify");
    expect(outcome()).toBe("pass");
    const result = q("#result");
    expect(result.getAttribute("role")).toBe("status");
    expect(result.getAttribute("aria-live")).toBe("polite");
    expect(result.textContent).toContain("PASS");
    expect(result.textContent).toContain("10 (seq 0 to 9)");
    expect(result.textContent).toContain("9c2d2dfe2e9ecb3a");
    expect(result.textContent).toContain("Matches seq 9 (the head).");
    const rows = [...root.querySelectorAll(".timeline .row")];
    expect(rows).toHaveLength(10);
    expect(rows.every((r) => r.getAttribute("data-status") === "ok")).toBe(true);
    expect(q("[data-checkpoint]").getAttribute("data-checkpoint")).toBe("ok");
  });

  it("Tamper fails at seq 1 and shows the changed entry and field; Restore passes again", () => {
    click("demo");
    click("verify");
    click("tamper");
    expect(outcome()).toBe("fail");
    const verdict = q("[data-outcome]");
    expect(verdict.getAttribute("data-failed-seq")).toBe("1");
    expect(verdict.getAttribute("data-reason")).toBe("PAYLOAD_HASH");
    expect(verdict.textContent).toContain("Chain broken at entry 1");
    expect(verdict.textContent).toContain("紀錄鏈於第 1 筆中斷");
    expect(q(".tamper-note").textContent).toContain("payload.approved_limit_minor");
    expect(q(".tamper-note").textContent).toContain("25900 → 35900");
    const statuses = [...root.querySelectorAll(".timeline .row")].map((r) => r.getAttribute("data-status"));
    expect(statuses).toEqual(["ok", "broken", ...Array.from({ length: 8 }, () => "unchecked")]);
    expect(q('.row[data-index="1"] [data-tampered]').textContent).toContain("approved_limit_minor");
    const ta = q<HTMLTextAreaElement>("#log-text");
    expect(ta.value).not.toBe(LOG);
    expect(ta.value.length).toBe(LOG.length);
    expect(q<HTMLButtonElement>('[data-action="tamper"]').disabled).toBe(true);
    click("restore");
    expect(outcome()).toBe("pass");
    expect(ta.value).toBe(LOG);
    expect(root.querySelector(".tamper-note")).toBeNull();
    expect(q<HTMLButtonElement>('[data-action="restore"]').disabled).toBe(true);
  });

  it("clears the verdict when any input changes, so a PASS never sits next to other text", () => {
    click("demo");
    click("verify");
    typeInto("log", `${LOG} `);
    expect(outcome()).toBe("idle");
    click("verify");
    expect(outcome()).toBe("fail");
  });

  it("shows input errors per field, marks them invalid, and never PASS", () => {
    typeInto("log", "x");
    typeInto("keys", "[]");
    typeInto("checkpoint", "{");
    click("verify");
    expect(outcome()).toBe("input-error");
    expect(q("#keys-text").getAttribute("aria-invalid")).toBe("true");
    expect(q<HTMLElement>("#checkpoint-error").hidden).toBe(false);
    expect(root.textContent).toContain("NOT VERIFIED");
  });
});

describe("files", () => {
  it("loads a log file locally and names its source", async () => {
    click("demo");
    await chooseFile("log", new File([LOG], "booth-log.jsonl", { type: "text/plain" }));
    expect(q<HTMLTextAreaElement>("#log-text").value).toBe(LOG);
    expect(q("#log-source").textContent).toContain("booth-log.jsonl");
    click("verify");
    expect(outcome()).toBe("pass");
  });

  it("refuses a file over the size cap with a clear message", async () => {
    await chooseFile("keys", new File(["x".repeat(LIMITS.smallChars + 1)], "big.json"));
    expect(q(".notice").textContent).toContain(LIMITS.smallChars.toLocaleString("en"));
    expect(q<HTMLTextAreaElement>("#keys-text").value).toBe("");
  });
});

describe("safety", () => {
  it("makes no network calls through the whole flow", async () => {
    const spies = { fetch: vi.fn(), XMLHttpRequest: vi.fn(), WebSocket: vi.fn(), EventSource: vi.fn(), sendBeacon: vi.fn() };
    vi.stubGlobal("fetch", spies.fetch);
    vi.stubGlobal("XMLHttpRequest", spies.XMLHttpRequest);
    vi.stubGlobal("WebSocket", spies.WebSocket);
    vi.stubGlobal("EventSource", spies.EventSource);
    Object.defineProperty(navigator, "sendBeacon", { value: spies.sendBeacon, configurable: true });
    click("demo");
    click("verify");
    click("tamper");
    click("restore");
    await chooseFile("checkpoint", new File(["{}"], "cp.json"));
    click("verify");
    for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
  });

  it("never turns pasted text into HTML", () => {
    const evil = '<img src=x onerror="globalThis.__pwned=1">';
    typeInto("log", `${JSON.stringify({ kind: evil, seq: 0, ts: evil })}\n`);
    typeInto("keys", KEYS);
    click("verify");
    expect(outcome()).toBe("fail");
    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toContain("<img src=x onerror=");
    expect((globalThis as Record<string, unknown>)["__pwned"]).toBeUndefined();
  });

  it("shows a hostile file name as text", async () => {
    await chooseFile("log", new File([LOG], '<img src=x onerror="globalThis.__pwned=2">.jsonl'));
    expect(root.querySelector("img")).toBeNull();
    expect(q("#log-source").textContent).toContain("<img src=x");
  });
});

describe("accessibility basics", () => {
  it("labels every control and marks zh-HK runs", () => {
    for (const control of root.querySelectorAll("textarea, input")) {
      expect(root.querySelector(`label[for="${control.id}"]`), control.id).not.toBeNull();
    }
    const zh = [...root.querySelectorAll(".bi__zh")];
    expect(zh.length).toBeGreaterThan(5);
    expect(zh.every((node) => node.getAttribute("lang") === "zh-HK")).toBe(true);
    for (const button of root.querySelectorAll("button")) expect(button.getAttribute("type")).toBe("button");
  });

  it("states pass and fail by icon and text, with decorative icons hidden", () => {
    click("demo");
    click("verify");
    const badge = q(".verdict__badge");
    expect(badge.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(badge.textContent).toContain("PASS");
    for (const svg of root.querySelectorAll("svg")) expect(svg.getAttribute("aria-hidden")).toBe("true");
  });
});

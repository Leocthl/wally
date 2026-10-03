// Visit counting for the Add to Home Screen card: one visit per browsing session, never an error when storage is refused.
import { describe, expect, it } from "vitest";
import { countVisit, VISITS_KEY, VISIT_COUNTED_KEY, type VisitStorage } from "../src/pwa/visits";

function memory(initial: Readonly<Record<string, string>> = {}): VisitStorage & { readonly data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("countVisit", () => {
  it("counts the first session as visit 1", () => {
    const local = memory();
    expect(countVisit(local, memory())).toBe(1);
    expect(local.data.get(VISITS_KEY)).toBe("1");
  });

  it("counts a session once: a reload inside it is the same visit", () => {
    const local = memory();
    const session = memory();
    expect(countVisit(local, session)).toBe(1);
    expect(countVisit(local, session)).toBe(1);
    expect(countVisit(local, session)).toBe(1);
    expect(session.data.get(VISIT_COUNTED_KEY)).toBe("1");
  });

  it("counts a later session as the second visit", () => {
    const local = memory();
    countVisit(local, memory());
    expect(countVisit(local, memory())).toBe(2);
    expect(countVisit(local, memory())).toBe(3);
  });

  it("reads a damaged count as none", () => {
    for (const bad of ["", "abc", "-4", "1.5", "NaN"]) {
      expect(countVisit(memory({ [VISITS_KEY]: bad }), memory())).toBe(1);
    }
  });

  it("returns 0 when storage is missing or refuses, so an unknown count is never a second visit", () => {
    expect(countVisit(null, memory())).toBe(0);
    expect(countVisit(memory(), null)).toBe(0);
    const refusing: VisitStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(countVisit(refusing, memory())).toBe(0);
    expect(countVisit(memory(), refusing)).toBe(0);
  });
});

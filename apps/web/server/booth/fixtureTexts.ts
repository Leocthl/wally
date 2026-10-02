// Planner fixture files as text, for the recorded-request index (src/booth/backend/ask.ts). Node only; the browser
// bundles the same files (src/api/local/bundle.ts). The planner loaders already validate the records themselves.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FixtureText } from "../../src/booth/backend/ask";

function textsIn(dir: string): readonly FixtureText[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((name) => ({ name, text: readFileSync(join(dir, name), "utf8") }));
  } catch {
    return []; // a missing folder offers no sample requests; the record loader reports a bad fixtures folder itself
  }
}

/** data/fixtures/planner/*.json and data/scenarios/planner/*.json, each sorted by name. */
export function plannerFixtureTexts(fixturesDir: string, scenariosDir: string): readonly FixtureText[] {
  return [...textsIn(join(fixturesDir, "planner")), ...textsIn(join(scenariosDir, "planner"))];
}

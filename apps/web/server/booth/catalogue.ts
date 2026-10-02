// Node loader for the SIMULATED catalogue: reads data/fixtures (listings, the reference cart, Scameter captures) and
// hands the parsed files to the portable builder (src/booth/backend/catalogue.ts), shared with the on-device client.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildCatalogue, CatalogueError, type Catalogue, type FixtureFile } from "../../src/booth/backend/catalogue";
import type { ScenarioTable } from "../../src/booth/backend/scenarioTable";

export {
  buildCatalogue,
  CatalogueError,
  listingsFor,
  OVERFLOW_UNDER_MINOR,
  overflowListing,
  scameterLookup,
  visitorListing,
  type Catalogue,
  type CatalogueSources,
  type FixtureFile,
} from "../../src/booth/backend/catalogue";

function readJson(path: string): FixtureFile {
  try {
    return { name: path, raw: JSON.parse(readFileSync(path, "utf8")) as unknown };
  } catch (err) {
    throw new CatalogueError(`${path}: ${err instanceof Error ? err.message : "unreadable"}`);
  }
}

function readDir(dir: string): readonly FixtureFile[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => readJson(join(dir, f)));
}

export function loadCatalogue(fixturesDir: string, table: ScenarioTable): Catalogue {
  const sources = {
    listings: readDir(join(fixturesDir, "listings")),
    referenceCart: readJson(join(fixturesDir, "carts", "attempt-1.json")),
    captures: readDir(join(fixturesDir, "scameter")),
  };
  return buildCatalogue(sources, table);
}

// "No number without a chip" check (docs/04): strips every Num, identifier and chip, then looks for digits that remain.
// Rule, template and register IDs (R3, S2, DM4, F36) are identifiers, not figures.

const ID_PATTERN = /\b(?:R|S|DM|DMR|I|F|C|D|X|A|B|T-[A-Z])\d+[a-z]?(?:\.[a-z_]+)?\b/g;
const PROV_WORD = /SIMULATED|OBSERVED|MEASURED|ASSUMED/;

export function bareFigures(root: Element): string[] {
  const clone = root.cloneNode(true) as Element;
  // Form controls hold what the visitor typed (the mandate sentence, a listing), not figures the app asserts.
  clone.querySelectorAll("[data-num],[data-ident],[data-chip],script,style,textarea,input,select").forEach((n) => n.remove());
  // Elements are separate boxes on screen; textContent would glue "exists" and "R9" together and hide the id boundary.
  clone.querySelectorAll("*").forEach((el) => el.append(" "));
  const text = (clone.textContent ?? "").replace(ID_PATTERN, " ");
  const found: string[] = [...text.matchAll(/\d+/g)].map((m) => m[0]);
  const attrFigures = [...root.querySelectorAll("[aria-label],[aria-valuetext],[title]")]
    .flatMap((el) => ["aria-label", "aria-valuetext", "title"].map((a) => el.getAttribute(a) ?? ""))
    .filter((v) => /\d/.test(v.replace(ID_PATTERN, " ")) && !PROV_WORD.test(v));
  return [...found, ...attrFigures.map((v) => `attr:${v}`)];
}

/** Every [data-num] must carry a chip itself, or sit inside a [data-chip-scope] that shows a chip of the same provenance. */
export function numsWithoutChip(root: Element): string[] {
  const missing: string[] = [];
  root.querySelectorAll("[data-num]").forEach((num) => {
    if (num.getAttribute("data-prov") === "UNKNOWN") return;
    if (num.querySelector("[data-chip]")) return;
    const prov = num.getAttribute("data-prov");
    const scope = num.closest("[data-chip-scope]");
    const covered = scope ? [...scope.querySelectorAll(":scope > .chip-scope__chips [data-chip]")].some((c) => c.getAttribute("data-prov") === prov) : false;
    if (!covered) missing.push(num.textContent ?? "");
  });
  return missing;
}

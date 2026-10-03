// What a person can read, for the tests that hold the default (plain) display mode to its promise: no word only engineers
// use, no internal entry kind. Closed disclosures and hidden parts are left out, because nobody reads them until they open.

/** An entry kind the log uses internally, as a word or as the quoted field. */
export const ENTRY_KINDS = /MANDATE_SEALED|MANDATE_REVOKED|PACKET_EXPIRED|CARD_MINTED|CARD_EVENT|"kind"|\bDECISION\b/;

/** Words that mean something only to the people who built it. */
export const ENGINEERS = /\b(mandate|packet|mint(ed|s|ing)?|hash(es)?|JSONL?|payload|checkpoint|delegator|did:key|B0|B1|B2|p50|p95|F38|T-H\d|seed|commit)\b|\bR\d{1,2}\b/i;

/** The text on screen now: closed `<details>`, hidden parts and screen-reader-only text removed, spaces folded. */
export function visibleText(root: ParentNode): string {
  const clone = (root as Element).cloneNode(true) as Element;
  clone.querySelectorAll("details:not([open]) > :not(summary), [hidden], script, style, .sr-only").forEach((n) => n.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ");
}

// Booth limits shared by the page and the server. The scenario buttons themselves live with their screen
// (screens/home/tryCatalog.ts); the presenter's DM walk is booth/presenterScript.ts.

/** Mock-mode ceiling on typed text, far above where the judge truncates (F26). It protects the page, not the policy. */
export const LISTING_TEXT_HARD_CAP = 20_000;

// Booth limits shared by the page and the server. The scenario buttons themselves live with their screen
// (screens/home/tryCatalog.ts); the presenter's DM walk is booth/presenterScript.ts.

/**
 * The longest visitor listing text, in characters: the listing record's own `text` limit (schemas/listing-record.schema.json,
 * maxLength 4000). One constant for the "Product specifications" box, the on-device client and the booth server (server/app.ts), so a
 * longer text is stopped at the box or refused with a calm 400 TEXT_TOO_LONG, instead of reaching a run that the listing check
 * would end with "No card was made". A test pins it to the schema.
 */
export const LISTING_TEXT_HARD_CAP = 4_000;

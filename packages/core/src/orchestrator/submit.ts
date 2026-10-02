// submit: the shopper's request and listing records through the pipeline (pipeline.ts). A DENY by R3 or R4 is
// remembered with its request and listings so "See cheaper options" (alternatives.ts) can replan over the same set.
import type { ListingRecord } from "../generated";
import { formatIssues, validateListingRecord } from "../schema";
import { StepError, sealedOrThrow, type Ctx } from "./context";
import type { Run } from "./events";
import { runPipeline } from "./pipeline";
import { rememberStop } from "./stops";
import type { SubmitRequest, SubmitResult } from "./types";

/** Listing records that pass listing-record.schema.json, at least one, no two with one url. */
export function checkListings(listings: unknown): readonly ListingRecord[] {
  if (!Array.isArray(listings) || listings.length === 0) throw new StepError("INVALID_REQUEST", "no listing records");
  for (const [index, record] of listings.entries()) {
    const checked = validateListingRecord(record);
    if (!checked.ok) throw new StepError("INVALID_REQUEST", `listing ${index} fails listing-record.schema.json: ${formatIssues(checked.errors)}`);
  }
  const records = listings as readonly ListingRecord[];
  if (new Set(records.map((l) => l.url)).size !== records.length) throw new StepError("INVALID_REQUEST", "two listing records share a url");
  return records;
}

export function checkRequestText(text: unknown): string {
  if (typeof text !== "string" || text.trim() === "") throw new StepError("INVALID_REQUEST", "requestText is empty");
  return text;
}

function checkRequest(request: SubmitRequest): { readonly requestText: string; readonly listings: readonly ListingRecord[] } {
  if (request === null || typeof request !== "object") throw new StepError("INVALID_REQUEST", "the request is not an object");
  return { requestText: checkRequestText(request.requestText), listings: checkListings(request.listings) };
}

/** Throws StepError; the caller turns it into an OperationFailure. */
export async function submitSteps(ctx: Ctx, run: Run, request: SubmitRequest): Promise<SubmitResult> {
  const sealed = sealedOrThrow(ctx);
  const { requestText, listings } = checkRequest(request);
  const result = await runPipeline(ctx, run, sealed, { requestText, listings, checkout: request.checkout ?? "none", allowRepeat: request.allowRepeat === true });
  rememberStop(ctx, result, { requestText, listings });
  return result;
}

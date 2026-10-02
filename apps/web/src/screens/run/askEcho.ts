// What the person just asked, so Wally's screen can show it while Wally shops. The Ask field notes the words when it
// sends them; the first run that starts within a short window claims them (so a card pressed later never shows an old
// question). Kept in memory only: nothing is stored or sent anywhere.
import { useState } from "react";

const WINDOW_MS = 20_000;

let pending: { readonly text: string; readonly at: number } | null = null;
const claimed = new Map<string, string>();

export function noteAsk(text: string, at: number = Date.now()): void {
  const trimmed = text.trim();
  pending = trimmed === "" ? null : { text: trimmed, at };
}

/** The words that started this run, or undefined. Idempotent per run id. */
export function claimAsk(runId: string, now: number = Date.now()): string | undefined {
  const known = claimed.get(runId);
  if (known !== undefined) return known;
  if (pending === null || now - pending.at > WINDOW_MS) return undefined;
  claimed.set(runId, pending.text);
  pending = null;
  return claimed.get(runId);
}

/** For the working screen: the question behind this run, fixed at the first render of the run. */
export function useAskEcho(runId: string): string | undefined {
  const [text] = useState(() => claimAsk(runId));
  return text;
}

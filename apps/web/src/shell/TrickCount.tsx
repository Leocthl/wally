// The character counter under "Try to trick Wally". Quiet while the text is short; from 90 percent of the listing limit it shows
// "3,720 / 4,000 characters" in muted text, and at the limit it says so in words (and in the warning colour, never colour alone).
// The figure changes with every key, so it is not a live region. A separate hidden status line says "close to the limit" once when
// the counter first appears and "limit reached" once at the limit, and stays as it is in between, so a screen reader hears two
// short messages and not a count.
import type { ReactElement } from "react";
import { UI } from "../i18n/ui";
import { useLocale } from "../ui/locale";

/** The counter shows from this share of the limit: a presentation threshold, not a rule. */
export const COUNT_FROM_SHARE = 0.9;

export type CountLevel = "quiet" | "near" | "full";

/** How close a text of `length` characters is to `max`: nothing to say, nearly there, or at the limit. */
export function countLevel(length: number, max: number): CountLevel {
  if (length >= max) return "full";
  return length >= Math.ceil(max * COUNT_FROM_SHARE) ? "near" : "quiet";
}

const figure = (n: number): string => n.toLocaleString("en-US");

export function TrickCount({ length, max }: { readonly length: number; readonly max: number }): ReactElement {
  const { t } = useLocale();
  const level = countLevel(length, max);
  const spoken = level === "full" ? t(UI["shell.trickCountFullSay"](figure(max))) : level === "near" ? t(UI["shell.trickCountNear"](figure(max))) : "";
  return (
    <>
      {level === "quiet" ? null : (
        <p className="shell-trick__count" data-trick-count data-level={level}>
          <span data-ident>{t(UI["shell.trickCount"](figure(length), figure(max)))}</span>
          {level === "full" ? <> <span aria-hidden="true">·</span> <span className="shell-trick__count-full">{t(UI["shell.trickCountFull"])}</span></> : null}
        </p>
      )}
      {/* A live region without the status role: the Ask sheet's voice line is its one status (role="status"). */}
      <p className="sr-only" aria-live="polite" aria-atomic="true" data-trick-count-live>{spoken}</p>
    </>
  );
}

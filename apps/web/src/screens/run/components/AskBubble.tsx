// The person's own words, as a bubble on Wally's screen while Wally shops: the question stays in view until the answer
// arrives. Typed text is not a figure the app asserts, so it is marked as an identifier for the figure checks.
import type { ReactElement } from "react";
import { RUNX } from "../../../i18n/runMore";
import { useLocale } from "../../../ui/locale";

/** `still`: no entrance, for the result that replaces the working screen (the words were already there a moment ago). */
export function AskBubble({ text, still = false }: { readonly text: string; readonly still?: boolean }): ReactElement {
  const { t } = useLocale();
  return (
    <figure className="run-bubble" {...(still ? { "data-still": "true" } : {})}>
      <figcaption className="run-bubble__who">{t(RUNX.youAsked)}</figcaption>
      <blockquote className="run-bubble__text" data-ident data-selectable>{text}</blockquote>
    </figure>
  );
}

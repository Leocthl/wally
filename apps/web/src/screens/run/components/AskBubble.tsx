// The person's own words, as a bubble on Wally's screen while Wally shops: the question stays in view until the answer
// arrives. Typed text is not a figure the app asserts, so it is marked as an identifier for the figure checks.
import type { ReactElement } from "react";
import { RUNX } from "../../../i18n/runMore";
import { useLocale } from "../../../ui/locale";

export function AskBubble({ text }: { readonly text: string }): ReactElement {
  const { t } = useLocale();
  return (
    <figure className="run-bubble">
      <figcaption className="run-bubble__who">{t(RUNX.youAsked)}</figcaption>
      <blockquote className="run-bubble__text" data-ident data-selectable>{text}</blockquote>
    </figure>
  );
}

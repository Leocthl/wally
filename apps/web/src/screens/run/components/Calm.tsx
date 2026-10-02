// The quiet states: idle (Wally ready, one invitation), no clear pick, an error, or a step that only reused an earlier
// card. One title, one line, one action; nothing alarming, and never a blank screen.
import type { ReactElement, Ref } from "react";
import type { LabelPair } from "../../../i18n/label";
import { UI } from "../../../i18n/ui";
import { Button } from "../../../ui/Button";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { Wally, type WallyState } from "../../../wally/Wally";

const R = UI.run;

export type CalmKind = "idle" | "noPick" | "error" | "info";

const COPY: Readonly<Record<CalmKind, { readonly title: LabelPair; readonly body: LabelPair; readonly wally: WallyState }>> = {
  idle: { title: R.idleTitle, body: R.idleBody, wally: "idle" },
  noPick: { title: R.noPickTitle, body: R.noPickBody, wally: "thinking" },
  error: { title: R.errorTitle, body: R.errorBody, wally: "offline" },
  info: { title: R.infoTitle, body: R.infoBody, wally: "idle" },
};

export function Calm({ kind, onAsk, headingRef }: { readonly kind: CalmKind; readonly onAsk: () => void; readonly headingRef?: Ref<HTMLHeadingElement> }): ReactElement {
  const { t } = useLocale();
  const copy = COPY[kind];
  return (
    <section className="run-calm" data-run-state={kind} role={kind === "error" ? "alert" : undefined}>
      <Wally state={copy.wally} size={kind === "idle" ? 132 : 112} decorative />
      <h2 className="run-calm__title" tabIndex={-1} ref={headingRef}>{t(copy.title)}</h2>
      <p className="run-calm__body">{t(copy.body)}</p>
      <Button size="lg" onClick={onAsk} icon={<Icon name="sparkle" size={20} />} className="run-calm__action">{t(R.ask)}</Button>
    </section>
  );
}

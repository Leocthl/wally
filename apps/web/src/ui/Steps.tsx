// Steps: what Wally is doing, one line per step ("Picked an item", "Read the listing", "Checked your rules",
// "Made a one-off card"). Status is an icon plus hidden words, so it never depends on colour.
import type { ReactElement, ReactNode } from "react";
import "../design/ui/feedback.css";
import { label } from "../i18n/label";
import { Icon } from "./icons";
import { useLocale } from "./locale";

export type StepStatus = "done" | "now" | "waiting" | "stop";

export interface StepItem {
  readonly id: string;
  readonly title: string;
  readonly detail?: ReactNode;
  /** Quiet trailing text such as a latency ("0.4 s") with its chip. */
  readonly time?: ReactNode;
  readonly status: StepStatus;
}

const SPOKEN = {
  done: label("Done", "完成"), // NEEDS-REVIEW
  now: label("In progress", "進行中"), // NEEDS-REVIEW
  waiting: label("Waiting", "等候中"), // NEEDS-REVIEW
  stop: label("Stopped", "已攔截"), // NEEDS-REVIEW
} as const;

function Disc({ status }: { readonly status: StepStatus }): ReactElement {
  if (status === "done") return <Icon name="check" size={18} strokeWidth={2.6} />;
  if (status === "stop") return <Icon name="hand" size={18} />;
  if (status === "now") return <Icon name="clock" size={16} />;
  return <span aria-hidden="true" className="w-step__dot" />;
}

export function Steps({ items, label: name }: { readonly items: readonly StepItem[]; readonly label: string }): ReactElement {
  const { t } = useLocale();
  return (
    <ol className="w-steps" aria-label={name}>
      {items.map((s) => (
        <li key={s.id} className="w-step" data-status={s.status} aria-current={s.status === "now" ? "step" : undefined}>
          <span className="w-step__disc"><Disc status={s.status} /></span>
          <span className="w-step__text">
            <span className="w-step__title">{s.title}<span className="sr-only">, {t(SPOKEN[s.status])}</span></span>
            {s.detail ? <span className="w-step__detail">{s.detail}</span> : null}
          </span>
          {s.time ? <span className="w-step__time">{s.time}</span> : <span />}
        </li>
      ))}
    </ol>
  );
}

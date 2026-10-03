// Building blocks of the plain Evidence cards: a figure that wears its card's chip, a sentence whose slots are such
// figures, and the scope that shows the chip once in plain words ("Measured on 150 practice purchases"), tappable for
// what that means. The DOM keeps the contract of the honesty tests: every [data-num] sits in a [data-chip-scope] whose
// direct .chip-scope__chips child holds a [data-chip] of the same kind.
import { useId, useState, type ElementType, type ReactElement, type ReactNode } from "react";
import { IconTick } from "../../../components/icons";
import type { LabelPair } from "../../../i18n/label";
import { cx } from "../../../ui/cx";
import { CHIP_CLASS, chipSampleSize, type FileChip } from "../../chip";
import { chipDetails, chipLabel, type Sentence } from "../../explainPlain";
import { P } from "../../plainStrings";
import { Tx, TxFill } from "../Tx";

/** A figure under a plain scope: no chip of its own, the scope's chip says where it came from. */
export function PlainNum({ chip, children }: { readonly chip: FileChip; readonly children: ReactNode }): ReactElement {
  return (
    <span className="num evp-num" data-num data-prov={chip.kind}>
      <span className="num__v">{children}</span>
    </span>
  );
}

/** A glossary sentence with every slot a chipped figure. */
export function FilledSentence({ s, chip, as, className }: { readonly s: Sentence; readonly chip: FileChip; readonly as?: "span" | "p" | "div"; readonly className?: string }): ReactElement {
  const slots = Object.fromEntries(Object.entries(s.slots).map(([name, value]) => [name, <PlainNum key={name} chip={chip}>{value}</PlainNum>]));
  return <TxFill text={s.text} slots={slots} {...(as ? { as } : {})} {...(className ? { className } : {})} />;
}

/** Same plain words means the same chip: two rates with one label show it once. */
function distinct(chips: readonly FileChip[]): readonly FileChip[] {
  const seen = new Set<string>();
  return chips.filter((c) => {
    const key = `${c.kind}:${chipSampleSize(c) ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ChipButton({ chip, open, controls, onToggle }: { readonly chip: FileChip; readonly open: boolean; readonly controls: string; readonly onToggle: () => void }): ReactElement {
  return (
    <button type="button" className="evp-chipbtn" aria-expanded={open} aria-controls={controls} onClick={onToggle}>
      <span className={CHIP_CLASS[chip.kind]} data-chip data-prov={chip.kind}>
        {chip.kind === "MEASURED" ? <IconTick /> : null}
        <span className="chip__text"><Tx text={chipLabel(chip.kind, chipSampleSize(chip))} /></span>
      </span>
      <span className="evp-chipbtn__hint"><Tx text={P.tapDetails} /></span>
    </button>
  );
}

export interface PlainScopeProps {
  /** The chips of every figure inside; equal ones are shown once. */
  readonly chips: readonly FileChip[];
  readonly className?: string;
  readonly as?: "div" | "article" | "section";
  /** Id of the heading that names this block. */
  readonly labelledBy?: string;
  /** Which card this is (data-plain-card), for tests and styling. */
  readonly card?: string;
  readonly children: ReactNode;
}

export function PlainScope({ chips, className, as = "div", labelledBy, card, children }: PlainScopeProps): ReactElement {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const shown = distinct(chips);
  const kinds = [...new Set(shown.map((c) => c.kind))];
  const Tag = as as ElementType;
  return (
    <Tag className={cx("chip-scope evp-scope", className)} data-chip-scope aria-labelledby={labelledBy} data-plain-card={card}>
      {children}
      <span className="chip-scope__chips evp-chips">
        {shown.map((c) => (
          <ChipButton key={`${c.kind}:${chipSampleSize(c) ?? ""}`} chip={c} open={open} controls={panel} onToggle={() => setOpen((o) => !o)} />
        ))}
      </span>
      <div id={panel} className="evp-chipdetail" hidden={!open}>
        {kinds.map((kind) => <Tx key={kind} as="p" text={chipDetails(kind)} />)}
      </div>
    </Tag>
  );
}

/** Marks a card whose figures come from a file that is not product evidence yet. */
export function WiringStamp({ on }: { readonly on: boolean }): ReactElement | null {
  return on ? <p className="ev-stamp" data-wiring-stamp><Tx text={P.wiringStamp} /></p> : null;
}

/**
 * A card behind its title, closed to begin with: the page opens on the headline and a short list, and a person opens the one
 * thing they want to check. The card keeps its chips and its numbers inside; nothing is left out, only folded.
 */
export function PlainFold({ id, title, children }: { readonly id: string; readonly title: LabelPair; readonly children: ReactNode }): ReactElement {
  return (
    <details className="evp-fold" data-fold={id}>
      <summary className="evp-fold__summary"><Tx text={title} /></summary>
      <div className="evp-fold__body">{children}</div>
    </details>
  );
}

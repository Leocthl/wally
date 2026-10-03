// "Whose money?" in the Seal flow (family budget). It appears only when the booth offers family budgets
// (info.features.family and api.family). My own budget is the default and changes nothing. Mum's budget shows what she
// allows as the ceiling, caps the amount field with a plain inline message, and seals the budget as the shopper's share of
// Mum's (SealRequest.family). Mum's rules are checked again when the budget is sealed; this screen only helps the shopper
// see the ceiling first, and never loosens it.
import { useEffect, useId, useState, type ReactElement } from "react";
import type { FamilySummary, SealRequest } from "../../api/types";
import { formatHkd } from "../../domain/money";
import { SIMULATED } from "../../domain/provenance";
import { useBoothContext } from "../../hooks/useBooth";
import { PARAM, useRouteParam } from "../../hooks/useRoute";
import { UI } from "../../i18n/ui";
import { Icon } from "../../ui/icons";
import { useLocale, type Locale } from "../../ui/locale";
import { Segmented } from "../../ui/Nav";
import { Card } from "../../ui/Surface";
import { Fig, Fill, fillText, Money } from "../../shell/figures";
import { formatDay } from "../../shell/format";
import { categoryName } from "../home/BudgetHero";
import { moneyOf, type FieldName } from "./sealModel";
import "./family.css";

const F = UI.family;
const PROV = SIMULATED;

export type Source = "own" | "mum";

export interface FamilySeal {
  /** The choice and, for Mum's budget, the ceiling card. null when the booth has no family budget. */
  readonly choice: ReactElement | null;
  /** The budget will be sealed under Mum's. */
  readonly mum: boolean;
  /** The typed amount is more than Mum allows: Next must not go on. */
  readonly over: boolean;
  /** Words shown beside a field at once (the amount, when it is over what Mum allows). */
  readonly notes: Partial<Record<FieldName, string>>;
  /** The request to send: with { family } when the budget is Mum's, otherwise exactly as given. */
  readonly apply: (req: SealRequest) => SealRequest;
}

function things(slugs: readonly string[], t: ReturnType<typeof useLocale>["t"], locale: Locale): string {
  const names = slugs.map((s) => categoryName(s, t)).join(t(UI["home.listJoin"]));
  return locale === "en" ? names.toLowerCase() : names;
}

function Ceiling({ summary }: { readonly summary: FamilySummary }): ReactElement {
  const { t, locale } = useLocale();
  return (
    <>
      <p className="seal-family__ceiling">
        <Fill
          text={t(F.ceiling)}
          slots={{
            amount: <Money minor={summary.ceilingMinor} prov={PROV} />,
            things: things(summary.categories, t, locale),
            until: <Fig prov={PROV} kind="time">{formatDay(summary.validUntil, locale)}</Fig>,
          }}
        />
      </p>
      <p className="seal-family__note">{t(F.ceilingNote)}</p>
    </>
  );
}

export interface FamilyChoiceProps {
  readonly source: Source;
  readonly onChange: (source: Source) => void;
  readonly summary: FamilySummary | null;
  readonly failed: boolean;
}

export function FamilyChoice({ source, onChange, summary, failed }: FamilyChoiceProps): ReactElement {
  const { t } = useLocale();
  const titleId = useId();
  return (
    <section className="seal-family" aria-labelledby={titleId} data-family-choice>
      <h2 id={titleId} className="seal-family__title">{t(F.whose)}</h2>
      <Segmented<Source>
        label={t(F.whose)}
        size="md"
        value={source}
        onChange={onChange}
        className="seal-family__seg"
        options={[
          { value: "own", label: t(F.own) },
          { value: "mum", label: t(F.mum) },
        ]}
      />
      {source === "mum" ? (
        <Card tone="info" padding="md" className="seal-family__card" role="status" data-family-card>
          <span className="seal-family__icon" aria-hidden="true"><Icon name="shieldCheck" size={20} /></span>
          <div className="seal-family__text">
            {summary ? <Ceiling summary={summary} /> : <p className="seal-family__ceiling">{t(failed ? F.unavailable : F.loading)}</p>}
          </div>
        </Card>
      ) : null}
    </section>
  );
}

export interface FamilySealOptions {
  /** Start on my own budget even when the budget now held is Mum's (a first budget replaces it; it does not top it up). */
  readonly startOwn?: boolean;
}

/**
 * The family choice for the Seal screen. `amountText` is the amount field as typed. A budget that is already Mum's starts
 * on Mum's (Top up and Change the rules keep its source); everything else starts on my own budget.
 */
export function useFamilySeal(amountText: string, { startOwn = false }: FamilySealOptions = {}): FamilySeal {
  const { api, info, state } = useBoothContext();
  const { t } = useLocale();
  const mode = useRouteParam(PARAM.mode);
  const available = info?.features?.family === true && typeof api.family === "function";
  const [source, setSource] = useState<Source>(() => (!startOwn && mode !== "welcome" && state.mandate?.parent !== undefined ? "mum" : "own"));
  const [summary, setSummary] = useState<FamilySummary | null>(null);
  const [failed, setFailed] = useState(false);
  const mum = available && source === "mum";

  useEffect(() => {
    if (!mum || summary !== null) return undefined;
    let alive = true;
    setFailed(false);
    void api.family?.().then(
      (s) => alive && setSummary(s),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [mum, summary, api]);

  const cap = mum && summary !== null ? summary.ceilingMinor : null;
  const typed = moneyOf(amountText);
  const over = cap !== null && typed !== null && typed > cap;
  return {
    choice: available ? <FamilyChoice source={source} onChange={setSource} summary={summary} failed={failed} /> : null,
    mum,
    over,
    notes: over && cap !== null ? { amount: fillText(t(F.overCap), { cap: formatHkd(cap) }) } : {},
    apply: (req) => (mum ? { ...req, family: { parent: "mum" } } : req),
  };
}

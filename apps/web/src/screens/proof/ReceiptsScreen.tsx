// #/receipts: the signed log as a friendly list, newest first and grouped by Hong Kong day, with filter chips and a
// detail sheet per receipt. #/receipts?d=<decisionId> opens that decision's sheet. Reads the log as it is shown, the same
// copy Proof shows: while the tamper demo's changed copy is up, a banner at the top says so and puts the original back,
// and the changed receipt is tagged "Changed". Every amount and time sits under one SIMULATED chip unless its cart says otherwise.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { ChipScope } from "../../components/ChipScope";
import { NumText } from "../../components/Num";
import { SIMULATED } from "../../domain/provenance";
import { useBoothContext } from "../../hooks/useBooth";
import { receiptHref } from "../../hooks/useRoute";
import { UI } from "../../i18n/ui";
import { useDisplayMode } from "../../state/displayMode";
import { EmptyState } from "../../ui/EmptyState";
import { useLocale, type Locale } from "../../ui/locale";
import { TopBar } from "../../ui/Nav";
import { List, Skeleton } from "../../ui/Surface";
import { FilterChips, type FilterOption } from "./components/FilterChips";
import { PurchaseRow } from "./components/PurchaseRow";
import { ReceiptRow } from "./components/ReceiptRow";
import { ReceiptSheet } from "./components/ReceiptSheet";
import { TamperedBanner } from "./components/TamperedBanner";
import { asSingles, countItemsByFilter, groupPurchases, itemMatchesFilter, itemsNewestFirst } from "./purchases";
import { dayLabel, decisionFromHash, groupConsecutiveByDay, receiptForDecision, RECEIPT_FILTERS, type Receipt, type ReceiptFilter } from "./receipts";
import { useStableReceipts } from "./useStableReceipts";
import "./proof.css";
import "./proofPlain.css";

const R = UI.receipts;
const FILTER_LABEL = { all: R.all, approved: R.approved, stopped: R.stopped, needsOk: R.needsOk, cards: R.cards } as const;

function replaceHash(hash: string): void {
  if (window.location.hash !== hash) window.history.replaceState(window.history.state, "", hash);
}

function DayTitle({ dayKey, locale, now }: { readonly dayKey: string; readonly locale: Locale; readonly now: Date }): ReactElement {
  const { t } = useLocale();
  const label = dayLabel(dayKey, now);
  if (label.kind === "unknown") return <span className="mono" data-ident>{dayKey}</span>;
  if (label.kind !== "date") return <>{t(label.kind === "today" ? R.today : R.yesterday)}</>;
  const text =new Intl.DateTimeFormat(locale === "zh-HK" ? "zh-HK" : "en-HK", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Hong_Kong" }).format(label.date);
  return <NumText text={text} prov={SIMULATED} chip="scope" kind="time" />;
}

function useDeepLink(receipts: readonly Receipt[], open: (seq: number) => void): { readonly clear: () => void } {
  const [wanted, setWanted] = useState<string | null>(() => decisionFromHash(window.location.hash));
  useEffect(() => {
    const onHash = (): void => setWanted(decisionFromHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    if (wanted === null) return;
    const found = receiptForDecision(receipts, wanted);
    if (found) open(found.seq);
  }, [wanted, receipts, open]);
  return { clear: useCallback(() => setWanted(null), []) };
}

export function ReceiptsScreen(): ReactElement {
  const booth = useBoothContext();
  const { state, busy, api } = booth;
  const { t, locale } = useLocale();
  const [mode] = useDisplayMode();
  const plain = mode === "plain";
  // What is shown: the stored log, or the changed copy while the tamper demo is up (the banner and the tags say which).
  const entries = state.log.shown;
  const changedSeq = state.log.tampered?.seq ?? null;
  const [restoring, setRestoring] = useState(false);
  const restore = async (): Promise<void> => {
    setRestoring(true);
    try {
      await booth.restore();
    } finally {
      setRestoring(false);
    }
  };
  const receipts = useStableReceipts(entries);
  // Plain mode lists a purchase once, with its receipts as the steps under it; developer mode lists every signed receipt.
  const rows = useMemo(() => itemsNewestFirst(plain ? groupPurchases(receipts) : asSingles(receipts)), [plain, receipts]);
  const counts = useMemo(() => countItemsByFilter(rows), [rows]);
  const [filter, setFilter] = useState<ReceiptFilter>("all");
  const days = useMemo(() => groupConsecutiveByDay(rows.filter((row) => itemMatchesFilter(row, filter))), [rows, filter]);
  const options = useMemo<readonly FilterOption[]>(() => RECEIPT_FILTERS.map((id) => ({ id, label: FILTER_LABEL[id], count: counts[id] })), [counts]);

  const [openSeq, setOpenSeq] = useState<number | null>(null);
  const [shownSeq, setShownSeq] = useState<number | null>(null);
  const latest = useRef(receipts);
  latest.current = receipts;
  const open = useCallback((seq: number) => {
    setOpenSeq(seq);
    setShownSeq(seq);
    const id = latest.current.find((r) => r.seq === seq)?.decisionId;
    if (id) replaceHash(receiptHref(id));
  }, []);
  const deepLink = useDeepLink(receipts, open);
  const close = useCallback(() => {
    setOpenSeq(null);
    deepLink.clear();
    if (decisionFromHash(window.location.hash) !== null) replaceHash("#/receipts");
  }, [deepLink]);
  const openDecision = useCallback((id: string) => {
    const found = receiptForDecision(latest.current, id);
    if (found) open(found.seq);
  }, [open]);

  const shown = shownSeq === null ? null : (receipts.find((r) => r.seq === shownSeq) ?? null);
  const shownEntry = shownSeq === null ? null : (entries.find((e) => e.seq === shownSeq) ?? null);
  const now = new Date();

  return (
    <div className="rc-screen" lang={locale} data-screen="receipts">
      <TamperedBanner onRestore={() => void restore()} restoring={restoring} />
      <TopBar large title={t(R.title)} />
      {entries.length === 0 ? (
        busy ? (
          <div className="rc-loading" aria-busy="true" aria-label={t(R.loading)}><Skeleton lines={4} height="3.5rem" radius="md" /></div>
        ) : (
          <EmptyState title={t(R.emptyTitle)} body={t(R.emptyBody)} wally="idle" />
        )
      ) : (
        <>
          <p className="rc-lead">{t(R.lead)}</p>
          <FilterChips options={options} value={filter} onChange={setFilter} label={t(R.filterLabel)} />
          {days.length === 0 ? (
            <EmptyState title={t(R.emptyFilter)} wally="idle" size={88} action={<button type="button" className="w-btn w-btn--ghost w-btn--sm" onClick={() => setFilter("all")}><span className="w-btn__label">{t(R.showAll)}</span></button>} />
          ) : (
            days.map((day) => (
              <section key={day.key} className="rc-day" aria-labelledby={`rc-day-${day.key}`}>
                <ChipScope provs={[SIMULATED]} className="rc-day__scope" chipsClassName="rc-day__chips">
                  <h2 id={`rc-day-${day.key}`} className="rc-day__title"><DayTitle dayKey={day.key} locale={locale} now={now} /></h2>
                  <List inset className="rc-list">
                    {day.list.map((row) =>
                      row.kind === "purchase" ? (
                        <PurchaseRow key={`purchase-${row.purchase.id}`} purchase={row.purchase} ts={row.ts} onOpen={open} changedSeq={changedSeq} />
                      ) : (
                        <ReceiptRow key={row.receipt.seq} receipt={row.receipt} onOpen={open} plain={plain} flagged={row.receipt.seq === changedSeq} />
                      ),
                    )}
                  </List>
                </ChipScope>
              </section>
            ))
          )}
        </>
      )}
      <ReceiptSheet open={openSeq !== null} receipt={shown} entry={shownEntry} onClose={close} onOpenDecision={openDecision} api={api.kind} plain={plain} changed={shown !== null && shown.seq === changedSeq} />
    </div>
  );
}

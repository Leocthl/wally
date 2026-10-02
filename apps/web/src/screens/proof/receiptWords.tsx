// Receipts in words: the icon, tone, state label, title and one-line summary for each receipt, in the current language.
// Stops and escalations render from the rule template and the recorded inputs (never prose), with a chip per figure.
import type { ReactElement, ReactNode } from "react";
import type { LogEntry } from "../../api/types";
import { NumText, Num } from "../../components/Num";
import { judgeProv, observed, SIMULATED, type Prov } from "../../domain/provenance";
import { formatHkDateTime, formatHkTime } from "../../domain/time";
import { annotate, figureContext } from "../../explain/figures";
import { renderStop } from "../../explain/renderStop";
import type { LabelPair } from "../../i18n/label";
import { UI } from "../../i18n/ui";
import type { IconName } from "../../ui/icons";
import type { Locale } from "../../ui/locale";
import { Fill } from "./components/Fill";
import type { Receipt, ReceiptState } from "./receipts";

const R = UI.receipts;

export type ReceiptTone = "primary" | "ok" | "stop" | "warn" | "neutral";

export const STATE_META: Readonly<Record<ReceiptState, { readonly label: LabelPair; readonly icon: IconName; readonly tone: ReceiptTone }>> = {
  sealed: { label: R.stateSealed, icon: "lock", tone: "primary" },
  approved: { label: R.stateApproved, icon: "checkCircle", tone: "ok" },
  stopped: { label: R.stateStopped, icon: "hand", tone: "stop" },
  needsOk: { label: R.stateNeedsOk, icon: "clock", tone: "warn" },
  cardMade: { label: R.stateCardMade, icon: "card", tone: "primary" },
  paid: { label: R.statePaid, icon: "card", tone: "ok" },
  declined: { label: R.stateDeclined, icon: "card", tone: "stop" },
  voided: { label: R.stateVoided, icon: "card", tone: "neutral" },
  cardExpired: { label: R.stateCardExpired, icon: "clock", tone: "neutral" },
  revoked: { label: R.stateRevoked, icon: "close", tone: "neutral" },
  expired: { label: R.stateExpired, icon: "clock", tone: "neutral" },
};

/** "10:05" in Hong Kong time; empty when the timestamp cannot be read (never throws in a list). */
export function shortTime(iso: string): string {
  try {
    return formatHkTime(iso).slice(0, 5);
  } catch {
    return "";
  }
}

/** "2026-10-03 10:05" in Hong Kong time; empty when unreadable. */
export function longTime(iso: string): string {
  try {
    return formatHkDateTime(iso);
  } catch {
    return "";
  }
}

/** A cart amount carries the cart's own tag; amounts that are not a cart (budget, card limit, charge) are SIMULATED. */
export function amountProv(r: Receipt): Prov {
  return r.cartProvenance === "OBSERVED" && r.priceObservedAt ? observed(r.priceObservedAt, "listing capture") : SIMULATED;
}

type T = (text: LabelPair) => string;

const SIM_SUFFIX = /\s*\(SIMULATED\)\s*$/i;

/** List rows drop a fixture's trailing "(SIMULATED)": the day header carries the SIMULATED chip. The sheet keeps names verbatim. */
export function compactName(name: string): string {
  const short = name.replace(SIM_SUFFIX, "");
  return short === "" ? name : short;
}

/** Plain title: "merchant · item" for decisions, the event in words otherwise. compact: list rows. */
export function receiptTitle(r: Receipt, t: T, compact = false): ReactNode {
  const name = (s: string | null): string => (s === null ? "" : compact ? compactName(s) : s);
  const shop = (x: Receipt): string => name(x.merchant);
  switch (r.state) {
    case "approved":
    case "stopped":
    case "needsOk": {
      // The shop's own names ("Ankle socks, 3 pairs") are data, not figures the app asserts.
      const head = <span data-ident>{[name(r.merchant), name(r.item)].filter(Boolean).join(" · ")}</span>;
      return r.moreItems > 0 ? <>{head} <Fill text={t(R.moreItems)} slots={{ n: <span data-ident>{r.moreItems}</span> }} /></> : head;
    }
    case "sealed":
      return t(R.titleSealed);
    case "cardMade":
      return <Fill text={t(R.titleCardFor)} slots={{ shop: shop(r) }} />;
    case "paid":
      return <Fill text={t(R.titlePaid)} slots={{ shop: shop(r) }} />;
    case "declined":
      return <Fill text={t(R.titleDeclined)} slots={{ shop: shop(r) }} />;
    case "voided":
      return t(R.titleVoided);
    case "cardExpired":
      return t(R.titleCardExpired);
    case "revoked":
      return t(R.titleRevoked);
    case "expired":
      return t(R.titleExpired);
  }
}

const DECLINE_WORDS: Readonly<Record<string, LabelPair>> = {
  OVER_LIMIT: R.declineOverLimit,
  CARD_USED: R.declineCardUsed,
  CARD_VOIDED: R.declineCardVoided,
  CARD_EXPIRED: R.declineCardExpired,
  UNKNOWN_HANDLE: R.declineUnknownCard,
  MERCHANT_MISMATCH: R.declineMerchant,
};

export function declineWords(code: string | null): LabelPair {
  return (code !== null ? DECLINE_WORDS[code] : undefined) ?? R.declineOther;
}

/** A rule template sentence with every figure chipped (the same contract as StopBanner, one language). */
export function TemplateSentence({ templateId, inputs, locale, prov, judge, api }: {
  readonly templateId: string;
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly locale: Locale;
  readonly prov: Prov;
  readonly judge: string;
  readonly api: string;
}): ReactElement {
  const ctx = figureContext({ api: api === "mock" ? "mock" : "http", money: prov, judge: judgeProv(judge) });
  const text = renderStop(templateId as Parameters<typeof renderStop>[0], inputs, locale);
  return (
    <>
      {annotate(text, inputs, ctx).map((s, i) => (s.figure ? <NumText key={i} text={s.text} prov={s.prov} chip="scope" /> : <span key={i}>{s.text}</span>))}
    </>
  );
}

/** A money figure; its chip shows inline unless an enclosing scope already shows the same one. */
export function money(minor: number | null, prov: Prov): ReactNode {
  return minor === null ? null : <Num kind="money" value={minor} prov={prov} chip="scope" />;
}

/** One-sentence summary for the detail sheet. */
export function receiptSummary(r: Receipt, entry: LogEntry, t: T, locale: Locale, api: string): ReactNode {
  const prov = amountProv(r);
  switch (r.state) {
    case "approved":
      return <Fill text={t(R.bodyApproved)} slots={{ amount: money(r.amountMinor, prov) }} />;
    case "stopped":
    case "needsOk": {
      if (entry.kind !== "DECISION" || !entry.payload.explanation) return t(STATE_META[r.state].label);
      const { template_id, inputs } = entry.payload.explanation;
      return <TemplateSentence templateId={template_id} inputs={inputs} locale={locale} prov={prov} judge={entry.payload.judge.provider} api={api} />;
    }
    case "sealed":
      return <Fill text={t(R.bodySealed)} slots={{ amount: money(r.amountMinor, prov) }} />;
    case "cardMade":
      return <Fill text={t(R.bodyCardMade)} slots={{ amount: money(r.amountMinor, prov) }} />;
    case "paid":
      return <Fill text={t(R.bodyPaid)} slots={{ amount: money(r.amountMinor, prov) }} />;
    case "declined":
      return t(declineWords(r.declineCode));
    case "voided":
      return t(R.bodyVoided);
    case "cardExpired":
      return t(R.bodyCardExpired);
    case "revoked":
      return t(R.bodyRevoked);
    case "expired":
      return t(R.bodyExpired);
  }
}

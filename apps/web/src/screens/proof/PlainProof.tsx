// #/proof in plain mode, the default. A person should get it in ten seconds: the screen checks the receipts the moment it
// opens, so the first thing shown is a verdict ("All 4 receipts are untouched"); under it the way to try a changed copy,
// then every receipt in order and in words. Fingerprints, signers and the failed check's code live only in a receipt's
// "Show the details"; the raw receipt (its JSON and kind) only in developer mode. The stored receipts are never changed by
// anything on this screen, and the words say so. A changed copy is flagged by a banner at the very top.
import { useMemo, useState, type ReactElement } from "react";
import { useBoothContext } from "../../hooks/useBooth";
import { UI } from "../../i18n/ui";
import { IconButton } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { TopBar } from "../../ui/Nav";
import { List, ListRow } from "../../ui/Surface";
import { PlainDemo } from "./components/PlainDemo";
import { PlainHowSheet } from "./components/PlainSheets";
import { PlainStatusCard } from "./components/PlainStatusCard";
import { PlainTimeline } from "./components/PlainTimeline";
import { ProofFooter, demoShortcut } from "./components/ProofFooter";
import { ExportSheet, exporterOf, VERIFIER_HREF } from "./components/ProofSheets";
import { TamperedBanner } from "./components/TamperedBanner";
import { PLAIN } from "./plainStrings";
import { useProofCheck } from "./useProofCheck";
import "./proof.css";
import "./proofPlain.css";

const P = UI.proof;

export function PlainProof(): ReactElement {
  const booth = useBoothContext();
  const { state, info, api, busy } = booth;
  const { t, locale } = useLocale();
  const check = useProofCheck(booth);
  const [how, setHow] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exporter = useMemo(() => exporterOf(api), [api]);
  const log = state.log;

  return (
    <div className="pf-screen pf-screen--plain" lang={locale} data-screen="proof" data-mode="plain">
      <TamperedBanner onRestore={check.restore} restoring={check.action === "restore"} />
      <TopBar large title={t(P.title)} actions={<IconButton label={t(P.how)} icon={<Icon name="info" />} onClick={() => setHow(true)} />} />
      <p className="pf-lead">{t(PLAIN.lead)}</p>
      {log.entries.length === 0 ? (
        <EmptyState title={t(P.emptyTitle)} body={t(P.emptyBody)} wally="idle" />
      ) : (
        <>
          <PlainStatusCard status={check.status} outcome={check.outcome} count={log.shown.length} stale={check.stale} apiKind={api.kind} busy={busy} onCheck={check.verify} />
          <PlainDemo changed={log.tampered} action={check.action} busy={busy} onTamper={check.tamper} onRestore={check.restore} />
          <PlainTimeline entries={log.shown} outcome={check.outcome} status={check.status} />
        </>
      )}
      <List inset className="pf-links" label={t(P.title)}>
        <ListRow leading={<Icon name="info" />} title={t(P.how)} chevron onClick={() => setHow(true)} />
        <ListRow leading={<Icon name="shieldCheck" />} title={t(PLAIN.openChecker)} chevron href={VERIFIER_HREF} />
        {exporter ? <ListRow leading={<Icon name="download" />} title={t(PLAIN.saveCopy)} chevron onClick={() => setExportOpen(true)} /> : null}
        <ListRow leading={<Icon name="sparkle" />} title={t(P.whyTrust)} chevron href="#/evidence" />
      </List>
      <ProofFooter plain showDemoKey={demoShortcut(info)} onDevice={api.kind !== "http"} />
      <PlainHowSheet open={how} onClose={() => setHow(false)} />
      {exporter ? <ExportSheet plain open={exportOpen} onClose={() => setExportOpen(false)} exporter={exporter} /> : null}
    </div>
  );
}

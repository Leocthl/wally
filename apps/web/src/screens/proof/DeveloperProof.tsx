// #/proof in developer mode: the screen as it was before the plain view. One calm card that checks every receipt
// (api.verify), "Try to tamper" on a COPY (api.tamper) and Restore (api.restore), each followed by a fresh check, then how it
// works, the offline verifier, export and the evidence page. It checks only when asked, shows entry counts, hashes and
// reason codes, and keeps `#seq` numbering. The stored receipts are never changed by anything on this screen; while a changed
// copy is shown, a banner at the top says so and puts the original back in one tap.
import { useMemo, useState, type ReactElement } from "react";
import { useBoothContext } from "../../hooks/useBooth";
import { UI } from "../../i18n/ui";
import { Button, IconButton } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { TopBar } from "../../ui/Nav";
import { Card, List, ListRow } from "../../ui/Surface";
import { ProofFooter, demoShortcut } from "./components/ProofFooter";
import { ExportSheet, exporterOf, HowSheet, VERIFIER_HREF } from "./components/ProofSheets";
import { TamperedBanner } from "./components/TamperedBanner";
import { VerifyCard, type ProofStatus } from "./components/VerifyCard";
import "./proof.css";

const P = UI.proof;

type Action = "verify" | "tamper" | "restore";

export function DeveloperProof(): ReactElement {
  const booth = useBoothContext();
  const { state, verifyOutcome, info, api, busy } = booth;
  const { t, locale } = useLocale();
  const [action, setAction] = useState<Action | null>(null);
  const [checkedTampered, setCheckedTampered] = useState<boolean | null>(null);
  const [how, setHow] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exporter = useMemo(() => exporterOf(api), [api]);
  const log = state.log;
  const tampered = log.tampered;

  const run = async (kind: Action, task: () => Promise<void>): Promise<void> => {
    setAction(kind);
    try {
      await task();
    } finally {
      setAction(null);
    }
  };
  const verify = (): Promise<void> => run("verify", async () => {
    setCheckedTampered(tampered !== null);
    await booth.verify();
  });
  const tamper = (): Promise<void> => run("tamper", async () => {
    await booth.tamper();
    setCheckedTampered(true);
    await booth.verify();
  });
  const restore = (): Promise<void> => run("restore", async () => {
    await booth.restore();
    setCheckedTampered(false);
    await booth.verify();
  });

  const result = verifyOutcome?.result ?? null;
  const status: ProofStatus = action !== null ? "checking" : result === null ? "idle" : result.ok ? "pass" : "fail";
  const stale = result !== null && action === null && ((result.ok && log.head !== null && result.head.seq !== log.head.seq) || (checkedTampered !== null && checkedTampered !== (tampered !== null)));
  const onDevice = api.kind !== "http";

  return (
    <div className="pf-screen" lang={locale} data-screen="proof">
      <TamperedBanner onRestore={() => void restore()} restoring={action === "restore"} />
      <TopBar large title={t(P.title)} actions={<IconButton label={t(P.how)} icon={<Icon name="info" />} onClick={() => setHow(true)} />} />
      <p className="pf-lead">{t(P.lead)}</p>
      {log.entries.length === 0 ? (
        <EmptyState title={t(P.emptyTitle)} body={t(P.emptyBody)} wally="idle" />
      ) : (
        <>
          <VerifyCard status={status} outcome={verifyOutcome} shownCount={log.shown.length} head={log.head} tampered={tampered} stale={stale} apiKind={api.kind} busy={busy} onVerify={() => void verify()} />
          {tampered ? (
            <Card tone="info" className="pf-copy" data-tampered-copy>
              <Icon name="info" size={20} />
              <p>{t(P.tamperedNote)}</p>
            </Card>
          ) : null}
          <div className="pf-actions">
            {tampered ? (
              <Button variant="secondary" block icon={<Icon name="refresh" size={20} />} loading={action === "restore"} disabled={busy && action !== "restore"} onClick={() => void restore()}>{t(P.restore)}</Button>
            ) : (
              <Button variant="danger" block icon={<Icon name="alert" size={20} />} loading={action === "tamper"} disabled={busy && action !== "tamper"} onClick={() => void tamper()}>{t(P.tamper)}</Button>
            )}
            <p className="pf-actions__hint">{t(tampered ? P.restoreHint : P.tamperHint)}</p>
          </div>
        </>
      )}
      <List inset className="pf-links" label={t(P.title)}>
        <ListRow leading={<Icon name="info" />} title={t(P.how)} chevron onClick={() => setHow(true)} />
        <ListRow leading={<Icon name="shieldCheck" />} title={t(P.openVerifier)} chevron href={VERIFIER_HREF} />
        {exporter ? <ListRow leading={<Icon name="download" />} title={t(P.exportReceipts)} chevron onClick={() => setExportOpen(true)} /> : null}
        <ListRow leading={<Icon name="sparkle" />} title={t(P.whyTrust)} chevron href="#/evidence" />
      </List>
      <ProofFooter showDemoKey={demoShortcut(info)} onDevice={onDevice} />
      <HowSheet open={how} onClose={() => setHow(false)} />
      {exporter ? <ExportSheet open={exportOpen} onClose={() => setExportOpen(false)} exporter={exporter} /> : null}
    </div>
  );
}

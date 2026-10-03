// Proof's two sheets: "How is this checked?" (chain, signatures, keys, checkpoint, and what it does not prove), and
// "Export receipts" for the offline verifier, shown only when the client offers an export (exportLog).
import { useEffect, useState, type ReactElement } from "react";
import type { ApiClient } from "../../../api/types";
import { UI } from "../../../i18n/ui";
import { isNative } from "../../../pwa/native";
import { Icon } from "../../../ui/icons";
import { useLocale } from "../../../ui/locale";
import { Sheet } from "../../../ui/Overlay";
import { PLAIN } from "../plainStrings";

const P = UI.proof;
export const VERIFIER_HREF = "/verifier/";

/**
 * Where "Open the offline checker" goes, or undefined when there is no such page. The booth server and the static site
 * serve the checker; the iOS and Android shells do not bundle it, and a link there opens a blank page with no way back.
 * Inside a shell the screen already checks the receipts on the phone, so the link is left out.
 */
export function verifierHref(): string | undefined {
  return isNative() ? undefined : VERIFIER_HREF;
}

export function HowSheet({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }): ReactElement {
  const { t } = useLocale();
  const checker = verifierHref();
  const parts = [
    [P.howChainTitle, P.howChainBody, "list"],
    [P.howSignTitle, P.howSignBody, "shieldCheck"],
    [P.howKeysTitle, P.howKeysBody, "lock"],
    [P.howCheckpointTitle, P.howCheckpointBody, "check"],
    [P.howNotTitle, P.howNotBody, "info"],
  ] as const;
  return (
    <Sheet open={open} onClose={onClose} title={t(P.howTitle)}>
      <div className="pf-how">
        {parts.map(([title, body, icon]) => (
          <section key={title.en} className="pf-how__part">
            <span className="pf-how__icon"><Icon name={icon} size={20} /></span>
            <div>
              <h3 className="pf-how__title">{t(title)}</h3>
              <p className="pf-how__body">{t(body)}</p>
            </div>
          </section>
        ))}
        {checker === undefined ? null : (
          <>
            <p className="pf-how__yourself">{t(P.howYourself)}</p>
            <a className="w-btn w-btn--secondary w-btn--md w-btn--block" href={checker}>
              <span className="w-btn__icon"><Icon name="shieldCheck" size={20} /></span>
              <span className="w-btn__label">{t(P.openVerifier)}</span>
            </a>
          </>
        )}
      </div>
    </Sheet>
  );
}

/** What GET /api/export and LocalApiClient.exportLog return (server/backend.ts ExportView). Checked at the boundary. */
export interface ExportView {
  readonly log: string;
  readonly publicKeys: unknown;
  readonly checkpoint: unknown;
  /** A budget from Mum's: her credential, for inspection. It is not in the log. */
  readonly parentCredential?: unknown;
}

type Exporter = () => Promise<ExportView>;

/**
 * The client's export, when it has one; ApiClient itself does not promise it. The files only feed the offline checker, and
 * the iOS and Android shells have neither that page nor a working download, so there the export is not offered.
 */
export function exporterOf(api: ApiClient): Exporter | null {
  if (isNative()) return null;
  const fn = (api as unknown as { readonly exportLog?: unknown }).exportLog;
  return typeof fn === "function" ? () => (fn as () => Promise<unknown>).call(api).then(readExport) : null;
}

export function readExport(raw: unknown): ExportView {
  if (raw === null || typeof raw !== "object") throw new Error("export is not an object");
  const v = raw as Record<string, unknown>;
  if (typeof v["log"] !== "string" || v["publicKeys"] === null || typeof v["publicKeys"] !== "object") throw new Error("export is missing the log or the keys");
  const parent = v["parentCredential"];
  return { log: v["log"], publicKeys: v["publicKeys"], checkpoint: v["checkpoint"] ?? null, ...(parent !== null && typeof parent === "object" ? { parentCredential: parent } : {}) };
}

interface Files {
  readonly log: string;
  readonly keys: string;
  readonly checkpoint: string;
  readonly parent?: string;
}

function useFiles(open: boolean, exporter: Exporter): { readonly files: Files | null; readonly failed: boolean } {
  const [files, setFiles] = useState<Files | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    const made: string[] = [];
    const url = (text: string, type: string): string => {
      if (typeof URL.createObjectURL !== "function") return `data:${type};charset=utf-8,${encodeURIComponent(text)}`;
      const u = URL.createObjectURL(new Blob([text], { type }));
      made.push(u);
      return u;
    };
    setFailed(false);
    exporter()
      .then((view) => {
        if (!alive) return;
        setFiles({
          log: url(view.log.endsWith("\n") ? view.log : `${view.log}\n`, "application/jsonl"),
          keys: url(`${JSON.stringify(view.publicKeys, null, 2)}\n`, "application/json"),
          checkpoint: url(`${JSON.stringify(view.checkpoint, null, 2)}\n`, "application/json"),
          ...(view.parentCredential === undefined ? {} : { parent: url(`${JSON.stringify(view.parentCredential, null, 2)}\n`, "application/json") }),
        });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      made.forEach((u) => URL.revokeObjectURL(u));
      setFiles(null);
    };
  }, [open, exporter]);
  return { files, failed };
}

/** The sheet's words: the technical names in developer mode, everyday ones in plain mode. The files are the same. */
const EXPORT_WORDS = {
  developer: { title: P.exportTitle, body: P.exportBody, log: P.exportLog, keys: P.exportKeys, checkpoint: P.exportCheckpoint, failed: P.exportFailed, parent: UI.family.exportParent, parentNote: UI.family.exportParentNote },
  plain: { title: PLAIN.save.title, body: PLAIN.save.body, log: PLAIN.save.receipts, keys: PLAIN.save.keys, checkpoint: PLAIN.save.checkpoint, failed: PLAIN.save.failed, parent: PLAIN.save.parent, parentNote: PLAIN.save.parentNote },
} as const;

export function ExportSheet({ open, onClose, exporter, plain = false }: { readonly open: boolean; readonly onClose: () => void; readonly exporter: Exporter; readonly plain?: boolean }): ReactElement {
  const { t } = useLocale();
  const { files, failed } = useFiles(open, exporter);
  const w = EXPORT_WORDS[plain ? "plain" : "developer"];
  const links = files
    ? ([
        [files.log, "wally-receipts.jsonl", w.log, "receipt"],
        [files.keys, "wally-public-keys.json", w.keys, "lock"],
        [files.checkpoint, "wally-checkpoint.json", w.checkpoint, "check"],
        ...(files.parent === undefined ? [] : ([[files.parent, "parent-credential.json", w.parent, "shieldCheck"]] as const)),
      ] as const)
    : [];
  return (
    <Sheet open={open} onClose={onClose} title={t(w.title)} description={t(w.body)}>
      <div className="pf-export">
        {failed ? <p className="pf-export__error" role="alert">{t(w.failed)}</p> : null}
        {links.map(([href, name, words, icon]) => (
          <a key={name} className="w-btn w-btn--secondary w-btn--md w-btn--block" href={href} download={name}>
            <span className="w-btn__icon"><Icon name={icon} size={20} /></span>
            <span className="w-btn__label">{t(words)}</span>
            <span className="w-btn__icon"><Icon name="download" size={20} /></span>
          </a>
        ))}
        {files?.parent === undefined ? null : <p className="pf-export__note">{t(w.parentNote)}</p>}
      </div>
    </Sheet>
  );
}

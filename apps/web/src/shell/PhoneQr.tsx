// "Open Wally on your phone": a QR code and the link, only on the booth Mac in LAN mode. GET /api/lan answers a page on
// the Mac itself and is a 404 for everyone else (and when LAN mode is off), so most of the time this renders nothing.
// The code is an <img> of the server's SVG: it draws on a white background in dark mode too, and an image runs no script.
import { useEffect, useState, type ReactElement } from "react";
import { fetchLanInfo, svgDataUrl, type LanInfo } from "../api/http/lanInfo";
import { useBoothContext } from "../hooks/useBooth";
import { UI } from "../i18n/ui";
import { Button } from "../ui/Button";
import { Tag } from "../ui/Chip";
import { Icon } from "../ui/icons";
import { useLocale } from "../ui/locale";
import "./lan.css";

const COPIED_MS = 2_000;

export interface PhoneQrProps {
  /** "sheet" inside the About sheet; "stage" on the presenter screen (larger code beside the text). */
  readonly variant?: "sheet" | "stage";
  /** How to ask the server (tests). */
  readonly load?: () => Promise<LanInfo | null>;
}

function useLanInfo(load: () => Promise<LanInfo | null>, live: boolean): LanInfo | null {
  const [lan, setLan] = useState<LanInfo | null>(null);
  useEffect(() => {
    if (!live) return;
    let current = true;
    void load().then((found) => {
      if (current) setLan(found);
    });
    return () => {
      current = false;
    };
  }, [load, live]);
  return lan;
}

function useCopied(): readonly [boolean, () => void] {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);
  return [copied, () => setCopied(true)];
}

/** The practice copy (WALLY_PUBLIC_URL): a second code and its link, for a phone that is not on this Wi-Fi. */
function PracticeCopy({ url, qrSvg, id, Heading }: { readonly url: string; readonly qrSvg: string; readonly id: string; readonly Heading: "h3" | "h4" }): ReactElement {
  const { t } = useLocale();
  return (
    <div className="lan-phone__public" role="group" aria-labelledby={id}>
      <Heading id={id} className="lan-phone__subtitle">{t(UI.lan.publicTitle)}</Heading>
      <div className="lan-phone__public-body">
        <img className="lan-phone__qr lan-phone__qr--small" src={svgDataUrl(qrSvg)} alt={t(UI.lan.publicQrAlt)} width={144} height={144} />
        <div className="lan-phone__text">
          <p className="lan-phone__note">{t(UI.lan.publicNote)}</p>
          <a className="lan-phone__url" href={url} target="_blank" rel="noopener noreferrer">{url}</a>
        </div>
      </div>
    </div>
  );
}

export function PhoneQr({ variant = "sheet", load = fetchLanInfo }: PhoneQrProps): ReactElement | null {
  const { t } = useLocale();
  const { api } = useBoothContext();
  const lan = useLanInfo(load, api.kind === "http");
  const [pick, setPick] = useState(0);
  const [copied, markCopied] = useCopied();
  if (lan === null) return null;
  // Inside the About sheet the panel is a section under its title; on the presenter screen it sits right under the page title.
  const Title = variant === "stage" ? "h2" : "h3";

  const link = lan.urls[Math.min(pick, lan.urls.length - 1)];
  const svg = lan.qrSvg[Math.min(pick, lan.qrSvg.length - 1)];
  const copy = (): void => {
    if (link === undefined) return;
    // Clipboard needs a secure context; the booth Mac's page is on 127.0.0.1, which is one.
    void navigator.clipboard?.writeText(link).then(markCopied, () => undefined);
  };
  return (
    <section className="lan-phone" data-variant={variant} aria-labelledby={`lan-title-${variant}`}>
      <div className="lan-phone__head">
        <Title id={`lan-title-${variant}`} className="lan-phone__title">{t(UI.lan.title)}</Title>
        <Tag size="sm" tone="warn" icon={<Icon name="alert" size={14} />}>{t(UI.lan.on)}</Tag>
      </div>
      {link === undefined || svg === undefined ? (
        <p className="lan-phone__note">{t(UI.lan.noAddress)}</p>
      ) : (
        <div className="lan-phone__body">
          <img className="lan-phone__qr" src={svgDataUrl(svg)} alt={t(UI.lan.qrAlt)} width={240} height={240} />
          <div className="lan-phone__text">
            <p className="lan-phone__note">{t(UI.lan.sameWifi)} {t(UI.lan.scan)}</p>
            <ul className="lan-phone__urls">
              {lan.urls.map((url, i) => (
                <li key={url}>
                  <button type="button" className="lan-phone__url" aria-pressed={i === pick} onClick={() => setPick(i)}>
                    {url}
                  </button>
                </li>
              ))}
            </ul>
            <Button variant="secondary" size="sm" icon={<Icon name={copied ? "check" : "share"} size={18} />} onClick={copy}>
              {t(copied ? UI.lan.copied : UI.lan.copy)}
            </Button>
            <p className="lan-phone__note">{t(UI.lan.codeNote)}</p>
          </div>
        </div>
      )}
      {lan.publicUrl !== undefined && lan.publicQrSvg !== undefined ? <PracticeCopy url={lan.publicUrl} qrSvg={lan.publicQrSvg} id={`lan-public-${variant}`} Heading={variant === "stage" ? "h3" : "h4"} /> : null}
    </section>
  );
}

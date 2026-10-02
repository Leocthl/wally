// "Connect to the booth Mac": the native app's way onto the live stack. The app runs on its own (on-device mode) until a
// person pastes the pairing link the booth Mac shows (QR panel in About or Presenter). The link is read and checked
// (private-network or .local host only), the Mac is asked for /api/info with the token, and only an answer saves the
// address and reloads into live mode. "Disconnect" forgets it. A browser page never shows this row.
import { useState, type FormEvent, type ReactElement } from "react";
import { clearConnection, parseBoothLink, readServer, saveConnection, type LinkProblem } from "../api/http/connection";
import { REMOTE_PROBE_TIMEOUT_MS, probeInfo } from "../api/local/select";
import { useBoothContext } from "../hooks/useBooth";
import { UI } from "../i18n/ui";
import { isNative } from "../pwa/native";
import { Button } from "../ui/Button";
import { TextField } from "../ui/Form";
import { useLocale } from "../ui/locale";
import "./lan.css";

type Problem = LinkProblem | "unreachable" | "refused";

export interface BoothConnectProps {
  /** Default: inside the Capacitor shell. */
  readonly native?: boolean;
  /** Asks a booth Mac for /api/info with the token; resolves with its answer or null, rejects when nothing answers. */
  readonly probe?: (server: string, token: string | null, timeoutMs: number) => Promise<unknown>;
  readonly reload?: () => void;
}

const isServerAnswer = (answer: unknown): boolean => answer !== null && typeof answer === "object" && (answer as { readonly kind?: unknown }).kind === "http";

export function BoothConnect({ native = isNative(), probe = probeInfo, reload = () => window.location.reload() }: BoothConnectProps): ReactElement | null {
  const { t } = useLocale();
  const { info } = useBoothContext();
  const [text, setText] = useState("");
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  if (!native) return null;

  const saved = readServer();
  const connect = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const link = parseBoothLink(text);
    if (!link.ok) return setProblem(link.problem);
    setProblem(null);
    setChecking(true);
    try {
      const answer = await probe(link.server, link.token, REMOTE_PROBE_TIMEOUT_MS);
      if (!isServerAnswer(answer)) return setProblem("refused");
      saveConnection(link);
      reload();
    } catch {
      setProblem("unreachable");
    } finally {
      setChecking(false);
    }
  };
  const disconnect = (): void => {
    clearConnection();
    reload();
  };

  return (
    <section className="shell-about__block" aria-labelledby="about-booth">
      <h3 id="about-booth" className="shell-about__heading">{t(UI.lan.connectTitle)}</h3>
      {saved !== null ? (
        <div className="lan-connect">
          <p className="lan-connect__status">{t(info?.kind === "http" ? UI.lan.connected(new URL(saved).host) : UI.lan.savedDown(new URL(saved).host))}</p>
          <Button variant="secondary" block onClick={disconnect}>{t(UI.lan.disconnect)}</Button>
        </div>
      ) : (
        <form className="lan-connect" onSubmit={(e) => void connect(e)} noValidate>
          <TextField
            label={t(UI.lan.linkLabel)}
            hint={t(UI.lan.linkHint)}
            error={problem === null ? undefined : t(UI.lan.problem[problem])}
            value={text}
            onChange={(e) => setText(e.target.value)}
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="http://192.168.0.6:8787/?t=..."
          />
          <Button type="submit" block loading={checking}>{t(UI.lan.connect)}</Button>
        </form>
      )}
    </section>
  );
}

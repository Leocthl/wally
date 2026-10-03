// The Ask sheet, opened by the raised tab button on every screen: the natural-language request (when the booth can take
// one: api.ask), "Try to trick Wally" (the text goes to api.propose as an untrusted listing description), and Try
// asking shortcuts.
import { useId, useMemo, useState, type FormEvent, type ReactElement } from "react";
import type { ScenarioId } from "../api/types";
import { BRAND } from "../brand";
import { LISTING_TEXT_HARD_CAP } from "../booth/scenarios";
import { useBoothContext } from "../hooks/useBooth";
import { UI } from "../i18n/ui";
import { Button, IconButton } from "../ui/Button";
import { TextArea, TextField } from "../ui/Form";
import { Icon } from "../ui/icons";
import { useLocale } from "../ui/locale";
import { Sheet } from "../ui/Overlay";
import { TryAsking } from "../screens/home/TryAsking";
import { PhotoButton } from "../screens/photo/PhotoEntry";
import { noteAsk } from "../screens/run/askEcho";
import { useAsker, useProposer, useScenarioRunner } from "./actions";
import { useShell } from "./ShellContext";
import { useVoiceInput } from "./voice/useVoiceInput";
import { VoiceButton, VoiceStatusLine } from "./voice/VoiceButton";

/** The planner's request cap [F56]. The server checks it again after NFKC; the field just stops typing there. */
const ASK_MAX_CHARS = 1_000;

/** Sends a typed request to Wally (the Ask field). The shell's own asker is used unless <App> is given another. */
export type AskWally = (request: string) => Promise<void> | void;

function TrickBox({ onSend, busy }: { readonly onSend: (text: string) => void; readonly busy: boolean }): ReactElement {
  const { t, locale } = useLocale();
  const { info } = useBoothContext();
  const [text, setText] = useState("");
  const gap = locale === "zh-HK" ? "" : " ";
  const trimmed = text.trim();
  const titleId = useId();
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (trimmed.length === 0 || busy) return;
    onSend(trimmed.slice(0, LISTING_TEXT_HARD_CAP));
  };
  return (
    <form className="shell-trick" onSubmit={submit} aria-labelledby={titleId}>
      <h3 id={titleId} className="shell-trick__title"><Icon name="shieldAlert" size={20} /> {t(UI["shell.trickTitle"](BRAND.name))}</h3>
      <TextArea
        label={t(UI["shell.trickLabel"])}
        hint={info?.kind === "mock" ? `${t(UI["shell.trickHint"])}${gap}${t(UI["shell.trickStandIn"])}` : t(UI["shell.trickHint"])}
        placeholder={t(UI["shell.trickPlaceholder"])}
        rows={3}
        value={text}
        maxLength={LISTING_TEXT_HARD_CAP}
        spellCheck={false}
        lang="en"
        onChange={(e) => setText(e.target.value)}
      />
      <Button type="submit" block icon={<Icon name="arrowUp" size={20} />} disabled={busy || trimmed.length === 0}>
        {t(UI["shell.trickSend"](BRAND.name))}
      </Button>
    </form>
  );
}

/** The natural-language field: Wally reads the request, the rules decide. Shown when this booth can take a typed ask. */
function AskField({ onAsk, busy, onSent, onPhoto }: { readonly onAsk: AskWally; readonly busy: boolean; readonly onSent: () => void; readonly onPhoto?: ((file: File) => void) | undefined }): ReactElement {
  const { t } = useLocale();
  const { info } = useBoothContext();
  const [text, setText] = useState("");
  const voice = useVoiceInput({ value: text, onText: setText, maxLength: ASK_MAX_CHARS });
  const trimmed = text.trim();
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (trimmed.length === 0 || busy) return;
    onSent();
    void onAsk(trimmed.slice(0, ASK_MAX_CHARS));
  };
  // On a device without a model the recorded planner knows its sample asks only: say so, small and plain.
  const onDevice = info?.kind === "local";
  return (
    <form className="shell-askfield" onSubmit={submit} data-slot="ask-natural-language">
      <TextField
        variant="pill"
        label={t(UI["shell.askFieldLabel"](BRAND.name))}
        hideLabel
        placeholder={t(UI["shell.askExample"])}
        hint={onDevice ? t(UI["shell.askLiveHint"]) : undefined}
        enterKeyHint="send"
        maxLength={ASK_MAX_CHARS}
        value={text}
        onChange={(e) => setText(e.target.value)}
        trailing={<><VoiceButton voice={voice} />{onPhoto ? <PhotoButton onFile={onPhoto} disabled={busy} /> : null}<IconButton type="submit" variant="primary" label={t(UI["shell.askSend"])} icon={<Icon name="arrowUp" />} disabled={busy || trimmed.length === 0} /></>}
      />
      <VoiceStatusLine voice={voice} />
    </form>
  );
}

export interface AskSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Another asker than the shell's own (api.ask), e.g. a test double. Without one, the field shows only when the booth can take a typed ask. */
  readonly onAsk?: AskWally;
}

export function AskSheet({ open, onClose, onAsk }: AskSheetProps): ReactElement {
  const { t } = useLocale();
  const { busy, info, api } = useBoothContext();
  const { showPhoto } = useShell();
  const run = useScenarioRunner();
  const propose = useProposer();
  const asker = useAsker();
  const sender = onAsk ?? asker;
  // Wally's screen echoes the words while Wally shops: note them first (memory only, see screens/run/askEcho.ts).
  const ask = useMemo<AskWally | undefined>(
    () =>
      sender
        ? (request) => {
            noteAsk(request);
            return sender(request);
          }
        : undefined,
    [sender],
  );
  // Show Wally a photo needs both halves: see() to read the picture and ask() to buy the pick.
  const onPhoto = typeof api.see === "function" && info?.features?.ask === true ? showPhoto : undefined;
  const pick = (id: ScenarioId): void => {
    onClose();
    run(id);
  };
  const send = (text: string): void => {
    onClose();
    propose(text);
  };
  return (
    <Sheet open={open} onClose={onClose} title={t(UI["shell.askTitle"](BRAND.name))} description={t(UI["shell.askLead"])}>
      <div className="shell-ask">
        {ask ? <AskField onAsk={ask} busy={busy} onSent={onClose} onPhoto={onPhoto} /> : info?.kind === "local" ? <p className="shell-ask__hint">{t(UI["shell.askLiveHint"])}</p> : null}
        {/* The trick box first: it is what only this sheet offers (Budget already lists the scenarios as cards). */}
        <TrickBox onSend={send} busy={busy} />
        <TryAsking onRun={pick} busy={busy} variant="pills" {...(onPhoto ? { onPhoto } : {})} />
      </div>
    </Sheet>
  );
}

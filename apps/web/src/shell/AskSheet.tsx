// The Ask sheet, opened by the raised tab button on every screen: Try asking shortcuts, "Try to trick Wally" (the text
// goes to api.propose as an untrusted listing description), and the slot for the natural-language request.
import { useId, useState, type FormEvent, type ReactElement } from "react";
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
import { useProposer, useScenarioRunner } from "./actions";

/**
 * SLOT (later wave): a natural-language request ("buy me a white tee under HK$150"). Wire it by passing `onAsk` to
 * <App>; the sheet then shows the field above the shortcuts. Until then nothing renders here.
 */
export type AskWally = (request: string) => Promise<void>;

function TrickBox({ onSend, busy }: { readonly onSend: (text: string) => void; readonly busy: boolean }): ReactElement {
  const { t } = useLocale();
  const { info } = useBoothContext();
  const [text, setText] = useState("");
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
        hint={info?.kind === "mock" ? `${t(UI["shell.trickHint"])} ${t(UI["shell.trickStandIn"])}` : t(UI["shell.trickHint"])}
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

/** SLOT body: shown only when a later wave passes onAsk to <App>. */
function AskField({ onAsk, busy, onSent }: { readonly onAsk: AskWally; readonly busy: boolean; readonly onSent: () => void }): ReactElement {
  const { t } = useLocale();
  const [text, setText] = useState("");
  const trimmed = text.trim();
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (trimmed.length === 0 || busy) return;
    onSent();
    void onAsk(trimmed);
  };
  return (
    <form className="shell-askfield" onSubmit={submit} data-slot="ask-natural-language">
      <TextField
        variant="pill"
        label={t(UI["shell.askPlaceholder"](BRAND.name))}
        hideLabel
        placeholder={t(UI["shell.askPlaceholder"](BRAND.name))}
        enterKeyHint="send"
        value={text}
        onChange={(e) => setText(e.target.value)}
        trailing={<IconButton type="submit" variant="primary" label={t(UI["shell.askSend"])} icon={<Icon name="arrowUp" />} disabled={busy || trimmed.length === 0} />}
      />
    </form>
  );
}

export interface AskSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** SLOT for the natural-language request (later wave). Omitted: the field does not render. */
  readonly onAsk?: AskWally;
}

export function AskSheet({ open, onClose, onAsk }: AskSheetProps): ReactElement {
  const { t } = useLocale();
  const { busy } = useBoothContext();
  const run = useScenarioRunner();
  const propose = useProposer();
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
        {onAsk ? <AskField onAsk={onAsk} busy={busy} onSent={onClose} /> : null}
        <TryAsking onRun={pick} busy={busy} />
        <TrickBox onSend={send} busy={busy} />
      </div>
    </Sheet>
  );
}

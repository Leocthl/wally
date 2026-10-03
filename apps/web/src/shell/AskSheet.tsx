// The Ask sheet, opened by the raised tab button on every screen. On top, what a shopper needs: the question (typed or said,
// with a camera for a photo) and the kinds of item the demo shop has as chips. Under "Demo scenarios (for judges)", closed
// for a shopper and open on the booth Mac: "Try to trick Wally" (the text goes to api.propose as an untrusted listing
// description) and the Try asking shortcuts.
import { useId, useMemo, useState, type FormEvent, type ReactElement } from "react";
import type { ScenarioId } from "../api/types";
import { BRAND } from "../brand";
import { LISTING_TEXT_HARD_CAP } from "../booth/scenarios";
import { useBoothContext } from "../hooks/useBooth";
import { OB } from "../i18n/onboarding";
import { UI } from "../i18n/ui";
import { useAskExample } from "../state/useProfile";
import { Button, IconButton } from "../ui/Button";
import { TextArea, TextField } from "../ui/Form";
import { Icon } from "../ui/icons";
import { useLocale } from "../ui/locale";
import { Sheet } from "../ui/Overlay";
import { DemoScenarios } from "../screens/home/DemoScenarios";
import { TryAsking } from "../screens/home/TryAsking";
import { PhotoButton } from "../screens/photo/PhotoEntry";
import { ShopChips } from "../screens/photo/ShopChips";
import { usePhotoEntry, useShopSearch } from "../screens/photo/usePhotoEntry";
import { useTypedAsk } from "../screens/photo/useTypedAsk";
import { noteAsk } from "../screens/run/askEcho";
import { TRICK_EXAMPLES } from "../booth/trickExamples";
import { useProposer, useScenarioRunner } from "./actions";
import { useVoiceInput } from "./voice/useVoiceInput";
import { TrickCount } from "./TrickCount";
import { VoiceButton, VoiceStatusLine } from "./voice/VoiceButton";

/** The planner's request cap [F56]. The server checks it again after NFKC; the field just stops typing there. */
const ASK_MAX_CHARS = 1_000;

/** Sends a typed request to Wally (the Ask field). The shell's own asker is used unless <App> is given another. */
export type AskWally = (request: string) => Promise<void> | void;

/**
 * "Try to trick Wally": the text becomes the description of a listing that only the judge reads. A host with no live judge (the
 * on-device page, GitHub Pages, the native shells, a booth on the recorded judge) cannot judge text it never saw, so the box
 * is switched off there, says so in one line, and offers three recorded examples to run instead. The box stops at the listing
 * record's own text limit (LISTING_TEXT_HARD_CAP), and a counter shows how much room is left once the text nears it.
 */
function TrickBox({ onSend, busy }: { readonly onSend: (text: string) => void; readonly busy: boolean }): ReactElement {
  const { t, locale } = useLocale();
  const { info } = useBoothContext();
  const [text, setText] = useState("");
  const gap = locale === "zh-HK" ? "" : " ";
  const trimmed = text.trim();
  const titleId = useId();
  const examplesId = useId();
  const recordedOnly = info?.kind === "local" || (info?.kind === "http" && info.judge.provider === "replay");
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (trimmed.length === 0 || busy || recordedOnly) return;
    onSend(trimmed.slice(0, LISTING_TEXT_HARD_CAP));
  };
  const hint = recordedOnly ? t(UI["shell.trickOfflineHint"]) : info?.kind === "mock" ? `${t(UI["shell.trickHint"])}${gap}${t(UI["shell.trickStandIn"])}` : t(UI["shell.trickHint"]);
  return (
    <form className="shell-trick" onSubmit={submit} aria-labelledby={titleId} data-recorded-only={recordedOnly || undefined}>
      <h3 id={titleId} className="shell-trick__title"><Icon name="shieldAlert" size={20} /> {t(UI["shell.trickTitle"](BRAND.name))}</h3>
      <TextArea
        label={t(UI["shell.trickLabel"])}
        hint={hint}
        placeholder={t(UI["shell.trickPlaceholder"])}
        rows={3}
        value={text}
        maxLength={LISTING_TEXT_HARD_CAP}
        spellCheck={false}
        lang="en"
        disabled={recordedOnly}
        onChange={(e) => setText(e.target.value)}
      />
      {recordedOnly ? null : <TrickCount length={text.length} max={LISTING_TEXT_HARD_CAP} />}
      {recordedOnly ? (
        <div className="shell-trick__examples" role="group" aria-labelledby={examplesId}>
          <p id={examplesId} className="shell-trick__examples-title">{t(UI["shell.trickExamplesTitle"])}</p>
          <div className="shell-trick__chips">
            {TRICK_EXAMPLES.map((example) => (
              <button key={example.id} type="button" className="shop-chip" data-example={example.id} disabled={busy} onClick={() => onSend(example.text)}>
                {t(UI[`shell.trickExample.${example.id}`])}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <Button type="submit" block icon={<Icon name="arrowUp" size={20} />} disabled={busy || trimmed.length === 0}>
          {t(UI["shell.trickSend"](BRAND.name))}
        </Button>
      )}
    </form>
  );
}

/** The natural-language field: Wally reads the request, the rules decide. Shown when this booth can take a typed ask. */
function AskField({ onAsk, busy, onSent, onPhoto }: { readonly onAsk: AskWally; readonly busy: boolean; readonly onSent: () => void; readonly onPhoto?: ((file: File) => void) | undefined }): ReactElement {
  const { t } = useLocale();
  const { info } = useBoothContext();
  const example = useAskExample();
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
        placeholder={example}
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
  const { busy } = useBoothContext();
  const run = useScenarioRunner();
  const propose = useProposer();
  // The shell's own asker decides between Wally's live planner and the fixed keyword reader; an asker given by the host (a test
  // double) is used as it is, with Wally's screen told the words first (memory only, see screens/run/askEcho.ts).
  const typed = useTypedAsk();
  const ask = useMemo<AskWally | undefined>(
    () =>
      onAsk === undefined
        ? typed
        : (request) => {
            noteAsk(request);
            return onAsk(request);
          },
    [onAsk, typed],
  );
  // Show Wally a photo needs both halves: see() to read the picture and ask() to buy the pick. The shop chips need the same.
  const onPhoto = usePhotoEntry();
  const search = useShopSearch();
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
        {ask ? <AskField onAsk={ask} busy={busy} onSent={onClose} onPhoto={onPhoto} /> : null}
        {search ? <ShopChips onPick={search} onPhoto={onPhoto} busy={busy} /> : null}
        {/* The judges' console: the trick box and every scenario, folded away for a shopper (open on the booth Mac and with ?booth=1). */}
        <DemoScenarios lead={t(OB.home.demoLead)}>
          <TrickBox onSend={send} busy={busy} />
          <TryAsking onRun={pick} busy={busy} variant="pills" />
        </DemoScenarios>
      </div>
    </Sheet>
  );
}

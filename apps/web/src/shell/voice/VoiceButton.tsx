// The Ask field's voice controls: the mic button (inside the field, beside Send) and the status line under it. Both draw
// nothing where voice input is unavailable, so a browser without the speech API sees the field exactly as before.
import type { ReactElement } from "react";
import type { LabelPair } from "../../i18n/label";
import { VOICE } from "../../i18n/voice";
import { IconButton } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { haptic } from "../../ui/haptics";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import "../voice.css";
import { StopIcon } from "./icons";
import type { VoiceInput } from "./useVoiceInput";
import type { VoiceStatus } from "./voiceState";

/** Plain words for every state that has some (idle has none). */
const WORDS: Readonly<Record<Exclude<VoiceStatus, "idle">, LabelPair>> = {
  listening: VOICE.listening,
  noSpeech: VOICE.noSpeech,
  denied: VOICE.denied,
  offline: VOICE.offline,
  error: VOICE.error,
};

/** The mic. One name for both states ("Speak your request"); aria-pressed says it is listening, and a press stops it. */
export function VoiceButton({ voice }: { readonly voice: VoiceInput }): ReactElement | null {
  const { t } = useLocale();
  if (!voice.supported) return null;
  const listening = voice.status === "listening";
  return (
    <span className="voice-wrap" data-listening={listening}>
      <IconButton
        variant="secondary"
        className={cx("voice-btn", listening && "voice-btn--on")}
        label={t(VOICE.speak)}
        aria-pressed={listening}
        icon={listening ? <StopIcon /> : <Icon name="mic" />}
        onClick={() => {
          haptic("tap");
          voice.toggle();
        }}
      />
    </span>
  );
}

/** Polite live region under the field. It stays in the page (empty at rest) so a screen reader hears each change. */
export function VoiceStatusLine({ voice }: { readonly voice: VoiceInput }): ReactElement | null {
  const { t } = useLocale();
  if (!voice.supported) return null;
  const words = voice.note ? VOICE.firstUseNote : voice.status === "idle" ? null : WORDS[voice.status];
  return (
    <p className={cx("voice-status", voice.status === "listening" && "voice-status--on")} role="status" aria-live="polite" data-voice={voice.status}>
      {words ? t(words) : null}
    </p>
  );
}

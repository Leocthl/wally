// The "What do you need?" row, right under the budget: the way in for a shopper. One tap opens the Ask sheet, where the typed
// field, the microphone and (from the photo lane) the photo entry live. The camera and the microphone are drawn on the row so
// the ways to ask are plain at a glance; they are part of the one control, not buttons of their own.
import type { ReactElement } from "react";
import { OB } from "../../i18n/onboarding";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { ASK_EVENT } from "../../shell/askEvent";

/** Which way in was pressed. The shell opens the same sheet for each today; the photo lane can read `detail.entry` to open its own. */
export type AskEntry = "text" | "voice" | "photo";

/** Asks the shell to open the Ask sheet (the same window event Wally's screen uses). */
export function askWally(entry: AskEntry = "text"): void {
  window.dispatchEvent(new CustomEvent(ASK_EVENT, { detail: { entry } }));
}

/** A camera in the same 24 px line style as the icon set (ui/icons.tsx has no camera yet; the photo lane may add one). */
function CameraGlyph(): ReactElement {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4.5 8h2.2l1.3-2h8l1.3 2h2.2a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-8A1.5 1.5 0 0 1 4.5 8z" />
      <circle cx="12" cy="13.2" r="3.2" />
    </svg>
  );
}

export function Composer(): ReactElement {
  const { t } = useLocale();
  return (
    <button type="button" className="home-composer" aria-haspopup="dialog" data-composer onClick={() => askWally("text")}>
      <span className="home-composer__lead" aria-hidden="true"><Icon name="chat" size={20} /></span>
      <span className="home-composer__text">{t(OB.home.composer)}</span>
      <span className="home-composer__tools" aria-hidden="true" data-tools>
        <span className="home-composer__tool" data-tool="photo"><CameraGlyph /></span>
        <span className="home-composer__tool" data-tool="voice"><Icon name="mic" size={20} /></span>
      </span>
    </button>
  );
}

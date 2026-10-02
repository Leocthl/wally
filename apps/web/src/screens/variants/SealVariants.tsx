// #/styleguide/variants/seal: three answers to the seal moment on Check and seal. Lock (shipped) closes the padlock where
// you pressed; Hold makes the press carry weight (hold the lock); Signature turns the rules into a document you sign. A
// stand-in for the call (500 ms) plays the part of the booth. Scene "Reset" puts the page back before the press.
import { useEffect, useRef, useState, type ReactElement } from "react";
import { UI } from "../../i18n/ui";
import { Icon } from "../../ui/icons";
import { IconButton } from "../../ui/Button";
import { useLocale } from "../../ui/locale";
import { ShellBar } from "../../shell/ShellBar";
import { HoldReview } from "../seal/ceremony/HoldReview";
import { SignatureReview } from "../seal/ceremony/SignatureReview";
import { applySentence, EMPTY_FORM, type RulesForm } from "../seal/sealModel";
import { M0_SENTENCE } from "../../booth/compile";
import { ReviewStep } from "../seal/SealSteps";
import "../seal/seal.css";
import { VariantPicker, type PickerVariant } from "./Picker";
import { PlainScene } from "./Scene";

const CALL_MS = 500;

type Phase = "idle" | "sealing" | "sealed";

function Frame({ children }: { readonly children: ReactElement }): ReactElement {
  const { t } = useLocale();
  return (
    <div className="shell-app" data-route="seal" data-chip-scope>
      <ShellBar onAbout={() => undefined} />
      <main className="shell-main">
        <div className="seal-screen">
          <div className="seal-pane">
            <div className="seal-head">
              <IconButton label={t(UI.back)} icon={<Icon name="chevronLeft" />} onClick={() => undefined} />
              <h1 className="seal-head__title">{t(UI["seal.reviewTitle"])}</h1>
              <span className="seal-dots" aria-hidden="true">{[0, 1, 2].map((i) => <span key={i} className="seal-dots__dot" data-on />)}</span>
            </div>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

function usePress(): { readonly phase: Phase; readonly press: () => void; readonly reset: () => void } {
  const [phase, setPhase] = useState<Phase>("idle");
  const timer = useRef<number | null>(null);
  const clear = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  return {
    phase,
    press: () => {
      if (phase !== "idle") return;
      setPhase("sealing");
      timer.current = window.setTimeout(() => setPhase("sealed"), CALL_MS);
    },
    reset: () => {
      clear();
      setPhase("idle");
    },
  };
}

function Stage(): ReactElement {
  const now = new Date();
  const form: RulesForm = applySentence(EMPTY_FORM(now), M0_SENTENCE, now).form;
  const { phase, press, reset } = usePress();
  const lock = (): ReactElement => <Frame><ReviewStep form={form} sealing={phase === "sealing"} sealed={phase === "sealed"} replacing={false} onEdit={() => undefined} onSeal={press} /></Frame>;
  const hold = (): ReactElement => <Frame><HoldReview form={form} sealed={phase === "sealed"} onSeal={() => { press(); }} /></Frame>;
  const sign = (): ReactElement => <Frame><SignatureReview form={form} sealed={phase === "sealed"} onSeal={press} /></Frame>;
  const variants: readonly PickerVariant[] = [
    { name: "Lock", render: lock },
    { name: "Hold", render: hold },
    { name: "Signature", render: sign },
  ];
  return (
    <PlainScene buttons={[{ label: "Reset", run: reset }]}>
      <VariantPicker variants={variants} position="top" />
    </PlainScene>
  );
}

export default function SealVariants(): ReactElement {
  return <Stage />;
}

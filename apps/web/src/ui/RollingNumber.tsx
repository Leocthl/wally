// RollingMoney: an amount whose digits roll to the new value (NumberFlow). The text is the same HK$ figure formatHkd
// writes, in the current tabular numerals; the roll is decorative, so reduced motion shows the new figure at once and the
// accessible name is the figure itself (NumberFlow marks its drawing role="img" with the formatted text). Where the roll
// cannot be drawn the figure is plain text, which is also what the component tests see.
import NumberFlow, { useIsSupported, type Format } from "@number-flow/react";
import type { ReactElement } from "react";
import { EASE_OUT, ROLL_MS } from "../design/motion";
import { formatHkd } from "../domain/money";

const FORMAT: Format = { style: "currency", currency: "HKD", minimumFractionDigits: 0, maximumFractionDigits: 2, trailingZeroDisplay: "stripIfInteger" };
const MINOR_PER_MAJOR = 100;
const TIMING = { duration: ROLL_MS, easing: EASE_OUT } as const;
const FADE = { duration: ROLL_MS / 2, easing: "ease-out" } as const;

export interface RollingMoneyProps {
  /** Integer HKD minor units, like everywhere else. */
  readonly minor: number;
  readonly className?: string;
}

export function RollingMoney({ minor, className }: RollingMoneyProps): ReactElement {
  // A browser that cannot draw the roll (no CSS mod(), no custom elements) and the test DOM show the plain figure.
  const supported = useIsSupported();
  if (!supported) return <span className={className}>{formatHkd(minor)}</span>;
  return <NumberFlow className={className} value={minor / MINOR_PER_MAJOR} locales="en-US" format={FORMAT} transformTiming={TIMING} spinTiming={TIMING} opacityTiming={FADE} />;
}

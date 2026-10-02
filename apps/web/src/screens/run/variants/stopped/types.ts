import type { Ref } from "react";
import type { PacketState } from "../../../../api/types";
import type { Result } from "../../model/screen";

/** What every "Stopped before paying" layout is given (the production screen passes the same). */
export interface StopVariantProps {
  readonly result: Result;
  readonly packet: PacketState | null;
  readonly fresh: boolean;
  readonly headingRef: Ref<HTMLHeadingElement>;
  readonly onWhy: () => void;
  readonly onTopUp: () => void;
  readonly onAsk: () => void;
  readonly onCheaper?: (() => void) | undefined;
}

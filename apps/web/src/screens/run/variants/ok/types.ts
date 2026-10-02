import type { Ref } from "react";
import type { Result } from "../../model/screen";

/** What every "Needs your OK" layout is given (the production screen passes the same). */
export interface OkVariantProps {
  readonly result: Result;
  readonly headingRef: Ref<HTMLHeadingElement>;
  readonly answering: "APPROVE" | "DENY" | null;
  readonly onAnswer: (choice: "APPROVE" | "DENY") => void;
  readonly onWhy: () => void;
  readonly now?: () => number;
}

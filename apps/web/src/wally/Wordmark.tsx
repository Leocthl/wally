// The Wally wordmark: the name set in the rounded system face beside the mini character. Not a drawn logo.
import type { ReactElement } from "react";
import "./wally.css";
import { Wally } from "./Wally";

const SIZE_PX = { sm: 20, md: 28, lg: 44 } as const;

export function Wordmark({ size = "md" }: { readonly size?: keyof typeof SIZE_PX }): ReactElement {
  const px = SIZE_PX[size];
  return (
    <span className="wordmark" style={{ fontSize: px }} role="img" aria-label="Wally">
      <Wally state="idle" size={Math.round(px * 1.25)} decorative />
      <span className="wordmark__text" aria-hidden="true">Wally</span>
    </span>
  );
}

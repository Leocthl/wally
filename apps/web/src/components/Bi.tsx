// Bilingual text: English first, zh-HK on a second line with lang="zh-HK" (docs/04 Fonts, Microcopy).
import type { ReactElement } from "react";
import type { LabelPair } from "../i18n/label";

export function Bi({ text, as: Tag = "span", className }: { readonly text: LabelPair; readonly as?: "span" | "p" | "div"; readonly className?: string }): ReactElement {
  return (
    <Tag className={`bi ${className ?? ""}`.trim()}>
      <span className="bi__en">{text.en}</span>
      <span className="bi__zh" lang="zh-HK">{text.zh}</span>
    </Tag>
  );
}

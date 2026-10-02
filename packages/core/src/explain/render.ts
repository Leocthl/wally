// render(templateId, inputs, locale): pure, no I/O, clock or LLM (docs/02 section 8). Never throws.
import type { Render, TemplateId } from "../ports";
import type { Locale } from "./format";
import { TEMPLATES, field, type TemplateInputs, type Verdict } from "./templates";

function prefix(rule: string, verdict: Verdict, locale: Locale): string {
  if (locale === "zh-HK") return verdict === "DENY" ? `由 ${rule} 攔截。` : `${rule} 已轉交你確認。`; // NEEDS-REVIEW zh-HK
  return verdict === "DENY" ? `Stopped by ${rule}.` : `Escalated by ${rule}.`;
}

function verdictOf(inputs: TemplateInputs, fallback: Verdict): Verdict {
  const v = field(inputs, "verdict");
  return v === "DENY" || v === "ESCALATE" ? v : fallback;
}

function unknownTemplate(templateId: unknown, locale: Locale): string {
  const id = typeof templateId === "string" ? templateId : "?";
  return locale === "zh-HK" ? `已攔截。未知的規則範本 ${id}。` : `Stopped. Unknown rule template ${id}.`; // NEEDS-REVIEW zh-HK
}

export const render: Render = (templateId, inputs, locale) => {
  const loc: Locale = locale === "zh-HK" ? "zh-HK" : "en";
  const spec = typeof templateId === "string" && Object.hasOwn(TEMPLATES, templateId) ? TEMPLATES[templateId] : undefined;
  if (spec === undefined) return unknownTemplate(templateId, loc);
  const safeInputs: TemplateInputs = inputs !== null && typeof inputs === "object" ? inputs : {};
  const rule = templateId.split(".")[0] ?? templateId;
  const separator = loc === "zh-HK" ? "" : " "; // Chinese full stops take no trailing space
  return `${prefix(rule, verdictOf(safeInputs, spec.defaultVerdict), loc)}${separator}${spec.fragment(safeInputs, loc)}`;
};

/** Both lines for a Decision explanation (rendered and rendered_zh_hk). */
export function renderBoth(templateId: TemplateId, inputs: TemplateInputs): { readonly en: string; readonly zhHK: string } {
  return { en: render(templateId, inputs, "en"), zhHK: render(templateId, inputs, "zh-HK") };
}

// The swap point for stop texts. Lane A's explain module (@laisee/core/explain, `render`) replaces the stub here:
//   import { render } from "@laisee/core/explain";   export const renderStop: Render = render;
import type { Render } from "@laisee/core/ports";
import { renderTemplate } from "./templates";

export const renderStop: Render = (templateId, inputs, locale) => renderTemplate(templateId, inputs, locale);

/** "R3.over_remaining" -> "R3". */
export function ruleIdOf(templateId: string): string {
  return templateId.split(".")[0] ?? templateId;
}

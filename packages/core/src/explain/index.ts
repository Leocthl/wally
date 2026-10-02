// @laisee/core/explain: explanation templates (A-16). Pure and browser-safe: no I/O, clock or LLM.
export { render, renderBoth } from "./render";
export { TEMPLATES, TEMPLATE_IDS, type TemplateInputs, type TemplateSpec, type Verdict } from "./templates";
export {
  formatCount,
  formatDuration,
  formatHkd,
  formatHkt,
  formatList,
  formatProbability,
  formatText,
  type Locale,
} from "./format";

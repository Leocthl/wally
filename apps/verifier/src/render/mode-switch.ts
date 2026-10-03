// The "Show technical details" switch: one real <button role="switch"> (so Space and Enter work and it takes a tap), with
// its label inside it and a one-line hint under it that a screen reader reads as its description. It is on in developer
// mode. It is built in both modes so an engineer can go back; app.ts wires the click. The track and thumb are decoration.
import { bi, el } from "../dom";
import type { Mode } from "../mode";
import { S } from "../strings";

export interface ModeSwitch {
  readonly root: HTMLElement;
  readonly button: HTMLButtonElement;
}

const HINT_ID = "mode-hint";

export function buildModeSwitch(mode: Mode): ModeSwitch {
  const track = el("span", { class: "modeswitch__track", "aria-hidden": "true" }, [el("span", { class: "modeswitch__thumb" })]);
  const button = el(
    "button",
    {
      type: "button",
      role: "switch",
      class: "modeswitch",
      id: "mode-switch",
      "aria-checked": String(mode === "developer"),
      "aria-describedby": HINT_ID,
    },
    [track, bi(S.modeLabel, "span", "modeswitch__label")],
  );
  const hint = bi(S.modeHint, "p", "modebar__hint soft");
  hint.id = HINT_ID;
  return { root: el("div", { class: "modebar" }, [button, hint]), button };
}

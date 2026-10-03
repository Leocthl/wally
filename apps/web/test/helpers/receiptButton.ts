// Finds the button that opens one receipt on the plain Receipts list, the way a person would: a receipt that is a step of a
// purchase is reached by opening that purchase's "N steps" first; any other is the button of its own row.
import type { UserEvent } from "@testing-library/user-event";

export async function receiptButton(user: UserEvent, seq: number): Promise<HTMLButtonElement> {
  const step = document.querySelector<HTMLButtonElement>(`.rc-step[data-seq="${seq}"]`);
  if (step) {
    const toggle = step.closest(".rc-steps")?.querySelector<HTMLButtonElement>("[data-steps-toggle]");
    if (toggle && toggle.getAttribute("aria-expanded") !== "true") await user.click(toggle);
    return step;
  }
  const meta = document.querySelector(`.rc-row__meta[data-seq="${seq}"]`);
  const button = meta?.closest("button");
  if (!button) throw new Error(`no row or step opens receipt ${seq}`);
  return button;
}

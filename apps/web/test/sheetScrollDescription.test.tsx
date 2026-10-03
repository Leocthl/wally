// Sheet's optional scrollDescription: the description becomes the first line of the scrolling body instead of a fixed line above
// it (so a long one cannot take the room the body needs at large text), keeps its id so the dialog is still described by it, and
// leaves every other sheet as it was: off by default, and nothing changes when there is no description.
import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { Sheet } from "../src/ui/Overlay";

const DESCRIPTION = "Wally takes the colours from your picture. You pick; the rules still decide.";

function Demo({ scrollDescription, description = DESCRIPTION }: { readonly scrollDescription?: boolean; readonly description?: string }): ReactElement {
  return (
    <Sheet open onClose={() => undefined} title="Show Wally a photo" description={description} footer={<button type="button">Footer action</button>} {...(scrollDescription === undefined ? {} : { scrollDescription })}>
      <p>First line of the content</p>
    </Sheet>
  );
}

const parts = (): { readonly dialog: HTMLElement; readonly desc: Element | null; readonly body: Element } => {
  const dialog = screen.getByRole("dialog", { name: "Show Wally a photo" });
  const body = dialog.querySelector(".w-sheet__body");
  if (body === null) throw new Error("the sheet has no body");
  return { dialog, desc: dialog.querySelector(".w-sheet__desc"), body };
};

describe("Sheet scrollDescription", () => {
  it("keeps the description fixed above the body by default", () => {
    render(<Demo />);
    const { dialog, desc, body } = parts();
    expect(desc).toHaveTextContent(DESCRIPTION);
    expect(body).not.toContainElement(desc as HTMLElement);
    expect(desc?.compareDocumentPosition(body)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(body).not.toHaveClass("w-sheet__body--desc");
    expect(dialog).toHaveAccessibleDescription(DESCRIPTION);
  });

  it("puts the description first in the scrolling body, before the content, when asked", () => {
    render(<Demo scrollDescription />);
    const { dialog, desc, body } = parts();
    expect(body.firstElementChild).toBe(desc);
    expect(body).toHaveClass("w-sheet__body--desc");
    expect(body.lastElementChild).toHaveTextContent("First line of the content");
    expect(dialog.querySelector(".w-sheet__footer")).toContainElement(screen.getByRole("button", { name: "Footer action" }));
  });

  it("keeps the dialog described by it, through the same id", () => {
    render(<Demo scrollDescription />);
    const { dialog, desc } = parts();
    expect(desc?.id).not.toBe("");
    expect(dialog).toHaveAttribute("aria-describedby", desc?.id);
    expect(dialog).toHaveAccessibleDescription(DESCRIPTION);
  });

  it("changes nothing for a sheet with no description", () => {
    render(
      <Sheet open onClose={() => undefined} title="Show Wally a photo" scrollDescription>
        <p>Content</p>
      </Sheet>,
    );
    const { dialog, desc, body } = parts();
    expect(desc).toBeNull();
    expect(body).not.toHaveClass("w-sheet__body--desc");
    expect(dialog).not.toHaveAttribute("aria-describedby");
  });
});

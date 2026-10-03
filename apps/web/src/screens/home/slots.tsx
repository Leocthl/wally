// Places on Home that another lane fills. Each renders nothing until it does, so Home is complete without them.
import type { ReactElement } from "react";

/**
 * The photo lane's "Show Wally a photo" card goes here, directly under the "What do you need?" row. Empty on purpose: the
 * lane replaces the body of this component and keeps its name and place.
 */
export function PhotoCardSlot(): ReactElement | null {
  return null;
}

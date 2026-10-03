// The sample each colour name is drawn with. A swatch is a sample of a colour the person likes, not a colour the app
// uses: it is data, the same in light and dark, so it lives here and not in the theme tokens (which keep reds for stops).
// It is never the only signal: every swatch has its name beside it and a tick when chosen. Set as --swatch on the dot.
import type { ColourId } from "../../state/taste";

export const SWATCHES: Readonly<Record<ColourId, string>> = {
  black: "#14161c",
  white: "#f7f7f4",
  grey: "#8d929c",
  navy: "#1c2f55",
  olive: "#6b6f3a",
  sand: "#d6c4a0",
  rust: "#a8502f",
  sky: "#8fc1e6",
};

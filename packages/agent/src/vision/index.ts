// @wally/agent/vision (lane photo): show Wally a picture instead of typing. describeImage reads one picture into a few
// typed words on the local Qwen server; the colour, palette and matching code below works without any model, on every
// host (browser, on-device build, native shells). Nothing here decides a purchase: the planner, judge and rules do.
export { DEFAULT_DESCRIBE_TIMEOUT_MS, describeImage, type DescribeOptions, type DescribeReason, type Described } from "./describe";
export { parseAttributes } from "./answer";
export { COLOR_ANCHORS, colorDistance, colorSwatch, deltaE, hexToRgb, nearestColor, rgbToLab, swatchLab, type Lab, type Rgb } from "./color";
export { extractPalette, type PaletteEntry, type PixelImage } from "./palette";
export {
  CLOSE_COLOR_FIT,
  COLOR_FALLOFF,
  DEFAULT_LIMIT,
  fitsBudget,
  matchShelf,
  SAME_COLOR_FIT,
  scoreItem,
  WEIGHTS,
  type MatchQuery,
  type ReasonId,
  type Scored,
  type ShelfItem,
} from "./match";
export { fromBase64, toBase64 } from "./base64";
export { checkImage, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, sniffImage, type ImageCheck, type ImageInfo, type ImageMime, type ImageProblem } from "./image";
export { buildSeeMessages, buildSeeSchema, SEE_SYSTEM_PROMPT, SEE_USER_PROMPT } from "./prompt";
export {
  COLORS,
  FITS,
  isColor,
  isFit,
  isKind,
  isPattern,
  isStyle,
  KINDS,
  MAX_COLORS,
  MAX_STYLES,
  PATTERNS,
  SHOP_KINDS,
  STYLES,
  type Attributes,
  type Color,
  type Fit,
  type Kind,
  type Pattern,
  type Style,
} from "./vocab";

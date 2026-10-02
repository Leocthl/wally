// Words for the seal moment (Check and seal, then Sealed). No digits. Every zh-HK line is a draft for the native read.
import { label } from "./label";

export const CEREMONY = {
  sealed: label("Sealed", "已簽署"), // NEEDS-REVIEW
  signed: label("Signed", "已簽名"), // NEEDS-REVIEW
  holdToSeal: label("Hold to seal", "按住以簽署"), // NEEDS-REVIEW
  holdHint: label("Press and hold. Let go early and nothing happens.", "按住不放。中途放手，就唔會有任何事。"), // NEEDS-REVIEW
} as const;

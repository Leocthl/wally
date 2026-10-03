// Words for the seal moment (Check and seal, then Sealed). No digits. Every zh-HK line is a draft for the native read.
import { label } from "./label";

export const CEREMONY = {
  sealed: label("Locked in", "已鎖定"), // NEEDS-REVIEW
  signed: label("Signed", "已簽名"), // NEEDS-REVIEW
  holdToSeal: label("Hold to lock in", "按住以鎖定"), // NEEDS-REVIEW
  holdHint: label("Press and hold. Let go early and nothing happens.", "按住不放。中途放手，就唔會有任何事。"), // NEEDS-REVIEW
} as const;

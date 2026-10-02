// @laisee/core/cart: the cart builder (A-31). propose_cart input + listing record -> Cart, priced from the record only.
import type { BuildCart } from "./types";

/** Contract stub: the implementation lands in the next commit. */
export const buildCart: BuildCart = () => {
  throw new Error("not implemented: buildCart (lane e-orch)");
};

export type {
  BuildCart,
  BuildCartInput,
  BuildCartResult,
  CartBuilt,
  CartIdSource,
  CartRejected,
  InvalidCartCode,
  ScameterLookup,
} from "./types";

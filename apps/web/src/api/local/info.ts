// What on-device mode says about itself, plainly: the real engine, log and SIMULATED rail run in this page; the
// planner and the judge are recorded answers (replayed), never a live model; nothing leaves the device; and the page
// holds every key, including the delegator's (DEMO SHORTCUT, see KEYS.md).
import type { ApiInfo } from "../types";
import { BRAND } from "../../brand";
import { featuresFor } from "../../booth/backend/info";

/** The visible note when the page runs on its own (forced with ?api=local, or no booth server answered). */
export const ON_DEVICE_NOTE = "Demo mode: Wally runs here on your phone with sample shop data. Nothing leaves your phone.";

/** Run note when typed text has no recording: no judge runs on the device, so R10 asks the shopper. */
export const LOCAL_JUDGE_OFFLINE_NOTE =
  "Judge offline in on-device mode: no recorded answer exists for this text, so the engine escalates it to you (R10). No verdict was made up.";

/** Said for a typed request that has no recording: no model runs on the device, so nothing is guessed. */
export const LOCAL_UNKNOWN_REQUEST_NOTE = "On-device mode only knows the sample requests; open the live booth for free-form asks.";

/** The note on exported public keys in on-device mode. */
export const LOCAL_KEYS_NOTE = "Throwaway demo keys made in this page when it loaded (rail SIMULATED). Public keys only.";

/** ApiInfo plus the fields the server also reports; still assignable to ApiInfo. */
export interface LocalInfo extends ApiInfo {
  readonly product: string;
  readonly demoShortcut: string;
  readonly keys: string;
}

/** `hasAlternativeRecords`: the bundle holds a recorded cheaper option (an `-alternative` planner record). */
export function localInfo(hasAlternativeRecords: boolean, hasShelf = true): LocalInfo {
  return {
    kind: "local",
    judge: {
      provider: "replay",
      note: `Recorded judge answers (SIMULATED), replayed on this device. No judge model runs here, so typed text with no recording escalates (R10.unavailable).`,
    },
    planner: { provider: "replay", note: "Recorded planner proposals (SIMULATED), replayed on this device. The planner holds no key (I4)." },
    features: featuresFor("replay", hasAlternativeRecords, hasShelf ? "palette" : undefined), // no model on the device: the colour plates and the chips
    replayed: true,
    realCapture: null,
    product: BRAND.name,
    demoShortcut: `DEMO SHORTCUT: in on-device mode this ${BRAND.name} page holds every key, the delegator's included, and signs the seal, revocations and escalation answers itself. A real deployment keeps the delegator key apart (src/api/local/KEYS.md). For a family budget the page also makes Mum's throwaway key (SIMULATED) and signs her ceiling.`,
    keys: "Ephemeral in-memory demo keys, new every time the page loads.",
  };
}

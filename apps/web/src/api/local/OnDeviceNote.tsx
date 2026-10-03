// The calm, always-visible line for on-device mode, in a shopper's words: a demo, on this phone, with sample shop data, and nothing leaves it.
// Not role="note" (the rail badge owns that role on every screen); plain text, read in document order.
// After a reload the page picks up the session it kept (persist/). When it could not (the stored session was damaged, had
// ended or belonged to other keys) it started a new one and says so here, once: the record is gone, so the next load is quiet.
import type { ReactElement } from "react";
import { Bi } from "../../components/Bi";
import { label } from "../../i18n/label";
import { ON_DEVICE_NOTE } from "./info";

// NEEDS-REVIEW zh-HK (C-12).
const TEXT = label(ON_DEVICE_NOTE, "示範模式：Wally 喺你部手機上運行，用示範商店資料。資料不會離開你的手機。");
// NEEDS-REVIEW zh-HK (C-12).
const ENDED = label("Your last demo session ended, so Wally started a new one", "你上一次的示範已經結束，Wally 已開始新的一次");

export function OnDeviceNote({ sessionEnded = false }: { readonly sessionEnded?: boolean }): ReactElement {
  return (
    <div className="on-device-note soft" data-api-mode="local">
      <Bi as="p" text={TEXT} />
      {sessionEnded ? <Bi as="p" text={ENDED} className="on-device-note__ended" /> : null}
    </div>
  );
}

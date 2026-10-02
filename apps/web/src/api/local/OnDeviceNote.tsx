// The calm, always-visible line for on-device mode: the answers are recorded and nothing leaves the phone.
// Not role="note" (the rail badge owns that role on every screen); plain text, read in document order.
import type { ReactElement } from "react";
import { Bi } from "../../components/Bi";
import { label } from "../../i18n/label";
import { ON_DEVICE_NOTE } from "./info";

// NEEDS-REVIEW zh-HK (C-12).
const TEXT = label(ON_DEVICE_NOTE, "裝置模式：使用預先錄製的答案，資料不會離開你的手機");

export function OnDeviceNote(): ReactElement {
  return (
    <div className="on-device-note soft" data-api-mode="local">
      <Bi as="p" text={TEXT} />
    </div>
  );
}

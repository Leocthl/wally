// Places on Home that another lane fills. Each renders nothing until it does, so Home is complete without them.
import type { ReactElement } from "react";
import { useBoothContext } from "../../hooks/useBooth";
import { PhotoRow } from "../photo/PhotoEntry";
import { usePhotoEntry } from "../photo/usePhotoEntry";

/** "Show Wally a photo", directly under the "What do you need?" row. Not offered by a booth that cannot read or buy a pick. */
export function PhotoCardSlot(): ReactElement | null {
  const { busy } = useBoothContext();
  const onFile = usePhotoEntry();
  return onFile === undefined ? null : <PhotoRow onFile={onFile} busy={busy} />;
}

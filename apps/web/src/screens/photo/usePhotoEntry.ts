// Whether this booth can take a picture or the shopper's words, and the functions that hand them to the shell. They read the
// booth's flag, not the mere presence of see() on the client: an older booth server has no /api/see and leaves features.see
// out. Buying a pick needs ask() too. Undefined means "do not offer it": also where there is no shell to open the sheet
// (a sheet mounted on its own).
import { useBoothContext } from "../../hooks/useBooth";
import { useOptionalShell, type ShellApi } from "../../shell/ShellContext";

/** The shell, when this booth can find shop items for a picture or for words. */
function useShopShell(): ShellApi | null {
  const { api, info } = useBoothContext();
  const shell = useOptionalShell();
  const offered = typeof api.see === "function" && info?.features?.see !== undefined && info.features.ask === true;
  return shell !== null && offered ? shell : null;
}

/** Hands a chosen picture to the photo sheet. */
export function usePhotoEntry(): ((file: File) => void) | undefined {
  return useShopShell()?.showPhoto;
}

/** Hands the shopper's words to the same sheet: the fixed keyword reader finds the items, on every host. */
export function useShopSearch(): ((text: string) => void) | undefined {
  return useShopShell()?.showShopSearch;
}

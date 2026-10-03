// Whether this booth can take a picture, and the function that hands one to the shell. It reads the booth's flag, not the
// mere presence of see() on the client: an older booth server has no /api/see and leaves features.see out. Buying a pick needs
// ask() too. Undefined means "do not offer it": also where there is no shell to open the photo sheet (a sheet mounted on its own).
import { useBoothContext } from "../../hooks/useBooth";
import { useOptionalShell } from "../../shell/ShellContext";

export function usePhotoEntry(): ((file: File) => void) | undefined {
  const { api, info } = useBoothContext();
  const shell = useOptionalShell();
  const offered = typeof api.see === "function" && info?.features?.see !== undefined && info.features.ask === true;
  return shell !== null && offered ? shell.showPhoto : undefined;
}

// Whether this booth can take a picture, and the function that hands one to the shell. Both halves are needed: see() reads
// the picture (or just its colours) and ask() buys the pick. Undefined means "do not offer it": also where there is no shell
// to open the photo sheet (a sheet mounted on its own).
import { useBoothContext } from "../../hooks/useBooth";
import { useOptionalShell } from "../../shell/ShellContext";

export function usePhotoEntry(): ((file: File) => void) | undefined {
  const { api, info } = useBoothContext();
  const shell = useOptionalShell();
  return shell !== null && typeof api.see === "function" && info?.features?.ask === true ? shell.showPhoto : undefined;
}

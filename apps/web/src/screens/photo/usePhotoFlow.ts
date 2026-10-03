// The photo flow as state: prepare the picture on the phone, ask the booth to look at it (the local model when this booth
// has one, else the colour plates alone), then keep the matches in step with the chips. Every response carries the number
// of the request that asked for it, so a slow answer to an old tap can never overwrite a newer one, and closing the sheet
// drops whatever is still in flight. Failures end in a state the screen can word; nothing is bought here.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Fit, Kind } from "@wally/agent/vision";
import type { ApiClient, SeeAttributes, SeeResult, ShopMatch } from "../../api/types";
import { PrepareError, preparePhoto, type Prepared } from "./prepare";
import { sameAttributes, withKind, withPattern, withFit, withToggledColor, withToggledStyle } from "./photoModel";

export type PhotoProblem = "unreadable" | "too_large" | "failed";

export type PhotoPhase =
  | { readonly name: "idle" }
  | { readonly name: "preparing" }
  | { readonly name: "looking" }
  | { readonly name: "ready" }
  | { readonly name: "error"; readonly problem: PhotoProblem };

export interface PhotoView {
  readonly phase: PhotoPhase;
  /** Object URL of the re-encoded picture, for this page only; revoked on close. */
  readonly pictureUrl: string | null;
  /** "model": the booth's model reads the picture; "palette": the colour plates and the chips only. */
  readonly mode: "model" | "palette";
  readonly attributes: SeeAttributes;
  readonly palette: Prepared["palette"];
  readonly matches: readonly ShopMatch[];
  readonly notice: SeeResult["notice"] | undefined;
  /** A new look-up (after a chip tap) is in flight; the old matches stay on screen meanwhile. */
  readonly refreshing: boolean;
  readonly pickedId: string | null;
}

export interface PhotoActions {
  readonly setKind: (kind: Kind) => void;
  readonly toggleColor: (color: SeeAttributes["colors"][number]) => void;
  readonly setPattern: (pattern: NonNullable<SeeAttributes["pattern"]>) => void;
  readonly setFit: (fit: Exclude<Fit, "unknown">) => void;
  readonly toggleStyle: (style: SeeAttributes["style"][number]) => void;
  readonly pick: (listingId: string) => void;
  readonly retry: () => void;
}

export interface PhotoDeps {
  readonly api: ApiClient;
  /** "model" when info.features.see says the booth model reads pictures. */
  readonly mode: "model" | "palette";
  /** Tests replace the canvas work. */
  readonly prepare?: (file: File) => Promise<Prepared>;
  readonly createUrl?: (blob: Blob) => string;
  readonly revokeUrl?: (url: string) => void;
  /** Wait before a chip tap asks again, so a quick run of taps asks once. */
  readonly debounceMs?: number;
}

export const EMPTY_ATTRIBUTES: SeeAttributes = { kind: null, colors: [], pattern: null, fit: null, style: [] };
export const DEFAULT_DEBOUNCE_MS = 120;

function problemOf(err: unknown): PhotoProblem {
  if (err instanceof PrepareError) return err.reason;
  const { status, code } = (err ?? {}) as { status?: unknown; code?: unknown };
  if (status === 413 || code === "PAYLOAD_TOO_LARGE") return "too_large";
  if (code === "UNSUPPORTED_MEDIA_TYPE") return "unreadable";
  return "failed";
}

export function usePhotoFlow(file: File | null, deps: PhotoDeps): PhotoView & PhotoActions {
  const { api, mode } = deps;
  const [phase, setPhase] = useState<PhotoPhase>({ name: "idle" });
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const [attributes, setAttributes] = useState<SeeAttributes>(EMPTY_ATTRIBUTES);
  const [palette, setPalette] = useState<Prepared["palette"]>([]);
  const [matches, setMatches] = useState<readonly ShopMatch[]>([]);
  const [notice, setNotice] = useState<SeeResult["notice"] | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const run = useRef(0); // the number of the newest request; older answers are dropped
  const prepared = useRef<Prepared | null>(null);
  const picture = useRef<string | null>(null); // the object URL, released as soon as the sheet closes (a state updater would not run after unmount)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Looked up when used, not when rendering, so a browser without object URLs fails at the call (and ends in the error state).
  const urls = useRef<{ readonly create: (blob: Blob) => string; readonly revoke: (url: string) => void }>({ create: (blob) => URL.createObjectURL(blob), revoke: (url) => URL.revokeObjectURL(url) });
  urls.current = { create: deps.createUrl ?? ((blob) => URL.createObjectURL(blob)), revoke: deps.revokeUrl ?? ((url) => URL.revokeObjectURL(url)) };
  const prepare = deps.prepare ?? preparePhoto;
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS;

  const reset = useCallback(() => {
    run.current += 1;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    prepared.current = null;
    if (picture.current !== null) urls.current.revoke(picture.current);
    picture.current = null;
    setPhase({ name: "idle" });
    setPictureUrl(null);
    setAttributes(EMPTY_ATTRIBUTES);
    setPalette([]);
    setMatches([]);
    setNotice(undefined);
    setRefreshing(false);
    setPickedId(null);
  }, []);

  // A new file (or a retry) starts a fresh look; no file, or closing, drops everything in flight.
  useEffect(() => {
    reset();
    if (file === null) return undefined;
    const mine = run.current;
    const live = (): boolean => run.current === mine;
    setPhase({ name: "preparing" });
    void (async () => {
      try {
        const ready = await prepare(file);
        if (!live()) return;
        prepared.current = ready;
        picture.current = urls.current.create(ready.blob);
        setPictureUrl(picture.current);
        setPalette(ready.palette);
        setPhase({ name: "looking" });
        if (api.see === undefined) throw new Error("this booth cannot look at pictures");
        const out = await api.see(mode === "model" ? { image: { mime: "image/jpeg", data: ready.data }, palette: ready.palette } : { palette: ready.palette });
        if (!live()) return;
        setAttributes(out.attributes);
        setPalette(out.palette.length > 0 ? out.palette : ready.palette);
        setMatches(out.matches);
        setNotice(out.notice);
        setPhase({ name: "ready" });
      } catch (err) {
        if (live()) setPhase({ name: "error", problem: problemOf(err) });
      }
    })();
    return () => {
      run.current += 1;
    };
    // `prepare` and `api` are stable for one sheet; a new file or retry is what restarts the look.
  }, [file, attempt]);

  // The picture's object URL is released when the sheet goes away.
  useEffect(() => () => reset(), [reset]);

  const lookUp = useCallback(
    (next: SeeAttributes) => {
      if (timer.current !== null) clearTimeout(timer.current);
      const mine = (run.current += 1);
      setRefreshing(true);
      timer.current = setTimeout(() => {
        timer.current = null;
        void (async () => {
          try {
            if (api.see === undefined) throw new Error("this booth cannot look at pictures");
            const out = await api.see({ attributes: next, palette: prepared.current?.palette ?? [] });
            if (run.current !== mine) return;
            setMatches(out.matches);
            setNotice(undefined);
            setPickedId((id) => (id !== null && out.matches.some((m) => m.listingId === id) ? id : null));
            setRefreshing(false);
          } catch {
            if (run.current === mine) {
              setMatches([]);
              setRefreshing(false);
              setPhase({ name: "error", problem: "failed" });
            }
          }
        })();
      }, debounceMs);
    },
    [api, debounceMs],
  );

  const change = useCallback(
    (step: (a: SeeAttributes) => SeeAttributes) => {
      setAttributes((current) => {
        const next = step(current);
        if (!sameAttributes(current, next)) lookUp(next);
        return next;
      });
    },
    [lookUp],
  );

  return {
    phase,
    pictureUrl,
    mode,
    attributes,
    palette,
    matches,
    notice,
    refreshing,
    pickedId,
    setKind: useCallback((kind) => change((a) => withKind(a, kind)), [change]),
    toggleColor: useCallback((color) => change((a) => withToggledColor(a, color)), [change]),
    setPattern: useCallback((pattern) => change((a) => withPattern(a, pattern)), [change]),
    setFit: useCallback((fit) => change((a) => withFit(a, fit)), [change]),
    toggleStyle: useCallback((style) => change((a) => withToggledStyle(a, style)), [change]),
    pick: useCallback((listingId) => setPickedId((id) => (id === listingId ? null : listingId)), []),
    retry: useCallback(() => setAttempt((n) => n + 1), []),
  };
}

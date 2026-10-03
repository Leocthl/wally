// The photo flow as state: either prepare a picture on the phone and ask the booth to look at it (the local model when this
// booth has one, else the colour plates alone), or read the shopper's own words; then keep the matches in step with the
// chips. Every response carries the number of the request that asked for it, so a slow answer to an old tap can never
// overwrite a newer one, and closing the sheet drops whatever is still in flight. Failures end in a state the screen can
// word; nothing is bought here.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Fit, Kind } from "@wally/agent/vision";
import type { ApiClient, SeeAttributes, SeeResult, ShopMatch } from "../../api/types";
import { PrepareError, preparePhoto, type Prepared } from "./prepare";
import { sameAttributes, withKind, withPattern, withFit, withToggledColor, withToggledStyle } from "./photoModel";

export type PhotoProblem = "unreadable" | "too_large" | "failed";

/** What the sheet was opened for: a picture the shopper chose, or the words they typed. */
export type PhotoSource = { readonly kind: "picture"; readonly file: File } | { readonly kind: "words"; readonly text: string };

export type PhotoPhase =
  | { readonly name: "idle" }
  | { readonly name: "preparing" }
  | { readonly name: "looking" }
  | { readonly name: "ready" }
  | { readonly name: "error"; readonly problem: PhotoProblem };

export interface PhotoView {
  readonly phase: PhotoPhase;
  /** Object URL of the re-encoded picture, for this page only; revoked on close. Null for words. */
  readonly pictureUrl: string | null;
  /** "model": the booth's model reads the picture; "palette": the colour plates and the chips only; "words": the shopper's own words. */
  readonly mode: "model" | "palette" | "words";
  readonly attributes: SeeAttributes;
  readonly palette: Prepared["palette"];
  readonly matches: readonly ShopMatch[];
  /** The most the shopper said they would pay for the item, minor units; null: no limit. */
  readonly maxPriceMinor: number | null;
  readonly notice: SeeResult["notice"] | undefined;
  /** A new look-up (after a chip tap) is in flight; the old matches stay on screen meanwhile. */
  readonly refreshing: boolean;
  /** The last look-up after a chip tap failed; the list on screen is the one before it. */
  readonly lookupFailed: boolean;
  /** The shopper has changed a chip since Wally's own reading: the words on screen are theirs now, not Wally's. */
  readonly edited: boolean;
  /** How many look-ups after a chip tap have finished (0 until the first one): tells a refreshed list from the first answer. */
  readonly updates: number;
  /** The listing id of the card the shopper tapped, if any. */
  readonly pickedId: string | null;
}

export interface PhotoActions {
  readonly setKind: (kind: Kind) => void;
  readonly toggleColor: (color: SeeAttributes["colors"][number]) => void;
  readonly setPattern: (pattern: NonNullable<SeeAttributes["pattern"]>) => void;
  readonly setFit: (fit: Exclude<Fit, "unknown">) => void;
  readonly toggleStyle: (style: SeeAttributes["style"][number]) => void;
  /** Drops the price limit the words named, and looks again. */
  readonly clearLimit: () => void;
  readonly pick: (listingId: string) => void;
  /** Starts the whole look again (the picture or the words from the top). */
  readonly retry: () => void;
  /** Repeats the look-up that failed, with the chips as they are. */
  readonly retryLookup: () => void;
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

export function usePhotoFlow(source: PhotoSource | null, deps: PhotoDeps): PhotoView & PhotoActions {
  const { api } = deps;
  const mode: PhotoView["mode"] = source?.kind === "words" ? "words" : deps.mode;
  const [phase, setPhase] = useState<PhotoPhase>({ name: "idle" });
  const [pictureUrl, setPictureUrl] = useState<string | null>(null);
  const [attributes, setAttributes] = useState<SeeAttributes>(EMPTY_ATTRIBUTES);
  const [palette, setPalette] = useState<Prepared["palette"]>([]);
  const [matches, setMatches] = useState<readonly ShopMatch[]>([]);
  const [maxPriceMinor, setMaxPriceMinor] = useState<number | null>(null);
  const [notice, setNotice] = useState<SeeResult["notice"] | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [edited, setEdited] = useState(false);
  const [updates, setUpdates] = useState(0);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const run = useRef(0); // the number of the newest request; older answers are dropped
  const prepared = useRef<Prepared | null>(null);
  const current = useRef<{ readonly attributes: SeeAttributes; readonly maxPriceMinor: number | null }>({ attributes: EMPTY_ATTRIBUTES, maxPriceMinor: null });
  const picture = useRef<string | null>(null); // the object URL, released as soon as the sheet closes (a state updater would not run after unmount)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Looked up when used, not when rendering, so a browser without object URLs fails at the call (and ends in the error state).
  const urls = useRef<{ readonly create: (blob: Blob) => string; readonly revoke: (url: string) => void }>({ create: (blob) => URL.createObjectURL(blob), revoke: (url) => URL.revokeObjectURL(url) });
  const prepare = deps.prepare ?? preparePhoto;
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  useEffect(() => {
    urls.current = { create: deps.createUrl ?? ((blob) => URL.createObjectURL(blob)), revoke: deps.revokeUrl ?? ((url) => URL.revokeObjectURL(url)) };
  });

  const keep = useCallback((nextAttributes: SeeAttributes, nextLimit: number | null) => {
    current.current = { attributes: nextAttributes, maxPriceMinor: nextLimit };
    setAttributes(nextAttributes);
    setMaxPriceMinor(nextLimit);
  }, []);

  const reset = useCallback(() => {
    run.current += 1;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    prepared.current = null;
    if (picture.current !== null) urls.current.revoke(picture.current);
    picture.current = null;
    current.current = { attributes: EMPTY_ATTRIBUTES, maxPriceMinor: null };
    setPhase({ name: "idle" });
    setPictureUrl(null);
    setAttributes(EMPTY_ATTRIBUTES);
    setPalette([]);
    setMatches([]);
    setMaxPriceMinor(null);
    setNotice(undefined);
    setRefreshing(false);
    setLookupFailed(false);
    setEdited(false);
    setUpdates(0);
    setPickedId(null);
  }, []);

  // What the look is for, by value: the same picture or the same words in a new object are not a new look.
  const subject: File | string | null = source === null ? null : source.kind === "words" ? source.text : source.file;
  const subjectKind = source?.kind ?? null;

  // A new picture or words (or a retry) start a fresh look; nothing to look at, or closing, drops everything in flight.
  useEffect(() => {
    reset();
    if (source === null) return undefined;
    const mine = run.current;
    const live = (): boolean => run.current === mine;
    const settle = (out: SeeResult, fallbackPalette: Prepared["palette"]): void => {
      keep(out.attributes, out.maxPriceMinor ?? null);
      setPalette(out.palette.length > 0 ? out.palette : fallbackPalette);
      setMatches(out.matches);
      setNotice(out.notice);
      setPhase({ name: "ready" });
    };
    void (async () => {
      try {
        if (api.see === undefined) throw new Error("this booth cannot look at pictures");
        if (source.kind === "words") {
          setPhase({ name: "looking" });
          const out = await api.see({ text: source.text });
          if (live()) settle(out, []);
          return;
        }
        setPhase({ name: "preparing" });
        const ready = await prepare(source.file);
        if (!live()) return;
        prepared.current = ready;
        picture.current = urls.current.create(ready.blob);
        setPictureUrl(picture.current);
        setPalette(ready.palette);
        setPhase({ name: "looking" });
        const out = await api.see(mode === "model" ? { image: { mime: "image/jpeg", data: ready.data }, palette: ready.palette } : { palette: ready.palette });
        if (live()) settle(out, ready.palette);
      } catch (err) {
        if (live()) setPhase({ name: "error", problem: problemOf(err) });
      }
    })();
    return () => {
      run.current += 1;
    };
    // `prepare`, `api` and `mode` are stable for one sheet; a new subject or a retry is what restarts the look.
  }, [subjectKind, subject, attempt]);

  // The picture's object URL is released when the sheet goes away.
  useEffect(() => () => reset(), [reset]);

  const lookUp = useCallback(
    (next: SeeAttributes, limit: number | null) => {
      if (timer.current !== null) clearTimeout(timer.current);
      const mine = (run.current += 1);
      setRefreshing(true);
      setLookupFailed(false);
      timer.current = setTimeout(() => {
        timer.current = null;
        void (async () => {
          try {
            if (api.see === undefined) throw new Error("this booth cannot look at pictures");
            const out = await api.see({ attributes: next, palette: prepared.current?.palette ?? [], ...(limit === null ? {} : { maxPriceMinor: limit }) });
            if (run.current !== mine) return;
            setMatches(out.matches);
            setNotice(undefined);
            setPickedId((id) => (id !== null && out.matches.some((m) => m.listingId === id) ? id : null));
            setUpdates((n) => n + 1);
            setRefreshing(false);
          } catch {
            // The list on screen stays (it was true for the chips before this tap); the screen says the look-up failed and offers to repeat it.
            if (run.current === mine) {
              setRefreshing(false);
              setLookupFailed(true);
            }
          }
        })();
      }, debounceMs);
    },
    [api, debounceMs],
  );

  const change = useCallback(
    (step: (a: SeeAttributes) => SeeAttributes) => {
      const before = current.current;
      const next = step(before.attributes);
      if (sameAttributes(before.attributes, next)) return;
      keep(next, before.maxPriceMinor);
      setEdited(true);
      lookUp(next, before.maxPriceMinor);
    },
    [keep, lookUp],
  );

  return {
    phase,
    pictureUrl,
    mode,
    attributes,
    palette,
    matches,
    maxPriceMinor,
    notice,
    refreshing,
    lookupFailed,
    edited,
    updates,
    pickedId,
    setKind: useCallback((kind) => change((a) => withKind(a, kind)), [change]),
    toggleColor: useCallback((color) => change((a) => withToggledColor(a, color)), [change]),
    setPattern: useCallback((pattern) => change((a) => withPattern(a, pattern)), [change]),
    setFit: useCallback((fit) => change((a) => withFit(a, fit)), [change]),
    toggleStyle: useCallback((style) => change((a) => withToggledStyle(a, style)), [change]),
    clearLimit: useCallback(() => {
      const before = current.current;
      if (before.maxPriceMinor === null) return;
      keep(before.attributes, null);
      setEdited(true);
      lookUp(before.attributes, null);
    }, [keep, lookUp]),
    pick: useCallback((listingId) => setPickedId((id) => (id === listingId ? null : listingId)), []),
    retry: useCallback(() => setAttempt((n) => n + 1), []),
    retryLookup: useCallback(() => lookUp(current.current.attributes, current.current.maxPriceMinor), [lookUp]),
  };
}

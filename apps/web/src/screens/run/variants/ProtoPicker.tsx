// The floating variant picker (prototype skill, PICKER.md): number keys 1 to N and the arrow keys switch, R replays,
// the choice lives in the address (?v=2). Chrome for the dev-only variant routes; production never imports it.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { PICKER_CSS } from "./pickerStyles";

export interface ProtoPickerProps {
  readonly names: readonly string[];
  /** Zero-based index of the variant on show. */
  readonly index: number;
  readonly onSelect: (index: number) => void;
  /** Remounts the variant so its entrance runs again. Omit when nothing animates. */
  readonly onReplay?: () => void;
  readonly position?: "top" | "bottom";
}

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

export function ProtoPicker({ names, index, onSelect, onReplay, position = "bottom" }: ProtoPickerProps): ReactElement {
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const [box, setBox] = useState<{ readonly width: number; readonly left: number }>({ width: 0, left: 0 });
  const [ready, setReady] = useState(false);

  const measure = useCallback(() => {
    const el = items.current[index];
    if (el) setBox({ width: el.offsetWidth, left: el.offsetLeft });
  }, [index]);
  useLayoutEffect(measure, [measure, names]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number.parseInt(e.key, 10);
      if (n >= 1 && n <= names.length) onSelect(n - 1);
      else if (e.key === "ArrowRight") onSelect((index + 1) % names.length);
      else if (e.key === "ArrowLeft") onSelect((index - 1 + names.length) % names.length);
      else if ((e.key === "r" || e.key === "R") && onReplay) onReplay();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, names.length, onReplay, onSelect]);

  return (
    <>
    <style>{PICKER_CSS}</style>
    <nav className="proto-picker" aria-label="Prototype variants" data-position={position} {...(ready ? { "data-ready": "" } : {})}>
      <span className="proto-picker-highlight" aria-hidden="true" style={{ width: box.width, transform: `translateX(${box.left}px)` }} />
      {names.map((name, i) => (
        <button
          key={name}
          ref={(el) => {
            items.current[i] = el;
          }}
          type="button"
          className="proto-picker-item"
          {...(i === index ? { "data-active": "", "aria-current": "true" as const } : {})}
          onClick={() => onSelect(i)}
        >
          {name}
        </button>
      ))}
      {onReplay ? (
        <>
          <span className="proto-picker-divider" aria-hidden="true" />
          <button type="button" className="proto-picker-item proto-picker-replay" aria-label="Replay animation (R)" onClick={onReplay}>{"↻"}</button>
        </>
      ) : null}
    </nav>
    </>
  );
}

// The variant picker (prototype skill, PICKER.md): a floating dark pill, bottom centre. Keys 1 to N and the arrows switch,
// R replays; the choice lives in the address (?v=2) so a reload keeps it. Switching re-mounts the variant so its entrance
// runs again, and the swap itself is instant (flipping is a hundred-times action).
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { PICKER_CSS } from "./pickerStyle";

export interface PickerVariant {
  readonly name: string;
  readonly render: () => ReactNode;
}

function readChoice(count: number): number {
  const query = window.location.hash.split("?", 2)[1] ?? "";
  const v = Number.parseInt(new URLSearchParams(query).get("v") ?? "", 10);
  return Number.isInteger(v) && v >= 1 && v <= count ? v - 1 : 0;
}

function writeChoice(index: number): void {
  const [path = "", query = ""] = window.location.hash.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("v", String(index + 1));
  window.history.replaceState(window.history.state, "", `${path}?${params.toString()}`);
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof Element && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || (target as HTMLElement).isContentEditable);
}

export function VariantPicker({ variants, position = "bottom", replay = true }: { readonly variants: readonly PickerVariant[]; readonly position?: "top" | "bottom"; readonly replay?: boolean }): ReactElement {
  const [current, setCurrent] = useState(() => readChoice(variants.length));
  const [mountKey, setMountKey] = useState(0);
  const [ready, setReady] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const [box, setBox] = useState({ left: 0, width: 0 });

  const select = useCallback((i: number) => {
    if (i < 0 || i >= variants.length) return;
    setCurrent(i);
    setMountKey((k) => k + 1);
    writeChoice(i);
  }, [variants.length]);

  useLayoutEffect(() => {
    const el = items.current[current];
    if (el) setBox({ left: el.offsetLeft, width: el.offsetWidth });
  }, [current, variants.length]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => window.requestAnimationFrame(() => setReady(true)));
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const num = Number.parseInt(e.key, 10);
      if (num >= 1 && num <= variants.length) select(num - 1);
      else if (e.key === "ArrowRight") select((current + 1) % variants.length);
      else if (e.key === "ArrowLeft") select((current - 1 + variants.length) % variants.length);
      else if ((e.key === "r" || e.key === "R") && replay) setMountKey((k) => k + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, replay, select, variants.length]);

  const active = variants[current];
  return (
    <>
      <style>{PICKER_CSS}</style>
      <div key={mountKey} data-variant={current + 1}>{active?.render()}</div>
      <nav ref={nav} className="proto-picker" data-position={position === "top" ? "top" : undefined} data-ready={ready ? "" : undefined} aria-label="Prototype variants">
        <span className="proto-picker-highlight" aria-hidden="true" style={{ width: box.width, transform: `translateX(${box.left}px)` }} />
        {variants.map((v, i) => (
          <button key={v.name} ref={(el) => { items.current[i] = el; }} type="button" className="proto-picker-item" data-active={i === current ? "" : undefined} aria-current={i === current ? "true" : undefined} onClick={() => select(i)}>
            {v.name}
          </button>
        ))}
        {replay ? (
          <>
            <span className="proto-picker-divider" aria-hidden="true" />
            <button type="button" className="proto-picker-item proto-picker-replay" aria-label="Replay animation (R)" onClick={() => setMountKey((k) => k + 1)}>↻</button>
          </>
        ) : null}
      </nav>
    </>
  );
}

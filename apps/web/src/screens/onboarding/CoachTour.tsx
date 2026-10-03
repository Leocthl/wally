// Step four, the quick tour: three coach marks over the real Budget screen, on Ask, Ideas for you and the tabs. A ring marks the
// target, a card above the tab bar says what it is. Next moves on, Skip tour (or Escape, wherever focus is) ends it at once, and
// the last mark ends it too. The tour is modal: the page behind is inert and a tap on the dim layer keeps focus on the card.
// Nothing here changes the booth.
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type RefObject } from "react";
import { OB } from "../../i18n/onboarding";
import type { LabelPair } from "../../i18n/label";
import { Button } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { useFocusTrap } from "../../ui/hooks/useFocusTrap";
import { haptic } from "../../ui/haptics";
import { Icon } from "../../ui/icons";
import { useLocale } from "../../ui/locale";
import { nextMark, spotlightBox, type Box } from "./coachGeometry";
import { useOnboarding } from "./OnboardingProvider";
import "./onboarding.css";

interface Mark {
  readonly id: "ask" | "ideas" | "tabs";
  readonly title: LabelPair;
  readonly body: LabelPair;
  readonly shape: "round" | "card" | "bar";
  /** The element to ring, or null when the screen does not have it (then the mark is skipped). */
  readonly find: () => HTMLElement | null;
  /** The target sits below the fold: scroll it under the top bar before the ring is drawn. */
  readonly scroll?: boolean;
}

const MARKS: readonly Mark[] = [
  // The "What do you need?" row; on a screen without it (a budget that is over) the Ask button in the tab bar.
  { id: "ask", title: OB.tour.ask.title, body: OB.tour.ask.body, shape: "round", scroll: true, find: () => document.querySelector<HTMLElement>("[data-composer]") ?? document.querySelector<HTMLElement>(".w-tabbar__fab") ?? document.querySelector<HTMLElement>(".shell-bar__ask") },
  { id: "ideas", title: OB.tour.ideas.title, body: OB.tour.ideas.body, shape: "card", scroll: true, find: () => document.querySelector<HTMLElement>('[data-tour="ideas"]') },
  { id: "tabs", title: OB.tour.tabs.title, body: OB.tour.tabs.body, shape: "bar", find: () => document.querySelector<HTMLElement>("nav.w-tabbar, nav.shell-topnav") },
];

/** Room around a target, and between the ring and the card. */
const PAD_PX = 8;
const GAP_PX = 12;

const present = (): readonly boolean[] => MARKS.map((m) => m.find() !== null);

function boxOf(el: HTMLElement): Box {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/** A target in the fixed tab bar is always on screen: scrolling the page for it would only move the page away. */
function inFixedLayer(el: HTMLElement): boolean {
  for (let node: HTMLElement | null = el; node !== null; node = node.parentElement) {
    if (getComputedStyle(node).position === "fixed") return true;
  }
  return false;
}

/** Everything in the page but the tour is inert while it runs (a screen reader and the keyboard stay on the card). */
function useInertPage(active: boolean, keep: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!active) return undefined;
    const changed: HTMLElement[] = [];
    for (const el of Array.from(document.body.children)) {
      if (!(el instanceof HTMLElement) || el.hasAttribute("inert") || el.tagName === "SCRIPT" || el.tagName === "STYLE") continue;
      if (keep.current !== null && el.contains(keep.current)) continue;
      el.setAttribute("inert", "");
      changed.push(el);
    }
    return () => {
      for (const el of changed) el.removeAttribute("inert");
    };
  }, [active, keep]);
}

/** Brings a target that sits below the fold up under the shell's top bar. */
function scrollUnderBar(el: HTMLElement): void {
  const bar = document.querySelector<HTMLElement>(".shell-bar");
  const offset = (bar?.getBoundingClientRect().height ?? 0) + GAP_PX;
  document.documentElement.scrollTop += el.getBoundingClientRect().top - offset;
}

export default function CoachTour(): ReactElement | null {
  const { finishTour } = useOnboarding();
  const { t, locale } = useLocale();
  const titleId = useId();
  const bodyId = useId();
  const card = useRef<HTMLDivElement>(null);
  // undefined: not looked yet. The tour can start in the same commit that mounts the shell (the chunk is already cached on a
  // replay), so the targets are looked for after that commit, not while rendering.
  const [at, setAt] = useState<number | null | undefined>(undefined);
  const [box, setBox] = useState<Box | null>(null);
  const mark = at === null || at === undefined ? null : (MARKS[at] ?? null);
  const flags = present();
  const shown = MARKS.map((_, i) => i).filter((i) => flags[i]);
  const position = at === null || at === undefined ? 0 : shown.indexOf(at) + 1;
  const last = at !== null && at !== undefined && nextMark(flags, at, 1) === null;

  // The tour moved the page to show its targets: Budget ends where it began, with the greeting in view.
  const end = useCallback(() => {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    finishTour();
  }, [finishTour]);
  const open = mark !== null;
  // The page is made inert first, so on the way out it is given back before the trap returns focus to the element that opened it.
  useInertPage(open, card);
  useFocusTrap(open, card, end);

  // Escape ends the tour wherever focus is (the trap only hears the card).
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") end();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, end]);

  useEffect(() => {
    setAt(nextMark(present(), -1, 1));
  }, []);

  // Nothing to point at (the screen has none of the targets): the tour has no mark to show, so it ends.
  useEffect(() => {
    if (at === null) end();
  }, [at, end]);

  const measure = useCallback(() => {
    const target = mark?.find() ?? null;
    if (target === null) {
      setBox(null);
      return;
    }
    const view = { width: window.innerWidth, height: window.innerHeight };
    const where = boxOf(target);
    // The ring stops above the card when the target is up the page; a target at or below the card (Ask, the tabs) is ringed whole.
    const cardTop = card.current?.getBoundingClientRect().top ?? view.height;
    setBox(spotlightBox(where, view, PAD_PX, where.top < cardTop ? cardTop - GAP_PX : view.height));
  }, [mark]);

  // A new mark: scroll its target into view if it needs it and draw the ring.
  useLayoutEffect(() => {
    const target = mark?.find() ?? null;
    if (mark?.scroll === true && target !== null && !inFixedLayer(target)) scrollUnderBar(target);
    measure();
  }, [mark, measure]);

  // Focus rests on the card when the tour opens (after the trap has moved it in), so a screen reader reads the first mark. Later
  // marks leave focus on Next, which stays where it is, and are announced by the live region on the card.
  useEffect(() => {
    if (open) card.current?.focus({ preventScroll: true });
  }, [open]);

  // The ring follows the target when the page moves under it: scrolling, resizing, and layout that settles late (a font, a hint).
  useEffect(() => {
    let frame = 0;
    const again = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", again);
    window.addEventListener("scroll", again, true);
    const watcher = typeof ResizeObserver === "function" ? new ResizeObserver(again) : null;
    watcher?.observe(document.body);
    const target = mark?.find() ?? null;
    if (target !== null) watcher?.observe(target);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", again);
      window.removeEventListener("scroll", again, true);
      watcher?.disconnect();
    };
  }, [measure, mark]);

  if (mark === null) return null;
  const move = (step: 1 | -1): void => {
    const to = nextMark(present(), at ?? 0, step);
    if (to === null) {
      if (step === 1) haptic("success");
      end();
      return;
    }
    haptic("tap");
    setAt(to);
  };
  const total = shown.length;
  return createPortal(
    <div className="tour" lang={locale} data-tour-overlay data-mark={mark.id}>
      {/* A tap on the dim layer does nothing, and must not pull focus off the card either. */}
      <div className="tour__block" data-dim={box === null || undefined} aria-hidden="true" onMouseDown={(e) => e.preventDefault()} />
      {box !== null ? <div className={cx("tour__spot", `tour__spot--${mark.shape}`)} style={{ top: box.top, left: box.left, width: box.width, height: box.height }} aria-hidden="true" /> : null}
      <div ref={card} className="tour__card" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId} tabIndex={-1}>
        <div className="tour__top">
          <span className="tour__label"><Icon name="info" size={16} /> {t(OB.tour.label)}</span>
          <span className="tour__dots" aria-hidden="true">
            {shown.map((i) => <span key={i} className="tour__dot" data-on={i === at || undefined} />)}
          </span>
          <span className="sr-only">{t(OB.tour.markOf(String(position), String(total)))}</span>
        </div>
        <div className="tour__words" aria-live="polite" aria-atomic="true">
          <h2 id={titleId} className="tour__title">{t(mark.title)}</h2>
          <p id={bodyId} className="tour__body">{t(mark.body)}</p>
        </div>
        <div className="tour__actions">
          <Button variant="ghost" onClick={end} data-skip-tour>{t(OB.tour.skip)}</Button>
          <Button onClick={() => move(1)} iconEnd={last ? <Icon name="check" size={20} /> : <Icon name="chevronRight" size={20} />} data-next-mark>
            {last ? t(OB.done) : t(OB.next)}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

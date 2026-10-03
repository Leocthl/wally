// Surfaces: Card, Divider, List and ListRow, VisuallyHidden, Skeleton. Layout only; content decides the words.
import type { ElementType, HTMLAttributes, ReactElement, ReactNode } from "react";
import "../design/ui/surface.css";
import { cx } from "./cx";
import { Icon } from "./icons";

export type CardTone = "surface" | "hero" | "ticket" | "sunken" | "ok" | "warn" | "stop" | "info";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  readonly as?: "section" | "article" | "div" | "aside";
  readonly tone?: CardTone;
  readonly padding?: "none" | "md" | "lg";
  /** Soft shadow for cards that float above the page. */
  readonly elevated?: boolean;
  /** Dashed edge: something that did not happen ("No card was made"). */
  readonly dashed?: boolean;
}

export function Card({ as = "section", tone = "surface", padding = "md", elevated = false, dashed = false, className, children, ...rest }: CardProps): ReactElement {
  const Tag = as as ElementType;
  return (
    <Tag className={cx("w-card", `w-card--${tone}`, `w-card--pad-${padding}`, elevated && "w-card--elevated", dashed && "w-card--dashed", className)} {...rest}>
      {children}
    </Tag>
  );
}

export function Divider({ inset = false, className }: { readonly inset?: boolean; readonly className?: string }): ReactElement {
  return <hr className={cx("w-divider", inset && "w-divider--inset", className)} />;
}

export function VisuallyHidden({ children, as = "span" }: { readonly children: ReactNode; readonly as?: "span" | "div" | "h2" | "h3" }): ReactElement {
  const Tag = as as ElementType;
  return <Tag className="sr-only">{children}</Tag>;
}

export interface HeroPanelProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly label?: string;
}

/** Full-bleed balance header with rounded bottom corners; sits under the status bar and clears the notch. */
export function HeroPanel({ children, className, label }: HeroPanelProps): ReactElement {
  return <section className={cx("w-hero", className)} aria-label={label}>{children}</section>;
}

export interface ListProps {
  readonly children: ReactNode;
  /** Grouped card look (iOS inset list). */
  readonly inset?: boolean;
  /** Each row its own rounded card, with a gap. */
  readonly cards?: boolean;
  readonly label?: string;
  readonly className?: string;
}

export function List({ children, inset = false, cards = false, label, className }: ListProps): ReactElement {
  return (
    <ul className={cx("w-list", inset && "w-list--inset", cards && "w-list--cards", className)} aria-label={label}>
      {children}
    </ul>
  );
}

export interface ListRowProps {
  readonly title: ReactNode;
  readonly subtitle?: ReactNode;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  /** Renders the row as a link. */
  readonly href?: string;
  /** Renders the row as a button. */
  readonly onClick?: () => void;
  /** Shows a chevron after the trailing slot (only for rows that navigate). */
  readonly chevron?: boolean;
  /** Tint of the leading badge. */
  readonly tone?: "primary" | "ok" | "stop" | "warn" | "neutral";
  readonly className?: string;
  readonly lang?: string;
  /** More inside the same list item, under the row's own target (never inside it, where a control cannot nest): a list of steps. */
  readonly extra?: ReactNode;
}

function RowBody({ title, subtitle, leading, trailing, chevron, tone = "primary" }: Pick<ListRowProps, "title" | "subtitle" | "leading" | "trailing" | "chevron" | "tone">): ReactElement {
  return (
    <>
      {leading ? <span className={cx("w-row__leading", `w-row__leading--${tone}`)}>{leading}</span> : null}
      <span className="w-row__text">
        <span className="w-row__title">{title}</span>
        {subtitle ? <span className="w-row__subtitle">{subtitle}</span> : null}
      </span>
      {trailing ? <span className="w-row__trailing">{trailing}</span> : null}
      {chevron ? <Icon name="chevronRight" size={20} className="w-row__chevron" /> : null}
    </>
  );
}

export function ListRow({ href, onClick, className, lang, extra, ...body }: ListRowProps): ReactElement {
  const inner = <RowBody {...body} />;
  if (href !== undefined) {
    return <li className={cx("w-row", className)} lang={lang}><a className="w-row__hit" href={href}>{inner}</a>{extra}</li>;
  }
  if (onClick) {
    return <li className={cx("w-row", className)} lang={lang}><button type="button" className="w-row__hit" onClick={onClick}>{inner}</button>{extra}</li>;
  }
  return <li className={cx("w-row", className)} lang={lang}><div className="w-row__hit w-row__hit--static">{inner}</div>{extra}</li>;
}

export interface SkeletonProps {
  readonly width?: string;
  readonly height?: string;
  readonly radius?: "sm" | "md" | "pill";
  /** Several text lines; the last is shorter. */
  readonly lines?: number;
}

export function Skeleton({ width = "100%", height = "1rem", radius = "sm", lines = 1 }: SkeletonProps): ReactElement {
  return (
    <span className="w-skeleton-group" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className={cx("w-skeleton", `w-skeleton--${radius}`)} style={{ width: lines > 1 && i === lines - 1 ? "62%" : width, height }} />
      ))}
    </span>
  );
}

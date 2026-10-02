// Button and IconButton: token-only styling, 44 px minimum (48 px default, 56 px for full-width calls to action).
// Loading keeps focus and width, sets aria-busy and announces "Loading"; a loading or disabled button ignores clicks.
import { forwardRef, type ButtonHTMLAttributes, type MouseEvent, type ReactElement, type ReactNode } from "react";
import "../design/ui/button.css";
import { UI } from "../i18n/ui";
import { cx } from "./cx";
import { useLocale } from "./locale";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "on-hero";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  readonly variant?: ButtonVariant;
  /** sm 44 px, md 48 px (default), lg 56 px. */
  readonly size?: ButtonSize;
  readonly loading?: boolean;
  readonly icon?: ReactNode;
  readonly iconEnd?: ReactNode;
  /** Full width of its container. */
  readonly block?: boolean;
  readonly type?: "button" | "submit" | "reset";
}

function Spinner(): ReactElement {
  return <span className="w-spinner" aria-hidden="true" />;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, icon, iconEnd, block = false, type = "button", className, children, onClick, disabled, ...rest },
  ref,
): ReactElement {
  const { t } = useLocale();
  const inert = loading || disabled === true;
  const handle = (e: MouseEvent<HTMLButtonElement>): void => {
    if (inert) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };
  return (
    <button
      ref={ref}
      type={type}
      className={cx("w-btn", `w-btn--${variant}`, `w-btn--${size}`, block && "w-btn--block", loading && "w-btn--loading", className)}
      aria-busy={loading || undefined}
      aria-disabled={inert || undefined}
      onClick={handle}
      {...rest}
    >
      {loading ? <Spinner /> : icon ? <span className="w-btn__icon">{icon}</span> : null}
      <span className="w-btn__label">{children}</span>
      {iconEnd && !loading ? <span className="w-btn__icon">{iconEnd}</span> : null}
      {loading ? <span className="sr-only">{t(UI.loading)}</span> : null}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "children" | "aria-label"> {
  /** Required accessible name, in the current language. */
  readonly label: string;
  readonly icon: ReactNode;
  readonly variant?: "ghost" | "secondary" | "primary" | "on-hero";
  /** sm 44 px (default), md 48 px. */
  readonly size?: "sm" | "md";
  readonly type?: "button" | "submit" | "reset";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = "ghost", size = "sm", type = "button", className, ...rest },
  ref,
): ReactElement {
  return (
    <button ref={ref} type={type} aria-label={label} title={label} className={cx("w-icon-btn", `w-icon-btn--${variant}`, `w-icon-btn--${size}`, className)} {...rest}>
      {icon}
    </button>
  );
});

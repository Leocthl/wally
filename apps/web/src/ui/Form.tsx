// Form controls: TextField, TextArea and Switch. Inputs are 16 px or larger (no iOS zoom), labels are real <label>s,
// hints and errors are linked with aria-describedby, an error sets aria-invalid and reads as text, not colour alone.
import { useId, type InputHTMLAttributes, type ReactElement, type ReactNode, type TextareaHTMLAttributes } from "react";
import "../design/ui/form.css";
import { cx } from "./cx";
import { Icon } from "./icons";

interface FieldChrome {
  readonly label: string;
  /** Hide the label visually (it stays the accessible name), e.g. the pill composer. */
  readonly hideLabel?: boolean;
  readonly hint?: ReactNode;
  readonly error?: ReactNode;
}

function describedBy(id: string, hint: unknown, error: unknown): string | undefined {
  const ids = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ");
  return ids || undefined;
}

function Messages({ id, hint, error }: { readonly id: string; readonly hint: ReactNode; readonly error: ReactNode }): ReactElement {
  return (
    <>
      {hint ? <span id={`${id}-hint`} className="w-field__hint">{hint}</span> : null}
      {error ? (
        <span id={`${id}-error`} className="w-field__error">
          <Icon name="alert" size={16} />
          {error}
        </span>
      ) : null}
    </>
  );
}

export interface TextFieldProps extends FieldChrome, Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  /** "pill" is the rounded composer ("Ask Wally to buy..."). */
  readonly variant?: "default" | "pill";
}

export function TextField({ label, hideLabel = false, hint, error, leading, trailing, variant = "default", className, id: given, type = "text", ...input }: TextFieldProps): ReactElement {
  const auto = useId();
  const id = given ?? auto;
  return (
    <div className={cx("w-field", `w-field--${variant}`, error ? "w-field--invalid" : null, className)}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : "w-field__label"}>{label}</label>
      <span className="w-field__box">
        {leading ? <span className="w-field__adorn">{leading}</span> : null}
        <input id={id} type={type} className="w-field__input" aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...input} />
        {trailing ? <span className="w-field__adorn w-field__adorn--end">{trailing}</span> : null}
      </span>
      <Messages id={id} hint={hint} error={error} />
    </div>
  );
}

export interface TextAreaProps extends FieldChrome, TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function TextArea({ label, hideLabel = false, hint, error, className, id: given, rows = 3, ...area }: TextAreaProps): ReactElement {
  const auto = useId();
  const id = given ?? auto;
  return (
    <div className={cx("w-field", error ? "w-field--invalid" : null, className)}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : "w-field__label"}>{label}</label>
      <span className="w-field__box w-field__box--area">
        <textarea id={id} rows={rows} className="w-field__input w-field__input--area" aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} {...area} />
      </span>
      <Messages id={id} hint={hint} error={error} />
    </div>
  );
}

export interface SwitchProps {
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly label: string;
  readonly description?: string;
  readonly disabled?: boolean;
}

export function Switch({ checked, onChange, label, description, disabled = false }: SwitchProps): ReactElement {
  const id = useId();
  return (
    <div className="w-switch">
      <span className="w-switch__text">
        <span id={`${id}-label`} className="w-switch__label">{label}</span>
        {description ? <span id={`${id}-desc`} className="w-switch__desc">{description}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled}
        className="w-switch__control"
        onClick={() => onChange(!checked)}
      >
        <span className="w-switch__thumb">{checked ? <Icon name="check" size={14} strokeWidth={3} /> : null}</span>
      </button>
    </div>
  );
}

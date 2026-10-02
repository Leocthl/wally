// RevokeButton (docs/04, PACKET): hold --dur-hold to confirm, early release cancels, keyboard holds Space or Enter.
// A real <button> with a visible fill, an accessible hint and role="status" on completion.
import { useId, type KeyboardEvent, type ReactElement } from "react";
import { useHold } from "../hooks/useHold";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { S } from "../i18n/strings";
import { Bi } from "./Bi";

export interface RevokeButtonProps {
  readonly onRevoke: () => void;
  readonly disabled?: boolean;
}

const HOLD_KEYS = new Set(["Enter", " "]);

export function RevokeButton({ onRevoke, disabled = false }: RevokeButtonProps): ReactElement {
  const reduced = useReducedMotion();
  const hold = useHold(onRevoke, reduced);
  const hintId = useId();
  const blocked = disabled || hold.done;

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (!HOLD_KEYS.has(e.key)) return;
    e.preventDefault(); // stops the native click that Space or Enter would fire
    if (!e.repeat && !blocked) hold.start();
  };
  const onKeyUp = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (HOLD_KEYS.has(e.key)) hold.cancel();
  };

  return (
    <div className="revoke" data-register="packet">
      <button
        type="button"
        className="btn btn--danger tap revoke__button"
        disabled={blocked}
        aria-describedby={hintId}
        data-holding={hold.holding}
        data-motion={reduced ? "reduced" : "full"}
        data-step={hold.step}
        onPointerDown={(e) => {
          if (e.button === 0 && !blocked) hold.start();
        }}
        onPointerUp={hold.cancel}
        onPointerLeave={hold.cancel}
        onPointerCancel={hold.cancel}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={hold.cancel}
        onClick={(e) => e.preventDefault()}
      >
        <span className="revoke__fill" aria-hidden="true" />
        <span className="revoke__label">
          <Bi text={S.revokeButton} />
        </span>
      </button>
      <p id={hintId} className="soft revoke__hint">
        <span className="bi__en">{S.revokeHold.en}</span> <span lang="zh-HK">{S.revokeHold.zh}</span>
      </p>
      {hold.done ? (
        <p role="status" className="revoke__done">
          <Bi text={S.revokeDone} />
        </p>
      ) : null}
    </div>
  );
}

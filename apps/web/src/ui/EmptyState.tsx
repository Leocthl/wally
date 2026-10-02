// EmptyState: Wally, one short title, one line of help and at most one action. Wally is decorative here because the
// title says the same thing in words.
import type { ReactElement, ReactNode } from "react";
import "../design/ui/feedback.css";
import { Wally, type WallyState } from "../wally/Wally";

export interface EmptyStateProps {
  readonly title: string;
  readonly body?: ReactNode;
  readonly action?: ReactNode;
  readonly wally?: WallyState;
  readonly size?: number;
}

export function EmptyState({ title, body, action, wally = "idle", size = 120 }: EmptyStateProps): ReactElement {
  return (
    <div className="w-empty">
      <Wally state={wally} size={size} decorative />
      <p className="w-empty__title">{title}</p>
      {body ? <p className="w-empty__body">{body}</p> : null}
      {action ? <div className="w-empty__action">{action}</div> : null}
    </div>
  );
}

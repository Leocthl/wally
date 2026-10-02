// A screen that throws never leaves a blank page: Wally (asleep) says so, with Try again and Go to your budget.
// resetKey (the route) clears the error when the visitor moves on.
import { Component, type ErrorInfo, type ReactElement, type ReactNode } from "react";
import { routeHref } from "../hooks/useRoute";
import { UI } from "../i18n/ui";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Icon } from "../ui/icons";
import { useLocale } from "../ui/locale";

export function ScreenError({ onRetry }: { readonly onRetry: () => void }): ReactElement {
  const { t } = useLocale();
  return (
    <div className="shell-fallback" role="alert">
      <EmptyState
        wally="offline"
        title={t(UI["shell.errorTitle"])}
        body={t(UI["shell.errorBody"])}
        action={
          <div className="shell-fallback__actions">
            <Button icon={<Icon name="refresh" size={20} />} onClick={onRetry}>{t(UI["shell.retry"])}</Button>
            <a className="w-btn w-btn--ghost w-btn--md" href={routeHref("budget")}><span className="w-btn__label">{t(UI["shell.goBudget"])}</span></a>
          </div>
        }
      />
    </div>
  );
}

interface Props {
  readonly children: ReactNode;
  readonly resetKey: string;
  /** Rendered instead of the children after an error; gets a retry that clears it. */
  readonly fallback?: (retry: () => void) => ReactNode;
}

interface State {
  readonly failed: boolean;
  readonly key: string;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false, key: this.props.resetKey };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.key ? null : { failed: false, key: props.resetKey };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept for the booth crew's console; the screen already says what to do.
    console.error("screen failed", error, info.componentStack);
  }

  private readonly retry = (): void => this.setState({ failed: false });

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return this.props.fallback ? this.props.fallback(this.retry) : <ScreenError onRetry={this.retry} />;
  }
}

// A sheet loaded on demand (the photo sheet is its own chunk) can fail to load: the network dropped, or the page is an old
// copy that points at files a newer build replaced. The failure stays here: the sheet closes, the shopper is told once, and
// the rest of the app keeps running (a bare failure would reach the app-wide error screen).
import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  readonly failed: boolean;
}

export class SheetBoundary extends Component<{ readonly onFail: () => void; readonly children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    this.props.onFail();
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Last line of defence around the app shell.
 *
 * Stored state is untrusted (it can be stale, hand-edited or truncated), so a
 * render-time throw should surface a recoverable screen rather than a blank
 * page. "Clear local data" resets every Vault key and reloads.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Vault crashed while rendering", error, info.componentStack);
  }

  private handleReset = (): void => {
    try {
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith("vault:")) window.localStorage.removeItem(key);
      }
    } catch {
      // Storage unavailable — reloading is still worth a try.
    }
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="grid min-h-screen place-items-center bg-surface px-5">
        <div className="w-full max-w-md rounded-xl border border-line bg-raised p-6">
          <h1 className="text-lg font-semibold tracking-[-0.01em] text-ink">Vault hit an error</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            The console stopped rendering. This is usually caused by shipment or ledger data saved
            by an older version of the app.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg border border-line bg-sunken p-3 font-mono text-xs text-ink-muted">
            {error.message}
          </pre>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="h-9 rounded-lg bg-brand px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand-hover"
            >
              Clear local data and reload
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-9 rounded-lg border border-line-strong px-4 text-sm font-medium text-ink transition-colors hover:bg-sunken"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}

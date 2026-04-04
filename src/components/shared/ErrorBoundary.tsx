import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          className="flex flex-col items-center justify-center h-full p-4 gap-2"
          style={{ color: "var(--color-red)" }}
        >
          <p className="text-sm font-medium">Something went wrong</p>
          <p
            className="text-xs font-mono max-w-md text-center"
            style={{ color: "var(--color-overlay-1)" }}
          >
            {this.state.error?.message}
          </p>
          <button
            className="mt-2 px-3 py-1 rounded text-xs"
            style={{
              backgroundColor: "var(--color-surface-0)",
              color: "var(--color-text)",
            }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  message?: string;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error) {
    // In a real product, ship this to an error reporter.
    // eslint-disable-next-line no-console
    console.error("UI crashed:", error);
  }

  reset = () => this.setState({ hasError: false, message: undefined });

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="grid min-h-dvh place-items-center px-6">
            <div className="max-w-md space-y-4 text-center">
              <h2 className="text-2xl font-bold text-ink-primary">Something went off-script</h2>
              <p className="text-sm text-ink-secondary">
                {this.state.message || "An unexpected error occurred."}
              </p>
              <button
                type="button"
                onClick={this.reset}
                className="rounded-full border border-accent-violet/50 bg-brand-gradient-soft px-5 py-2 text-sm font-medium text-ink-primary hover:bg-brand-gradient-soft/80"
              >
                Try again
              </button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

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
          <div className="min-h-dvh grid place-items-center px-6">
            <div className="max-w-md text-center space-y-4">
              <h2 className="font-display text-2xl text-cream-50">Something went off-script</h2>
              <p className="text-sm text-cream-100/60">
                {this.state.message || "An unexpected error occurred."}
              </p>
              <button
                type="button"
                onClick={this.reset}
                className="px-4 py-2 rounded-lg bg-signal-500/20 border border-signal-500/50 text-signal-400 text-sm hover:bg-signal-500/30"
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

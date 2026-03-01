"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[MISSI] Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen bg-white flex items-center justify-center">
          <div className="text-center max-w-md px-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-2xl font-black text-white mx-auto mb-5 shadow-lg">
              M
            </div>
            <h2 className="text-xl font-semibold text-zinc-800 mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-zinc-500 mb-6 leading-relaxed">
              MISSI encountered an unexpected error. This doesn&apos;t affect
              your conversation history — it&apos;s saved locally.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-xl hover:bg-zinc-800 transition-colors shadow-sm"
            >
              Reload MISSI
            </button>
            {this.state.error && (
              <details className="mt-4 text-left">
                <summary className="text-xs text-zinc-400 cursor-pointer hover:text-zinc-600">
                  Technical details
                </summary>
                <pre className="mt-2 text-[10px] text-zinc-400 bg-zinc-50 rounded-lg p-3 overflow-x-auto border border-zinc-200">
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

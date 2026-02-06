'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    // Log error to console for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Capture data diagnostics if available
    if (typeof window !== 'undefined') {
      const issues = (window as unknown as Record<string, unknown>).__dataIssues;
      if (Array.isArray(issues) && issues.length > 0) {
        console.error('[ErrorBoundary] Data issues found by sanitizer:', issues);
      }
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <div className="bg-[rgba(20,20,35,0.95)] border border-red-500/30 rounded-2xl p-8 max-w-lg w-full text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <AlertTriangle size={32} className="text-red-400" />
            </div>

            <h2 className="text-xl font-bold text-slate-100 font-mono mb-2">
              Нещо се обърка
            </h2>

            <p className="text-slate-400 font-mono text-sm mb-6">
              Възникна неочаквана грешка. Опитай да презаредиш или се върни към началото.
            </p>

            {this.state.error && (
              <details className="mb-6 text-left" open>
                <summary className="text-xs text-slate-500 font-mono cursor-pointer hover:text-slate-400">
                  Технически детайли
                </summary>
                <pre className="mt-2 p-3 bg-slate-800/50 rounded-lg text-xs text-red-300 font-mono overflow-auto max-h-48 whitespace-pre-wrap">
                  {String(this.state.error.message || '')}
                </pre>
                {this.state.errorInfo?.componentStack && (
                  <pre className="mt-1 p-3 bg-slate-800/50 rounded-lg text-xs text-slate-400 font-mono overflow-auto max-h-32 whitespace-pre-wrap">
                    {String(this.state.errorInfo.componentStack)}
                  </pre>
                )}
              </details>
            )}

            {/* Show data corruption diagnostics if available */}
            {typeof window !== 'undefined' && Array.isArray((window as unknown as Record<string, unknown>).__dataIssues) && ((window as unknown as Record<string, unknown>).__dataIssues as string[]).length > 0 && (
              <details className="mb-6 text-left" open>
                <summary className="text-xs text-yellow-500 font-mono cursor-pointer hover:text-yellow-400">
                  Открити проблеми с данните ({((window as unknown as Record<string, unknown>).__dataIssues as string[]).length})
                </summary>
                <pre className="mt-2 p-3 bg-yellow-900/20 border border-yellow-700/30 rounded-lg text-xs text-yellow-300 font-mono overflow-auto max-h-48 whitespace-pre-wrap">
                  {((window as unknown as Record<string, unknown>).__dataIssues as string[]).join('\n')}
                </pre>
              </details>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors font-mono text-sm"
              >
                <RefreshCw size={16} />
                Опитай отново
              </button>
              <button
                onClick={this.handleGoHome}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-mono text-sm"
              >
                <Home size={16} />
                Начало
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

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
  retryCount: number;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // For error #310 (objects as children), auto-retry once after a brief delay
    // This gives the sanitizer a chance to fix data on the next render cycle
    if (error.message?.includes('310') && this.state.retryCount < 2) {
      console.warn('[ErrorBoundary] Auto-retrying after error #310 (attempt', this.state.retryCount + 1, ')');
      setTimeout(() => {
        this.setState(prev => ({
          hasError: false,
          error: null,
          errorInfo: null,
          retryCount: prev.retryCount + 1,
        }));
      }, 500);
    }

    // Log data diagnostics
    if (typeof window !== 'undefined') {
      const issues = (window as unknown as Record<string, unknown>).__dataIssues;
      if (Array.isArray(issues) && issues.length > 0) {
        console.error('[ErrorBoundary] Data issues found by sanitizer:', issues);
      }
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null, retryCount: 0 });
  };

  handleFullReload = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const dataIssues = typeof window !== 'undefined'
        ? (window as unknown as Record<string, unknown>).__dataIssues as string[] | undefined
        : undefined;

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
              Възникна неочаквана грешка. Материалите ти са запазени - презареди страницата.
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

            {Array.isArray(dataIssues) && dataIssues.length > 0 && (
              <details className="mb-6 text-left" open>
                <summary className="text-xs text-yellow-500 font-mono cursor-pointer hover:text-yellow-400">
                  Открити проблеми с данните ({dataIssues.length})
                </summary>
                <pre className="mt-2 p-3 bg-yellow-900/20 border border-yellow-700/30 rounded-lg text-xs text-yellow-300 font-mono overflow-auto max-h-48 whitespace-pre-wrap">
                  {dataIssues.join('\n')}
                </pre>
              </details>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleFullReload}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-mono text-sm"
              >
                <RefreshCw size={16} />
                Презареди
              </button>
              <button
                onClick={this.handleRetry}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors font-mono text-sm"
              >
                Опитай отново
              </button>
              <button
                onClick={this.handleGoHome}
                className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors font-mono text-sm"
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

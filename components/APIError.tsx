'use client';

import { AlertCircle, RefreshCw, Settings, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface APIErrorProps {
  error: string;
  onRetry?: () => void;
  showApiKeyLink?: boolean;
}

export default function APIError({ error, onRetry, showApiKeyLink = true }: APIErrorProps) {
  // Detect specific error types
  const isApiKeyError = error.includes('API') && (error.includes('key') || error.includes('ключ'));
  const isRateLimitError = error.includes('rate') || error.includes('limit') || error.includes('429');
  const isNetworkError = error.includes('network') || error.includes('мрежа') || error.includes('Failed to fetch');
  const isServerError = error.includes('500') || error.includes('server') || error.includes('сървър');

  const getErrorInfo = () => {
    if (isApiKeyError) {
      return {
        title: 'Проблем с API ключ',
        message: 'Провери дали API ключът е валиден и има достатъчно кредит.',
        icon: <Settings size={20} className="text-amber-400" />,
        color: 'amber'
      };
    }
    if (isRateLimitError) {
      return {
        title: 'Твърде много заявки',
        message: 'Достигнат е лимитът за заявки. Изчакай малко и опитай отново.',
        icon: <AlertCircle size={20} className="text-orange-400" />,
        color: 'orange'
      };
    }
    if (isNetworkError) {
      return {
        title: 'Проблем с мрежата',
        message: 'Провери интернет връзката си и опитай отново.',
        icon: <AlertCircle size={20} className="text-blue-400" />,
        color: 'blue'
      };
    }
    if (isServerError) {
      return {
        title: 'Сървърна грешка',
        message: 'Проблем със сървъра. Опитай отново след малко.',
        icon: <AlertCircle size={20} className="text-red-400" />,
        color: 'red'
      };
    }
    return {
      title: 'Грешка',
      message: error || 'Възникна неочаквана грешка.',
      icon: <AlertCircle size={20} className="text-red-400" />,
      color: 'red'
    };
  };

  const info = getErrorInfo();

  return (
    <div className={`p-4 rounded-lg border bg-${info.color}-500/10 border-${info.color}-500/30`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5">{info.icon}</div>
        <div className="flex-1">
          <h3 className={`text-sm font-semibold font-mono text-${info.color}-300`}>
            {info.title}
          </h3>
          <p className="text-xs text-slate-400 font-mono mt-1">
            {info.message}
          </p>

          <div className="flex flex-wrap gap-2 mt-3">
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-colors font-mono text-xs"
              >
                <RefreshCw size={14} />
                Опитай отново
              </button>
            )}

            {isApiKeyError && showApiKeyLink && (
              <Link
                href="/settings"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 rounded-lg transition-colors font-mono text-xs"
              >
                <Settings size={14} />
                Настройки
              </Link>
            )}

            {isApiKeyError && (
              <a
                href="https://console.anthropic.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors font-mono text-xs"
              >
                <ExternalLink size={14} />
                Anthropic Console
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

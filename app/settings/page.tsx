'use client';

import { useState, useEffect } from 'react';
import { Settings, Key, Save, Eye, EyeOff, CheckCircle, AlertCircle, Cpu, Sparkles } from 'lucide-react';

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('claude-api-key');
    if (stored) {
      setApiKey(stored);
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem('claude-api-key', apiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTest = async () => {
    if (!apiKey) return;

    setTesting(true);
    setTestResult(null);

    try {
      const response = await fetch('/api/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey })
      });

      if (response.ok) {
        setTestResult('success');
        handleSave();
      } else {
        setTestResult('error');
      }
    } catch {
      setTestResult('error');
    }

    setTesting(false);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100 font-mono flex items-center gap-3">
          <Settings className="text-slate-400" />
          Настройки
        </h1>
        <p className="text-sm text-slate-500 font-mono mt-1">
          Конфигурирай API ключове и предпочитания
        </p>
      </div>

      {/* API Key Section */}
      <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-100 font-mono flex items-center gap-2 mb-4">
            <Key size={20} className="text-purple-400" />
            Claude API Key
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2 font-mono">
                API ключ от Anthropic
              </label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-api03-..."
                  className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 font-mono text-sm pr-12"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300"
                >
                  {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2 font-mono">
                Вземи ключ от{' '}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:underline"
                >
                  console.anthropic.com
                </a>
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={!apiKey}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-mono text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saved ? <CheckCircle size={16} /> : <Save size={16} />}
                {saved ? 'Запазено!' : 'Запази'}
              </button>
              <button
                onClick={handleTest}
                disabled={!apiKey || testing}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors font-mono text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {testing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Тестване...
                  </>
                ) : (
                  'Тествай'
                )}
              </button>
            </div>

            {testResult && (
              <div className={`flex items-center gap-2 p-3 rounded-lg ${
                testResult === 'success'
                  ? 'bg-green-900/20 border border-green-800/30'
                  : 'bg-red-900/20 border border-red-800/30'
              }`}>
                {testResult === 'success' ? (
                  <>
                    <CheckCircle size={18} className="text-green-400" />
                    <span className="text-sm text-green-300 font-mono">API ключът работи!</span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={18} className="text-red-400" />
                    <span className="text-sm text-red-300 font-mono">Невалиден API ключ</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Model Info */}
        <div className="border-t border-slate-700 pt-6">
          <h3 className="text-sm font-semibold text-slate-400 font-mono uppercase mb-4">
            AI Модели
          </h3>

          <div className="grid gap-3">
            <div className="flex items-start gap-3 p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <Cpu size={20} className="text-cyan-400 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-slate-200 font-mono">Claude Haiku</h4>
                <p className="text-xs text-slate-500 font-mono mt-1">
                  Бърз и евтин. Използва се за: OCR, извличане на теми от документи, прости задачи.
                </p>
                <p className="text-xs text-cyan-400 font-mono mt-1">~$0.25 / 1M tokens</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <Sparkles size={20} className="text-purple-400 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-slate-200 font-mono">Claude Opus</h4>
                <p className="text-xs text-slate-500 font-mono mt-1">
                  Най-мощен. Използва се за: AI Quiz, анализ на знания, персонализирани съвети.
                </p>
                <p className="text-xs text-purple-400 font-mono mt-1">~$15 / 1M tokens</p>
              </div>
            </div>
          </div>
        </div>

        {/* Storage Info */}
        <div className="border-t border-slate-700 pt-6">
          <h3 className="text-sm font-semibold text-slate-400 font-mono uppercase mb-2">
            Съхранение
          </h3>
          <p className="text-xs text-slate-500 font-mono">
            API ключът се пази локално в браузъра и се изпраща директно до Anthropic.
            Данните се синхронизират с Vercel Redis.
          </p>
        </div>
      </div>
    </div>
  );
}

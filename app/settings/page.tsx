'use client';

import { useState, useEffect } from 'react';
import { Settings, Key, Save, Eye, EyeOff, CheckCircle, AlertCircle, Cpu, Sparkles, DollarSign, AlertTriangle } from 'lucide-react';
import { useApp } from '@/lib/context';

export default function SettingsPage() {
  const { data, updateUsageBudget } = useApp();
  const { usageData } = data;

  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [budget, setBudget] = useState(usageData.monthlyBudget);

  useEffect(() => {
    const stored = localStorage.getItem('claude-api-key');
    if (stored) {
      setApiKey(stored);
    }
  }, []);

  useEffect(() => {
    setBudget(usageData.monthlyBudget);
  }, [usageData.monthlyBudget]);

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

  const handleBudgetSave = () => {
    updateUsageBudget(budget);
  };

  const isOverBudget = usageData.monthlyCost >= usageData.monthlyBudget;
  const budgetPercentage = Math.min((usageData.monthlyCost / usageData.monthlyBudget) * 100, 100);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-100 font-mono flex items-center gap-3">
          <Settings className="text-slate-400" />
          Настройки
        </h1>
        <p className="text-sm text-slate-500 font-mono mt-1">
          API ключове, бюджет и статистика
        </p>
      </div>

      {/* Budget Alert */}
      {isOverBudget && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle size={24} className="text-red-400 shrink-0" />
          <div>
            <h3 className="text-red-400 font-semibold font-mono">Надвишен бюджет!</h3>
            <p className="text-sm text-red-300/80 font-mono">
              Месечните разходи (${usageData.monthlyCost.toFixed(4)}) надвишават бюджета (${usageData.monthlyBudget.toFixed(2)})
            </p>
          </div>
        </div>
      )}

      {/* Usage Statistics */}
      <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-slate-100 font-mono flex items-center gap-2 mb-4">
          <DollarSign size={20} className="text-green-400" />
          Разходи за API
        </h2>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-slate-800/50 rounded-lg p-4">
            <p className="text-xs text-slate-500 font-mono mb-1">Този месец</p>
            <p className={`text-2xl font-bold font-mono ${isOverBudget ? 'text-red-400' : 'text-green-400'}`}>
              ${usageData.monthlyCost.toFixed(4)}
            </p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4">
            <p className="text-xs text-slate-500 font-mono mb-1">API извиквания днес</p>
            <p className="text-2xl font-bold font-mono text-blue-400">
              {usageData.dailyCalls}
            </p>
          </div>
        </div>

        {/* Budget Progress */}
        <div className="mb-4">
          <div className="flex justify-between text-sm font-mono mb-2">
            <span className="text-slate-400">Бюджет</span>
            <span className={isOverBudget ? 'text-red-400' : 'text-slate-400'}>
              ${usageData.monthlyCost.toFixed(4)} / ${usageData.monthlyBudget.toFixed(2)}
            </span>
          </div>
          <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                budgetPercentage >= 100 ? 'bg-red-500' :
                budgetPercentage >= 80 ? 'bg-amber-500' :
                'bg-green-500'
              }`}
              style={{ width: `${budgetPercentage}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 font-mono mt-1">
            {budgetPercentage >= 100 ? 'Бюджетът е изчерпан!' :
             budgetPercentage >= 80 ? `${(100 - budgetPercentage).toFixed(0)}% оставащ бюджет` :
             `${budgetPercentage.toFixed(0)}% използван`}
          </p>
        </div>

        {/* Budget Setting */}
        <div className="border-t border-slate-700 pt-4">
          <label className="block text-sm text-slate-400 mb-2 font-mono">
            Месечен бюджет лимит ($)
          </label>
          <div className="flex gap-3">
            <input
              type="number"
              value={budget}
              onChange={(e) => setBudget(parseFloat(e.target.value) || 0)}
              min={0}
              step={0.5}
              className="flex-1 px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono"
            />
            <button
              onClick={handleBudgetSave}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-mono text-sm"
            >
              Запази
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2 font-mono">
            Ще получиш предупреждение когато достигнеш този лимит
          </p>
        </div>
      </div>

      {/* API Key Section */}
      <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-6">
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
      <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-6">
        <h3 className="text-sm font-semibold text-slate-400 font-mono uppercase mb-4">
          AI Модели
        </h3>

        <div className="grid gap-3">
          <div className="flex items-start gap-3 p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
            <Cpu size={20} className="text-cyan-400 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-slate-200 font-mono">Claude Haiku</h4>
              <p className="text-xs text-slate-500 font-mono mt-1">
                Бърз и евтин. Използва се за: OCR, извличане на теми от документи.
              </p>
              <p className="text-xs text-cyan-400 font-mono mt-1">~$0.25 / 1M input, $1.25 / 1M output</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
            <Sparkles size={20} className="text-purple-400 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-slate-200 font-mono">Claude Sonnet</h4>
              <p className="text-xs text-slate-500 font-mono mt-1">
                Балансиран. Използва се за: AI Quiz, генериране на въпроси.
              </p>
              <p className="text-xs text-purple-400 font-mono mt-1">~$3 / 1M input, $15 / 1M output</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-500 font-mono mt-4">
          API ключът се пази локално. Данните се синхронизират с Vercel Redis.
        </p>
      </div>
    </div>
  );
}

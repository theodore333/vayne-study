'use client';

import { useState, useEffect, useRef } from 'react';
import { Settings, Key, Save, Eye, EyeOff, CheckCircle, AlertCircle, Cpu, Sparkles, DollarSign, AlertTriangle, Upload, FileSpreadsheet, X, RefreshCw, Layers, Palmtree, Brain, GraduationCap, Plus } from 'lucide-react';
import { useApp } from '@/lib/context';
import { TopicStatus, MedicalStage } from '@/lib/types';
import { MEDICAL_SPECIALTIES } from '@/lib/constants';
import { checkAnkiConnect, getCollectionStats, CollectionStats, getDeckNames, getSelectedDecks, saveSelectedDecks } from '@/lib/anki';
import { fetchWithTimeout } from '@/lib/fetch-utils';

interface ImportResult {
  matched: number;
  notFound: string[];
  updated: { name: string; oldStatus: string; newStatus: string }[];
}

export default function SettingsPage() {
  const { data, updateUsageBudget, setTopicStatus, updateStudyGoals, updateCareerProfile } = useApp();
  const { usageData, studyGoals } = data;
  const activeSubjects = data.subjects.filter(s => !s.archived && !s.deletedAt);

  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [budget, setBudget] = useState(usageData.monthlyBudget);

  // Notion import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [csvPreview, setCsvPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [columnMapping, setColumnMapping] = useState<{ name: string; status: string }>({ name: '', status: '' });
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');

  // Anki state
  const [ankiConnected, setAnkiConnected] = useState<boolean | null>(null);
  const [ankiChecking, setAnkiChecking] = useState(false);
  const [ankiStats, setAnkiStats] = useState<CollectionStats | null>(null);
  const [ankiDecks, setAnkiDecks] = useState<string[]>([]);
  const [selectedAnkiDecks, setSelectedAnkiDecks] = useState<string[]>([]);

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
      const response = await fetchWithTimeout('/api/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
        timeout: 15000 // 15s for API key test
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

  // Parse CSV file
  const parseCSV = (text: string): { headers: string[]; rows: string[][] } => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    // Parse CSV with proper quote handling
    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseLine(lines[0]);
    const rows = lines.slice(1).map(parseLine);
    return { headers, rows };
  };

  // Map Notion status to app status
  const mapNotionStatus = (notionStatus: string): TopicStatus | null => {
    const normalized = notionStatus.toLowerCase().trim();

    // Gray mappings
    if (normalized.includes('не съм почнал') ||
        normalized.includes('червен') ||
        normalized === 'red' ||
        normalized === 'not started') {
      return 'gray';
    }

    // Orange mappings
    if (normalized.includes('оранжев') ||
        normalized === 'orange' ||
        normalized.includes('в прогрес') ||
        normalized.includes('in progress')) {
      return 'orange';
    }

    // Yellow mappings
    if (normalized.includes('жълт') ||
        normalized === 'yellow' ||
        normalized.includes('почти')) {
      return 'yellow';
    }

    // Green mappings
    if (normalized.includes('зелен') ||
        normalized === 'green' ||
        normalized.includes('готов') ||
        normalized.includes('done') ||
        normalized.includes('complete')) {
      return 'green';
    }

    return null;
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseCSV(text);

        if (parsed.headers.length === 0) {
          setImportError('CSV файлът е празен');
          return;
        }

        setCsvPreview(parsed);

        // Try to auto-detect columns
        const nameCol = parsed.headers.find(h =>
          h.toLowerCase().includes('name') ||
          h.toLowerCase().includes('име') ||
          h.toLowerCase().includes('тема') ||
          h.toLowerCase().includes('topic')
        ) || '';

        const statusCol = parsed.headers.find(h =>
          h.toLowerCase().includes('status') ||
          h.toLowerCase().includes('progress') ||
          h.toLowerCase().includes('прогрес') ||
          h.toLowerCase().includes('статус')
        ) || '';

        setColumnMapping({ name: nameCol, status: statusCol });
      } catch {
        setImportError('Грешка при парсване на CSV файла');
      }
    };
    reader.readAsText(file);
  };

  // Execute import
  const handleImport = () => {
    if (!csvPreview || !columnMapping.name || !columnMapping.status) {
      setImportError('Избери колони за име и статус');
      return;
    }

    if (!selectedSubjectId) {
      setImportError('Избери предмет');
      return;
    }

    setImporting(true);
    setImportError(null);

    const nameIndex = csvPreview.headers.indexOf(columnMapping.name);
    const statusIndex = csvPreview.headers.indexOf(columnMapping.status);

    const result: ImportResult = {
      matched: 0,
      notFound: [],
      updated: []
    };

    // Build a map of topics ONLY from the selected subject
    const activeSubjects = data.subjects.filter(s => !s.archived && !s.deletedAt);
    const selectedSubject = data.subjects.find(s => s.id === selectedSubjectId);
    if (!selectedSubject) {
      setImportError('Предметът не е намерен');
      setImporting(false);
      return;
    }

    const topicMap = new Map<string, { subjectId: string; topicId: string; currentStatus: TopicStatus }>();
    for (const topic of selectedSubject.topics) {
      const normalizedName = topic.name.toLowerCase().trim();
      topicMap.set(normalizedName, {
        subjectId: selectedSubject.id,
        topicId: topic.id,
        currentStatus: topic.status
      });
    }

    // Process each row
    for (const row of csvPreview.rows) {
      const topicName = row[nameIndex]?.trim();
      const notionStatus = row[statusIndex]?.trim();

      if (!topicName || !notionStatus) continue;

      const normalizedName = topicName.toLowerCase().trim();
      const topicInfo = topicMap.get(normalizedName);

      if (!topicInfo) {
        result.notFound.push(topicName);
        continue;
      }

      const newStatus = mapNotionStatus(notionStatus);
      if (!newStatus) continue;

      result.matched++;

      if (topicInfo.currentStatus !== newStatus) {
        setTopicStatus(topicInfo.subjectId, topicInfo.topicId, newStatus);
        result.updated.push({
          name: topicName,
          oldStatus: topicInfo.currentStatus,
          newStatus
        });
      }
    }

    setImportResult(result);
    setImporting(false);
    setCsvPreview(null);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const cancelImport = () => {
    setCsvPreview(null);
    setColumnMapping({ name: '', status: '' });
    setSelectedSubjectId('');
    setImportError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Anki connection check
  const checkAnki = async () => {
    setAnkiChecking(true);
    try {
      const connected = await checkAnkiConnect();
      setAnkiConnected(connected);

      if (connected) {
        // Get all deck names
        const decks = await getDeckNames();
        // Filter only top-level decks (not subdecks)
        const topLevelDecks = decks.filter(d => !d.includes('::'));
        setAnkiDecks(topLevelDecks);

        // Load saved selection
        const saved = getSelectedDecks();
        const validSaved = saved.filter(d => topLevelDecks.includes(d));
        setSelectedAnkiDecks(validSaved.length > 0 ? validSaved : topLevelDecks);

        // Get stats for selected decks
        const decksToUse = validSaved.length > 0 ? validSaved : topLevelDecks;
        const stats = await getCollectionStats(decksToUse);
        setAnkiStats(stats);
        localStorage.setItem('anki-enabled', 'true');
      } else {
        setAnkiStats(null);
        setAnkiDecks([]);
        localStorage.removeItem('anki-enabled');
      }
    } catch {
      setAnkiConnected(false);
      setAnkiStats(null);
      setAnkiDecks([]);
      localStorage.removeItem('anki-enabled');
    }
    setAnkiChecking(false);
  };

  // Toggle deck selection
  const toggleDeck = async (deck: string) => {
    const newSelection = selectedAnkiDecks.includes(deck)
      ? selectedAnkiDecks.filter(d => d !== deck)
      : [...selectedAnkiDecks, deck];

    // Don't allow empty selection
    if (newSelection.length === 0) return;

    setSelectedAnkiDecks(newSelection);
    saveSelectedDecks(newSelection);

    // Refresh stats with new selection
    const stats = await getCollectionStats(newSelection);
    setAnkiStats(stats);
  };

  // Check Anki on mount if previously enabled
  useEffect(() => {
    const ankiEnabled = localStorage.getItem('anki-enabled');
    if (ankiEnabled === 'true') {
      checkAnki();
    }
  }, []);

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

      {/* Vacation Mode */}
      <div className={`bg-[rgba(20,20,35,0.8)] border rounded-xl p-6 ${
        studyGoals.vacationMode ? 'border-cyan-500/50 bg-cyan-900/10' : 'border-[#1e293b]'
      }`}>
        <h2 className="text-lg font-semibold text-slate-100 font-mono flex items-center gap-2 mb-4">
          <Palmtree size={20} className="text-cyan-400" />
          Vacation Mode
          {studyGoals.vacationMode && (
            <span className="ml-2 px-2 py-0.5 text-xs bg-cyan-500/20 text-cyan-400 rounded font-mono">
              АКТИВЕН
            </span>
          )}
        </h2>

        <p className="text-sm text-slate-400 font-mono mb-4">
          Между семестри или ваканция? Включи vacation mode за намален workload.
        </p>

        <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg mb-4">
          <div>
            <p className="text-slate-200 font-mono">Vacation Mode</p>
            <p className="text-xs text-slate-500 font-mono mt-1">
              {studyGoals.vacationMode
                ? `Workload намален до ${Math.round(studyGoals.vacationMultiplier * 100)}%`
                : 'Нормален учебен режим'
              }
            </p>
          </div>
          <button
            onClick={() => updateStudyGoals({ vacationMode: !studyGoals.vacationMode })}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              studyGoals.vacationMode ? 'bg-cyan-600' : 'bg-slate-600'
            }`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              studyGoals.vacationMode ? 'translate-x-6' : 'translate-x-0'
            }`} />
          </button>
        </div>

        {studyGoals.vacationMode && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2 font-mono">
                Интензивност ({Math.round(studyGoals.vacationMultiplier * 100)}% от нормалното)
              </label>
              <input
                type="range"
                min={20}
                max={80}
                step={10}
                value={studyGoals.vacationMultiplier * 100}
                onChange={(e) => updateStudyGoals({ vacationMultiplier: (parseInt(e.target.value, 10) || 50) / 100 })}
                className="w-full h-2 bg-slate-700 rounded-lg cursor-pointer accent-cyan-500"
              />
              <div className="flex justify-between text-xs text-slate-500 font-mono mt-1">
                <span>20% (лека)</span>
                <span>50%</span>
                <span>80% (интензивна)</span>
              </div>
            </div>

            <div className="p-3 bg-cyan-900/20 border border-cyan-800/30 rounded-lg">
              <p className="text-xs text-cyan-300 font-mono">
                Vacation mode: {Math.round((studyGoals.dailyMinutes * studyGoals.vacationMultiplier) / 60)}ч дневно вместо {Math.round(studyGoals.dailyMinutes / 60)}ч,
                по-дълги decay интервали, фокус върху нов материал.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* FSRS Spaced Repetition Settings */}
      <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-slate-100 font-mono flex items-center gap-2 mb-4">
          <Brain size={20} className="text-purple-400" />
          FSRS Spaced Repetition
        </h2>

        <p className="text-sm text-slate-400 font-mono mb-4">
          Настройки за алгоритъма за оптимално преговаряне. По-висока retention = повече reviews.
        </p>

        {/* Enable/Disable FSRS */}
        <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg mb-4">
          <div>
            <p className="text-slate-200 font-mono">FSRS алгоритъм</p>
            <p className="text-xs text-slate-500 font-mono mt-1">
              {studyGoals.fsrsEnabled !== false
                ? 'Активен - оптимални интервали за преговор'
                : 'Изключен - ползва се legacy decay система'
              }
            </p>
          </div>
          <button
            onClick={() => updateStudyGoals({ fsrsEnabled: studyGoals.fsrsEnabled === false })}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              studyGoals.fsrsEnabled !== false ? 'bg-purple-600' : 'bg-slate-600'
            }`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              studyGoals.fsrsEnabled !== false ? 'translate-x-6' : 'translate-x-0'
            }`} />
          </button>
        </div>

        {studyGoals.fsrsEnabled !== false && (
          <div className="space-y-4">
            {/* Target Retention */}
            <div>
              <label className="block text-sm text-slate-400 mb-2 font-mono">
                Target Retention ({Math.round((studyGoals.fsrsTargetRetention ?? 0.85) * 100)}%)
              </label>
              <input
                type="range"
                min={70}
                max={95}
                step={5}
                value={(studyGoals.fsrsTargetRetention ?? 0.85) * 100}
                onChange={(e) => updateStudyGoals({ fsrsTargetRetention: parseInt(e.target.value, 10) / 100 })}
                className="w-full h-2 bg-slate-700 rounded-lg cursor-pointer accent-purple-500"
              />
              <div className="flex justify-between text-xs text-slate-500 font-mono mt-1">
                <span>70% (малко reviews)</span>
                <span>85%</span>
                <span>95% (много reviews)</span>
              </div>
            </div>

            {/* Max Reviews Per Day */}
            <div>
              <label className="block text-sm text-slate-400 mb-2 font-mono">
                Max reviews на ден ({studyGoals.fsrsMaxReviewsPerDay ?? 8})
              </label>
              <input
                type="range"
                min={3}
                max={20}
                step={1}
                value={studyGoals.fsrsMaxReviewsPerDay ?? 8}
                onChange={(e) => updateStudyGoals({ fsrsMaxReviewsPerDay: parseInt(e.target.value, 10) })}
                className="w-full h-2 bg-slate-700 rounded-lg cursor-pointer accent-purple-500"
              />
              <div className="flex justify-between text-xs text-slate-500 font-mono mt-1">
                <span>3 (минимум)</span>
                <span>8</span>
                <span>20 (интензивно)</span>
              </div>
            </div>

            {/* Max Interval */}
            <div>
              <label className="block text-sm text-slate-400 mb-2 font-mono">
                Max интервал ({studyGoals.fsrsMaxInterval ?? 180} дни)
              </label>
              <input
                type="range"
                min={30}
                max={365}
                step={30}
                value={studyGoals.fsrsMaxInterval ?? 180}
                onChange={(e) => updateStudyGoals({ fsrsMaxInterval: parseInt(e.target.value, 10) })}
                className="w-full h-2 bg-slate-700 rounded-lg cursor-pointer accent-purple-500"
              />
              <div className="flex justify-between text-xs text-slate-500 font-mono mt-1">
                <span>30д (агресивно)</span>
                <span>180д</span>
                <span>365д (relaxed)</span>
              </div>
            </div>

            <div className="p-3 bg-purple-900/20 border border-purple-800/30 rounded-lg">
              <p className="text-xs text-purple-300 font-mono">
                При {Math.round((studyGoals.fsrsTargetRetention ?? 0.85) * 100)}% retention:
                темите се преговарят когато вероятността да ги помниш падне до {Math.round((studyGoals.fsrsTargetRetention ?? 0.85) * 100)}%.
                Max {studyGoals.fsrsMaxReviewsPerDay ?? 8} теми на ден предпазва от review hell.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Career Profile */}
      <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-slate-100 font-mono flex items-center gap-2 mb-4">
          <GraduationCap size={20} className="text-emerald-400" />
          Кариерен профил
        </h2>

        <p className="text-sm text-slate-400 font-mono mb-4">
          Информация за твоя образователен етап и кариерни интереси.
        </p>

        <div className="space-y-4">
          {/* Year and Stage */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2 font-mono">Курс</label>
              <select
                value={data.careerProfile?.currentYear || 1}
                onChange={(e) => updateCareerProfile({ currentYear: parseInt(e.target.value, 10) })}
                className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-sm appearance-none cursor-pointer hover:border-slate-600 focus:outline-none focus:border-emerald-500"
              >
                {[1, 2, 3, 4, 5, 6].map(year => (
                  <option key={year} value={year}>{year} курс</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-2 font-mono">Етап</label>
              <select
                value={data.careerProfile?.stage || 'preclinical'}
                onChange={(e) => updateCareerProfile({ stage: e.target.value as MedicalStage })}
                className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-sm appearance-none cursor-pointer hover:border-slate-600 focus:outline-none focus:border-emerald-500"
              >
                <option value="preclinical">Предклиничен (1-3)</option>
                <option value="clinical">Клиничен (4-6)</option>
                <option value="intern">Интерн</option>
                <option value="resident">Специализант</option>
                <option value="other">Друго</option>
              </select>
            </div>
          </div>

          {/* University */}
          <div>
            <label className="block text-sm text-slate-400 mb-2 font-mono">Университет</label>
            <input
              type="text"
              value={data.careerProfile?.university || ''}
              onChange={(e) => updateCareerProfile({ university: e.target.value })}
              placeholder="напр. МУ София"
              className="w-full px-3 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 font-mono text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Interested Specialties */}
          <div>
            <label className="block text-sm text-slate-400 mb-2 font-mono">
              Интересни специалности
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {(data.careerProfile?.interestedSpecialties || []).map(specialty => (
                <span
                  key={specialty}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-600/20 text-emerald-300 rounded text-xs font-mono"
                >
                  {specialty}
                  <button
                    onClick={() => updateCareerProfile({
                      interestedSpecialties: (data.careerProfile?.interestedSpecialties || []).filter(s => s !== specialty)
                    })}
                    className="hover:text-red-400"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value && !(data.careerProfile?.interestedSpecialties || []).includes(e.target.value)) {
                  updateCareerProfile({
                    interestedSpecialties: [...(data.careerProfile?.interestedSpecialties || []), e.target.value]
                  });
                }
              }}
              className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 font-mono text-sm appearance-none cursor-pointer hover:border-slate-600 focus:outline-none focus:border-emerald-500"
            >
              <option value="">+ Добави специалност...</option>
              {MEDICAL_SPECIALTIES.filter(s => !(data.careerProfile?.interestedSpecialties || []).includes(s)).map(specialty => (
                <option key={specialty} value={specialty}>{specialty}</option>
              ))}
            </select>
          </div>

          {/* Short Term Goals */}
          <div>
            <label className="block text-sm text-slate-400 mb-2 font-mono">
              Краткосрочни цели (този семестър)
            </label>
            <div className="space-y-2">
              {(data.careerProfile?.shortTermGoals || []).map((goal, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="flex-1 px-3 py-2 bg-slate-800/50 rounded-lg text-sm text-slate-300 font-mono">
                    {goal}
                  </span>
                  <button
                    onClick={() => updateCareerProfile({
                      shortTermGoals: (data.careerProfile?.shortTermGoals || []).filter((_, i) => i !== index)
                    })}
                    className="p-1.5 text-slate-500 hover:text-red-400"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Добави цел..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                      updateCareerProfile({
                        shortTermGoals: [...(data.careerProfile?.shortTermGoals || []), e.currentTarget.value.trim()]
                      });
                      e.currentTarget.value = '';
                    }
                  }}
                  className="flex-1 px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 font-mono text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Long Term Goals */}
          <div>
            <label className="block text-sm text-slate-400 mb-2 font-mono">
              Дългосрочни цели (кариерни)
            </label>
            <div className="space-y-2">
              {(data.careerProfile?.longTermGoals || []).map((goal, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="flex-1 px-3 py-2 bg-slate-800/50 rounded-lg text-sm text-slate-300 font-mono">
                    {goal}
                  </span>
                  <button
                    onClick={() => updateCareerProfile({
                      longTermGoals: (data.careerProfile?.longTermGoals || []).filter((_, i) => i !== index)
                    })}
                    className="p-1.5 text-slate-500 hover:text-red-400"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Добави цел..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                      updateCareerProfile({
                        longTermGoals: [...(data.careerProfile?.longTermGoals || []), e.currentTarget.value.trim()]
                      });
                      e.currentTarget.value = '';
                    }
                  }}
                  className="flex-1 px-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-100 placeholder:text-slate-500 font-mono text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          <div className="p-3 bg-emerald-900/20 border border-emerald-800/30 rounded-lg">
            <p className="text-xs text-emerald-300 font-mono">
              Тази информация ще се използва от AI Career Coach (идва скоро) за персонализирани съвети.
            </p>
          </div>
        </div>
      </div>

      {/* Notion Import */}
      <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-slate-100 font-mono flex items-center gap-2 mb-4">
          <FileSpreadsheet size={20} className="text-orange-400" />
          Import от Notion
        </h2>

        <p className="text-sm text-slate-400 font-mono mb-4">
          Експортни database от Notion като CSV и импортирай прогреса си.
        </p>

        {/* File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="hidden"
        />

        {!csvPreview ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-4 border-2 border-dashed border-slate-600 hover:border-orange-500/50 rounded-xl transition-colors flex flex-col items-center gap-2 text-slate-400 hover:text-orange-400"
          >
            <Upload size={24} />
            <span className="font-mono text-sm">Избери CSV файл</span>
          </button>
        ) : (
          <div className="space-y-4">
            {/* Preview info */}
            <div className="bg-slate-800/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-300 font-mono">
                  {csvPreview.rows.length} реда намерени
                </span>
                <button
                  onClick={cancelImport}
                  className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Subject selector */}
              <div className="mb-4">
                <label className="block text-xs text-slate-500 font-mono mb-1">
                  Предмет за import
                </label>
                <select
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-100 font-mono text-sm"
                >
                  <option value="">Избери предмет...</option>
                  {activeSubjects.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.topics.length} теми)
                    </option>
                  ))}
                </select>
              </div>

              {/* Column mapping */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-500 font-mono mb-1">
                    Колона за име на тема
                  </label>
                  <select
                    value={columnMapping.name}
                    onChange={(e) => setColumnMapping(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-100 font-mono text-sm"
                  >
                    <option value="">Избери...</option>
                    {csvPreview.headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 font-mono mb-1">
                    Колона за статус/прогрес
                  </label>
                  <select
                    value={columnMapping.status}
                    onChange={(e) => setColumnMapping(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-slate-100 font-mono text-sm"
                  >
                    <option value="">Избери...</option>
                    {csvPreview.headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Sample data */}
              {columnMapping.name && columnMapping.status && (
                <div className="mt-4 border-t border-slate-700 pt-4">
                  <p className="text-xs text-slate-500 font-mono mb-2">Примерни данни:</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {csvPreview.rows.slice(0, 5).map((row, i) => {
                      const nameIdx = csvPreview.headers.indexOf(columnMapping.name);
                      const statusIdx = csvPreview.headers.indexOf(columnMapping.status);
                      const mappedStatus = mapNotionStatus(row[statusIdx] || '');
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs font-mono">
                          <span className="text-slate-300 truncate flex-1">{row[nameIdx]}</span>
                          <span className="text-slate-500">{row[statusIdx]}</span>
                          <span className={`px-1.5 py-0.5 rounded text-xs ${
                            mappedStatus === 'green' ? 'bg-green-500/20 text-green-400' :
                            mappedStatus === 'yellow' ? 'bg-yellow-500/20 text-yellow-400' :
                            mappedStatus === 'orange' ? 'bg-orange-500/20 text-orange-400' :
                            mappedStatus === 'gray' ? 'bg-slate-500/20 text-slate-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {mappedStatus || '?'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Import button */}
            <button
              onClick={handleImport}
              disabled={!columnMapping.name || !columnMapping.status || !selectedSubjectId || importing}
              className="w-full py-3 bg-orange-600 hover:bg-orange-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-mono text-sm transition-colors flex items-center justify-center gap-2"
            >
              {importing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Импортиране...
                </>
              ) : (
                <>
                  <Upload size={16} />
                  Импортирай
                </>
              )}
            </button>
          </div>
        )}

        {/* Import error */}
        {importError && (
          <div className="mt-4 p-3 bg-red-900/20 border border-red-800/30 rounded-lg flex items-center gap-2">
            <AlertCircle size={18} className="text-red-400 shrink-0" />
            <span className="text-sm text-red-300 font-mono">{importError}</span>
          </div>
        )}

        {/* Import result */}
        {importResult && (
          <div className="mt-4 p-4 bg-green-900/20 border border-green-800/30 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={18} className="text-green-400" />
              <span className="text-sm text-green-300 font-mono font-semibold">Import завършен!</span>
            </div>
            <div className="space-y-2 text-sm font-mono">
              <p className="text-slate-300">
                Намерени: <span className="text-green-400">{importResult.matched}</span> теми
              </p>
              <p className="text-slate-300">
                Обновени: <span className="text-cyan-400">{importResult.updated.length}</span> теми
              </p>
              {importResult.notFound.length > 0 && (
                <div>
                  <p className="text-amber-400 mb-1">
                    Не са намерени ({importResult.notFound.length}):
                  </p>
                  <div className="max-h-24 overflow-y-auto text-xs text-slate-500">
                    {importResult.notFound.slice(0, 10).map((name, i) => (
                      <div key={i}>• {name}</div>
                    ))}
                    {importResult.notFound.length > 10 && (
                      <div>... и още {importResult.notFound.length - 10}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Status mapping info */}
        <div className="mt-4 p-3 bg-slate-800/30 rounded-lg">
          <p className="text-xs text-slate-500 font-mono mb-2">Автоматичен mapping на статуси:</p>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-slate-500" />
              <span className="text-slate-400">не съм почнал, червено</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-orange-500" />
              <span className="text-slate-400">оранжево</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-yellow-500" />
              <span className="text-slate-400">жълто</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-slate-400">зелено, готово</span>
            </div>
          </div>
        </div>
      </div>

      {/* AnkiConnect Integration */}
      <div className="bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl p-6">
        <h2 className="text-lg font-semibold text-slate-100 font-mono flex items-center gap-2 mb-4">
          <Layers size={20} className="text-blue-400" />
          Anki Интеграция
        </h2>

        <p className="text-sm text-slate-400 font-mono mb-4">
          Свържи с Anki чрез AnkiConnect за да виждаш due карти в апа.
        </p>

        {/* Connection Status */}
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={checkAnki}
            disabled={ankiChecking}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg font-mono text-sm transition-colors"
          >
            {ankiChecking ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                Проверка...
              </>
            ) : (
              <>
                <RefreshCw size={16} />
                {ankiConnected === null ? 'Свържи с Anki' : 'Провери връзката'}
              </>
            )}
          </button>

          {ankiConnected !== null && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
              ankiConnected
                ? 'bg-green-900/20 border border-green-800/30'
                : 'bg-red-900/20 border border-red-800/30'
            }`}>
              {ankiConnected ? (
                <>
                  <CheckCircle size={16} className="text-green-400" />
                  <span className="text-sm text-green-300 font-mono">Свързан</span>
                </>
              ) : (
                <>
                  <AlertCircle size={16} className="text-red-400" />
                  <span className="text-sm text-red-300 font-mono">Не е свързан</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Anki Stats when connected */}
        {ankiConnected && ankiStats && (
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-slate-800/50 rounded-lg p-4">
              <p className="text-xs text-slate-500 font-mono mb-1">Due карти</p>
              <p className="text-2xl font-bold font-mono text-blue-400">
                {ankiStats.dueToday}
              </p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4">
              <p className="text-xs text-slate-500 font-mono mb-1">Нови карти</p>
              <p className="text-2xl font-bold font-mono text-cyan-400">
                {ankiStats.newToday}
              </p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4">
              <p className="text-xs text-slate-500 font-mono mb-1">Общо карти</p>
              <p className="text-2xl font-bold font-mono text-slate-300">
                {ankiStats.totalCards.toLocaleString()}
              </p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4">
              <p className="text-xs text-slate-500 font-mono mb-1">Избрани тестета</p>
              <p className="text-2xl font-bold font-mono text-slate-300">
                {selectedAnkiDecks.length}/{ankiDecks.length}
              </p>
            </div>
          </div>
        )}

        {/* Deck Selection */}
        {ankiConnected && ankiDecks.length > 0 && (
          <div className="mb-4 p-4 bg-slate-800/30 rounded-lg">
            <p className="text-sm text-slate-300 font-mono mb-3">Избери тестета за проследяване:</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {ankiDecks.map(deck => (
                <label key={deck} className="flex items-center gap-3 cursor-pointer hover:bg-slate-700/30 p-2 rounded-lg transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedAnkiDecks.includes(deck)}
                    onChange={() => toggleDeck(deck)}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                  />
                  <span className="text-sm text-slate-300 font-mono">{deck}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500 font-mono mt-2">
              Само избраните тестета ще се броят в статистиките.
            </p>
          </div>
        )}

        {/* Instructions */}
        <div className="p-3 bg-slate-800/30 rounded-lg">
          <p className="text-xs text-slate-500 font-mono mb-2">Как да свържеш:</p>
          <ol className="text-xs text-slate-400 font-mono space-y-1 list-decimal list-inside">
            <li>Инсталирай AnkiConnect в Anki (Tools → Add-ons → код: <code className="bg-slate-700 px-1 rounded">2055492159</code>)</li>
            <li>Рестартирай Anki</li>
            <li>Дръж Anki отворен на същия компютър</li>
            <li>Натисни &quot;Свържи с Anki&quot;</li>
          </ol>
          <p className="text-xs text-amber-400/80 font-mono mt-2">
            Работи само локално - Anki трябва да е пуснат.
          </p>
        </div>
      </div>

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
              <h4 className="text-sm font-semibold text-slate-200 font-mono">Claude Opus</h4>
              <p className="text-xs text-slate-500 font-mono mt-1">
                Най-мощен. Използва се за: AI Quiz, генериране на въпроси, дълбок анализ.
              </p>
              <p className="text-xs text-purple-400 font-mono mt-1">~$15 / 1M input, $75 / 1M output</p>
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

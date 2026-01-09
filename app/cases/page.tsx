'use client';

import { useState, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Stethoscope, Play, ChevronRight, ArrowLeft, MessageCircle, User,
  Heart, Wind, Brain, Eye, Send, CheckCircle, Pill, ListOrdered,
  TestTube, AlertCircle, Clock, ChevronDown, ChevronUp, GripVertical,
  Plus, Trash2, ArrowRight
} from 'lucide-react';
import Link from 'next/link';
import { useApp } from '@/lib/context';
import { STATUS_CONFIG } from '@/lib/constants';
import {
  CASE_STEPS, CaseStep, CaseDifficulty, CaseMessage, ExamFinding,
  CaseInvestigation, DifferentialDiagnosis, TreatmentPlanItem,
  StepEvaluation, InteractiveClinicalCase, EXAM_SYSTEMS, INVESTIGATION_CATEGORIES
} from '@/lib/types';

// Icons for exam systems
const SYSTEM_ICONS: Record<string, React.ReactNode> = {
  general: <User className="w-5 h-5" />,
  cardiovascular: <Heart className="w-5 h-5" />,
  respiratory: <Wind className="w-5 h-5" />,
  abdominal: <div className="w-5 h-5 rounded-full border-2" />,
  neurological: <Brain className="w-5 h-5" />,
  musculoskeletal: <div className="w-5 h-5">🦴</div>,
  skin: <div className="w-5 h-5">💧</div>,
  lymphatic: <div className="w-5 h-5">🔗</div>,
  head_neck: <Eye className="w-5 h-5" />,
};

function CasesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const subjectId = searchParams.get('subject');
  const topicId = searchParams.get('topic');

  const { data, incrementApiCalls } = useApp();

  // Selection state
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(subjectId);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(topicId);
  const [difficulty, setDifficulty] = useState<CaseDifficulty>('intermediate');

  // Case state
  const [activeCase, setActiveCase] = useState<InteractiveClinicalCase | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // History step state
  const [historyInput, setHistoryInput] = useState('');
  const [isPatientResponding, setIsPatientResponding] = useState(false);

  // Physical exam state
  const [selectedExamSystems, setSelectedExamSystems] = useState<Set<string>>(new Set());
  const [examRevealed, setExamRevealed] = useState(false);
  const [isRevealingExam, setIsRevealingExam] = useState(false);

  // Investigations state
  const [selectedInvestigation, setSelectedInvestigation] = useState<string | null>(null);
  const [investigationJustification, setInvestigationJustification] = useState('');
  const [isProcessingInvestigation, setIsProcessingInvestigation] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState<string | null>('laboratory');

  // DDx state
  const [ddxItems, setDdxItems] = useState<DifferentialDiagnosis[]>([]);
  const [newDdxInput, setNewDdxInput] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [isEvaluatingDdx, setIsEvaluatingDdx] = useState(false);

  // Final diagnosis state
  const [finalDiagnosisInput, setFinalDiagnosisInput] = useState('');
  const [isEvaluatingDiagnosis, setIsEvaluatingDiagnosis] = useState(false);

  // Treatment state
  const [treatmentItems, setTreatmentItems] = useState<TreatmentPlanItem[]>([]);
  const [isEvaluatingTreatment, setIsEvaluatingTreatment] = useState(false);

  // Results state
  const [showResults, setShowResults] = useState(false);
  const [caseSummary, setCaseSummary] = useState<{
    overallScore: number;
    grade: number;
    summary: string;
    keyLearnings: string[];
    areasForReview: string[];
    encouragement: string;
    nextSteps: string;
  } | null>(null);

  // Timer
  const [caseStartTime, setCaseStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  const subject = data.subjects.find(s => s.id === selectedSubjectId);
  const topic = subject?.topics.find(t => t.id === selectedTopicId);
  const apiKey = typeof window !== 'undefined' ? localStorage.getItem('claude-api-key') : null;

  // Timer effect
  useEffect(() => {
    if (!caseStartTime || showResults) return;
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - caseStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [caseStartTime, showResults]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Generate case
  const handleGenerateCase = async () => {
    if (!topic || !apiKey) return;

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          mode: 'generate_case',
          material: topic.material,
          topicName: topic.name,
          subjectName: subject?.name || '',
          subjectType: subject?.subjectType || 'clinical',
          difficulty
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      incrementApiCalls(result.usage?.cost || 0);

      const newCase: InteractiveClinicalCase = {
        id: Date.now().toString(),
        subjectId: selectedSubjectId!,
        topicId: selectedTopicId!,
        difficulty,
        specialty: result.case.specialty,
        createdAt: new Date().toISOString(),
        completedAt: null,
        presentation: result.case.presentation,
        hiddenData: result.case.hiddenData,
        currentStep: 'presentation',
        historyMessages: [],
        selectedExams: [],
        examFindings: [],
        orderedInvestigations: [],
        studentDdx: [],
        finalDiagnosis: null,
        treatmentPlan: [],
        evaluations: [],
        overallScore: null,
        timeSpentMinutes: 0
      };

      setActiveCase(newCase);
      setCaseStartTime(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка при генериране');
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle patient response in history
  const handleSendQuestion = async () => {
    if (!activeCase || !historyInput.trim() || !apiKey) return;

    const newMessage: CaseMessage = {
      id: Date.now().toString(),
      role: 'student',
      content: historyInput,
      timestamp: new Date().toISOString()
    };

    setActiveCase(prev => prev ? {
      ...prev,
      historyMessages: [...prev.historyMessages, newMessage]
    } : null);
    setHistoryInput('');
    setIsPatientResponding(true);

    try {
      const response = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          mode: 'patient_response',
          caseContext: JSON.stringify(activeCase.hiddenData),
          conversationHistory: [...activeCase.historyMessages, newMessage],
          studentQuestion: historyInput,
          presentation: activeCase.presentation
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      incrementApiCalls(result.usage?.cost || 0);

      const patientMessage: CaseMessage = {
        id: (Date.now() + 1).toString(),
        role: 'patient',
        content: result.response,
        timestamp: new Date().toISOString()
      };

      setActiveCase(prev => prev ? {
        ...prev,
        historyMessages: [...prev.historyMessages, patientMessage]
      } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    } finally {
      setIsPatientResponding(false);
    }
  };

  // Reveal exam findings
  const handleRevealExam = async () => {
    if (!activeCase || selectedExamSystems.size === 0 || !apiKey) return;

    setIsRevealingExam(true);

    try {
      const response = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          mode: 'reveal_exam',
          selectedSystems: Array.from(selectedExamSystems),
          hiddenFindings: activeCase.hiddenData.keyExamFindings,
          presentation: activeCase.presentation
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      incrementApiCalls(result.usage?.cost || 0);

      setActiveCase(prev => prev ? {
        ...prev,
        selectedExams: Array.from(selectedExamSystems),
        examFindings: result.findings
      } : null);
      setExamRevealed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    } finally {
      setIsRevealingExam(false);
    }
  };

  // Process investigation
  const handleOrderInvestigation = async () => {
    if (!activeCase || !selectedInvestigation || !investigationJustification.trim() || !apiKey) return;

    setIsProcessingInvestigation(true);

    try {
      const response = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          mode: 'process_investigation',
          investigation: { name: selectedInvestigation, justification: investigationJustification },
          caseContext: JSON.stringify(activeCase.hiddenData),
          presentation: activeCase.presentation,
          actualDiagnosis: activeCase.hiddenData.actualDiagnosis
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      incrementApiCalls(result.usage?.cost || 0);

      const newInvestigation: CaseInvestigation = {
        id: Date.now().toString(),
        name: selectedInvestigation,
        category: Object.entries(INVESTIGATION_CATEGORIES).find(([, cat]) =>
          (cat.tests as readonly string[]).includes(selectedInvestigation)
        )?.[0] as 'laboratory' | 'imaging' | 'procedure' | 'other' || 'other',
        justification: investigationJustification,
        result: result.result,
        isAppropriate: result.isAppropriate,
        feedback: result.feedback
      };

      setActiveCase(prev => prev ? {
        ...prev,
        orderedInvestigations: [...prev.orderedInvestigations, newInvestigation]
      } : null);
      setSelectedInvestigation(null);
      setInvestigationJustification('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    } finally {
      setIsProcessingInvestigation(false);
    }
  };

  // Add DDx item
  const handleAddDdx = () => {
    if (!newDdxInput.trim()) return;
    const newItem: DifferentialDiagnosis = {
      id: Date.now().toString(),
      diagnosis: newDdxInput.trim(),
      rank: ddxItems.length + 1
    };
    setDdxItems([...ddxItems, newItem]);
    setNewDdxInput('');
  };

  // Remove DDx item
  const handleRemoveDdx = (id: string) => {
    setDdxItems(ddxItems.filter(d => d.id !== id).map((d, i) => ({ ...d, rank: i + 1 })));
  };

  // Drag and drop for DDx
  const handleDragStart = (index: number) => setDraggedIndex(index);
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newItems = [...ddxItems];
    const [removed] = newItems.splice(draggedIndex, 1);
    newItems.splice(index, 0, removed);
    setDdxItems(newItems.map((d, i) => ({ ...d, rank: i + 1 })));
    setDraggedIndex(index);
  };
  const handleDragEnd = () => setDraggedIndex(null);

  // Evaluate DDx
  const handleEvaluateDdx = async () => {
    if (!activeCase || ddxItems.length === 0 || !apiKey) return;

    setIsEvaluatingDdx(true);

    try {
      const response = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          mode: 'evaluate_ddx',
          studentDdx: ddxItems,
          correctDdx: activeCase.hiddenData.differentialDiagnoses,
          actualDiagnosis: activeCase.hiddenData.actualDiagnosis,
          caseContext: JSON.stringify(activeCase.presentation)
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      incrementApiCalls(result.usage?.cost || 0);

      const evaluation: StepEvaluation = {
        step: 'ddx',
        score: result.evaluation.score,
        feedback: result.evaluation.feedback,
        strengths: result.evaluation.strengths || [],
        areasToImprove: result.evaluation.areasToImprove || [],
        missedPoints: result.evaluation.missedDiagnoses || [],
        timestamp: new Date().toISOString()
      };

      setActiveCase(prev => prev ? {
        ...prev,
        studentDdx: ddxItems,
        evaluations: [...prev.evaluations, evaluation]
      } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    } finally {
      setIsEvaluatingDdx(false);
    }
  };

  // Evaluate final diagnosis
  const handleEvaluateDiagnosis = async () => {
    if (!activeCase || !finalDiagnosisInput.trim() || !apiKey) return;

    setIsEvaluatingDiagnosis(true);

    try {
      const response = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          mode: 'evaluate_diagnosis',
          studentDiagnosis: finalDiagnosisInput,
          actualDiagnosis: activeCase.hiddenData.actualDiagnosis,
          studentDdx: activeCase.studentDdx,
          caseContext: JSON.stringify(activeCase.presentation)
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      incrementApiCalls(result.usage?.cost || 0);

      const evaluation: StepEvaluation = {
        step: 'confirmation',
        score: result.evaluation.score,
        feedback: result.evaluation.feedback,
        strengths: result.evaluation.learningPoints || [],
        areasToImprove: [],
        timestamp: new Date().toISOString()
      };

      setActiveCase(prev => prev ? {
        ...prev,
        finalDiagnosis: finalDiagnosisInput,
        evaluations: [...prev.evaluations, evaluation]
      } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    } finally {
      setIsEvaluatingDiagnosis(false);
    }
  };

  // Add treatment item
  const handleAddTreatmentItem = (category: TreatmentPlanItem['category']) => {
    const newItem: TreatmentPlanItem = {
      id: Date.now().toString(),
      category,
      description: '',
      priority: 'short_term'
    };
    setTreatmentItems([...treatmentItems, newItem]);
  };

  // Update treatment item
  const updateTreatmentItem = (id: string, updates: Partial<TreatmentPlanItem>) => {
    setTreatmentItems(treatmentItems.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  // Remove treatment item
  const removeTreatmentItem = (id: string) => {
    setTreatmentItems(treatmentItems.filter(t => t.id !== id));
  };

  // Evaluate treatment
  const handleEvaluateTreatment = async () => {
    if (!activeCase || treatmentItems.length === 0 || !apiKey) return;

    setIsEvaluatingTreatment(true);

    try {
      const response = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          mode: 'evaluate_treatment',
          studentTreatment: treatmentItems,
          expectedTreatment: activeCase.hiddenData.treatmentPlan,
          actualDiagnosis: activeCase.hiddenData.actualDiagnosis,
          caseContext: JSON.stringify(activeCase.presentation)
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      incrementApiCalls(result.usage?.cost || 0);

      const evaluation: StepEvaluation = {
        step: 'treatment',
        score: result.evaluation.score,
        feedback: result.evaluation.feedback,
        strengths: result.evaluation.strengths || [],
        areasToImprove: result.evaluation.areasToImprove || [],
        missedPoints: result.evaluation.missedElements || [],
        timestamp: new Date().toISOString()
      };

      setActiveCase(prev => prev ? {
        ...prev,
        treatmentPlan: treatmentItems,
        evaluations: [...prev.evaluations, evaluation]
      } : null);

      // Get case summary
      const summaryResponse = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          mode: 'get_case_summary',
          caseData: {
            presentation: activeCase.presentation,
            actualDiagnosis: activeCase.hiddenData.actualDiagnosis,
            specialty: activeCase.specialty
          },
          evaluations: [...activeCase.evaluations, evaluation],
          timeSpentMinutes: Math.floor(elapsedTime / 60)
        })
      });

      const summaryResult = await summaryResponse.json();
      if (summaryResponse.ok) {
        incrementApiCalls(summaryResult.usage?.cost || 0);
        setCaseSummary(summaryResult.summary);
      }

      setShowResults(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Грешка');
    } finally {
      setIsEvaluatingTreatment(false);
    }
  };

  // Move to next step
  const handleNextStep = () => {
    if (!activeCase) return;
    const steps: CaseStep[] = ['presentation', 'history', 'physical_exam', 'investigations', 'ddx', 'confirmation', 'treatment'];
    const currentIndex = steps.indexOf(activeCase.currentStep);
    if (currentIndex < steps.length - 1) {
      setActiveCase(prev => prev ? { ...prev, currentStep: steps[currentIndex + 1] } : null);
    }
  };

  // Get current step index
  const getCurrentStepIndex = () => {
    if (!activeCase) return 0;
    const steps: CaseStep[] = ['presentation', 'history', 'physical_exam', 'investigations', 'ddx', 'confirmation', 'treatment'];
    return steps.indexOf(activeCase.currentStep);
  };

  // Render step content
  const renderStepContent = () => {
    if (!activeCase) return null;

    switch (activeCase.currentStep) {
      case 'presentation':
        return (
          <div className="space-y-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-4">
                Представяне на пациента
              </h3>
              <div className="space-y-3 text-gray-700 dark:text-gray-300">
                <p><strong>Възраст:</strong> {activeCase.presentation.age} години</p>
                <p><strong>Пол:</strong> {activeCase.presentation.gender === 'male' ? 'Мъж' : 'Жена'}</p>
                <p><strong>Основно оплакване:</strong> {activeCase.presentation.chiefComplaint}</p>
                <p className="mt-4 text-gray-600 dark:text-gray-400 italic">
                  {activeCase.presentation.briefHistory}
                </p>
              </div>
            </div>
            <button
              onClick={handleNextStep}
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
            >
              Започни анамнеза <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        );

      case 'history':
        return (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 h-96 overflow-y-auto">
              {activeCase.historyMessages.length === 0 && (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                  Задавай въпроси на пациента, за да съберете анамнеза...
                </p>
              )}
              {activeCase.historyMessages.map((msg, i) => (
                <div key={msg.id} className={`mb-3 flex ${msg.role === 'student' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-3 rounded-lg ${
                    msg.role === 'student'
                      ? 'bg-blue-600 text-white'
                      : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 border dark:border-gray-600'
                  }`}>
                    <p className="text-sm font-medium mb-1 opacity-70">
                      {msg.role === 'student' ? 'Вие' : 'Пациент'}
                    </p>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isPatientResponding && (
                <div className="flex justify-start">
                  <div className="bg-white dark:bg-gray-700 p-3 rounded-lg border dark:border-gray-600">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={historyInput}
                onChange={(e) => setHistoryInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isPatientResponding && handleSendQuestion()}
                placeholder="Задайте въпрос на пациента..."
                className="flex-1 px-4 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                disabled={isPatientResponding}
              />
              <button
                onClick={handleSendQuestion}
                disabled={isPatientResponding || !historyInput.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <button
              onClick={handleNextStep}
              className="w-full py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Продължи към физикален преглед →
            </button>
          </div>
        );

      case 'physical_exam':
        return (
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              Изберете кои системи искате да прегледате:
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {EXAM_SYSTEMS.map(system => (
                <button
                  key={system.id}
                  onClick={() => {
                    if (examRevealed) return;
                    const newSet = new Set(selectedExamSystems);
                    if (newSet.has(system.id)) {
                      newSet.delete(system.id);
                    } else {
                      newSet.add(system.id);
                    }
                    setSelectedExamSystems(newSet);
                  }}
                  disabled={examRevealed}
                  className={`p-3 rounded-lg border flex flex-col items-center gap-2 transition-all ${
                    selectedExamSystems.has(system.id)
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  } ${examRevealed ? 'opacity-60' : ''}`}
                >
                  {SYSTEM_ICONS[system.id] || <Stethoscope className="w-5 h-5" />}
                  <span className="text-sm">{system.name}</span>
                </button>
              ))}
            </div>

            {!examRevealed && (
              <button
                onClick={handleRevealExam}
                disabled={selectedExamSystems.size === 0 || isRevealingExam}
                className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isRevealingExam ? 'Преглеждам...' : `Прегледай (${selectedExamSystems.size} системи)`}
              </button>
            )}

            {examRevealed && activeCase.examFindings.length > 0 && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-3">
                <h4 className="font-semibold">Находки от прегледа:</h4>
                {activeCase.examFindings.map((finding, i) => (
                  <div key={i} className={`p-3 rounded-lg ${
                    finding.isNormal
                      ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                      : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                  }`}>
                    <p className="font-medium">{EXAM_SYSTEMS.find(s => s.id === finding.system)?.name}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{finding.finding}</p>
                  </div>
                ))}
              </div>
            )}

            {examRevealed && (
              <button
                onClick={handleNextStep}
                className="w-full py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Продължи към изследвания →
              </button>
            )}
          </div>
        );

      case 'investigations':
        return (
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              Назначете изследвания и обосновете избора си:
            </p>

            {/* Investigation categories */}
            <div className="space-y-2">
              {Object.entries(INVESTIGATION_CATEGORIES).map(([key, category]) => (
                <div key={key} className="border dark:border-gray-700 rounded-lg">
                  <button
                    onClick={() => setExpandedCategory(expandedCategory === key ? null : key)}
                    className="w-full px-4 py-2 flex justify-between items-center text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    <span className="font-medium">{category.name}</span>
                    {expandedCategory === key ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {expandedCategory === key && (
                    <div className="p-3 border-t dark:border-gray-700 grid grid-cols-2 gap-2">
                      {category.tests.map(test => {
                        const isOrdered = activeCase.orderedInvestigations.some(i => i.name === test);
                        return (
                          <button
                            key={test}
                            onClick={() => !isOrdered && setSelectedInvestigation(test)}
                            disabled={isOrdered}
                            className={`p-2 text-sm rounded border transition-all ${
                              selectedInvestigation === test
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                                : isOrdered
                                  ? 'border-green-300 bg-green-50 dark:bg-green-900/20 text-green-700'
                                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                            }`}
                          >
                            {isOrdered && <CheckCircle className="w-3 h-3 inline mr-1" />}
                            {test}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Order investigation form */}
            {selectedInvestigation && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 space-y-3">
                <p className="font-medium">Назначаване: {selectedInvestigation}</p>
                <textarea
                  value={investigationJustification}
                  onChange={(e) => setInvestigationJustification(e.target.value)}
                  placeholder="Защо назначавате това изследване?"
                  className="w-full px-3 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                  rows={2}
                />
                <button
                  onClick={handleOrderInvestigation}
                  disabled={!investigationJustification.trim() || isProcessingInvestigation}
                  className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isProcessingInvestigation ? 'Обработвам...' : 'Назначи'}
                </button>
              </div>
            )}

            {/* Ordered investigations */}
            {activeCase.orderedInvestigations.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-semibold">Резултати:</h4>
                {activeCase.orderedInvestigations.map(inv => (
                  <div key={inv.id} className={`p-3 rounded-lg border ${
                    inv.isAppropriate
                      ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
                      : 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20'
                  }`}>
                    <p className="font-medium">{inv.name}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{inv.result}</p>
                    {inv.feedback && (
                      <p className="text-xs text-gray-500 mt-2 italic">{inv.feedback}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleNextStep}
              className="w-full py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Продължи към DDx →
            </button>
          </div>
        );

      case 'ddx':
        const ddxEvaluation = activeCase.evaluations.find(e => e.step === 'ddx');
        return (
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              Подредете диференциалните диагнози по вероятност (най-вероятната най-горе):
            </p>

            {/* DDx list with drag and drop */}
            <div className="space-y-2">
              {ddxItems.map((item, index) => (
                <div
                  key={item.id}
                  draggable={!ddxEvaluation}
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`p-3 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 flex items-center gap-3 cursor-move ${
                    draggedIndex === index ? 'opacity-50' : ''
                  }`}
                >
                  <GripVertical className="w-4 h-4 text-gray-400" />
                  <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 flex items-center justify-center text-sm font-medium">
                    {item.rank}
                  </span>
                  <span className="flex-1">{item.diagnosis}</span>
                  {!ddxEvaluation && (
                    <button
                      onClick={() => handleRemoveDdx(item.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Add new DDx */}
            {!ddxEvaluation && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newDdxInput}
                  onChange={(e) => setNewDdxInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddDdx()}
                  placeholder="Добави диагноза..."
                  className="flex-1 px-4 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
                />
                <button
                  onClick={handleAddDdx}
                  disabled={!newDdxInput.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Evaluation result */}
            {ddxEvaluation && (
              <div className={`p-4 rounded-lg ${
                ddxEvaluation.score >= 70
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                  : 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
              }`}>
                <p className="font-semibold mb-2">Оценка: {ddxEvaluation.score}%</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">{ddxEvaluation.feedback}</p>
              </div>
            )}

            {!ddxEvaluation && ddxItems.length > 0 && (
              <button
                onClick={handleEvaluateDdx}
                disabled={isEvaluatingDdx}
                className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isEvaluatingDdx ? 'Оценявам...' : 'Оцени DDx'}
              </button>
            )}

            {ddxEvaluation && (
              <button
                onClick={handleNextStep}
                className="w-full py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Продължи към финална диагноза →
              </button>
            )}
          </div>
        );

      case 'confirmation':
        const diagnosisEvaluation = activeCase.evaluations.find(e => e.step === 'confirmation');
        return (
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              Въз основа на събраната информация, каква е вашата финална диагноза?
            </p>

            {!diagnosisEvaluation && (
              <>
                <input
                  type="text"
                  value={finalDiagnosisInput}
                  onChange={(e) => setFinalDiagnosisInput(e.target.value)}
                  placeholder="Въведете финална диагноза..."
                  className="w-full px-4 py-3 border rounded-lg dark:bg-gray-800 dark:border-gray-700 text-lg"
                />
                <button
                  onClick={handleEvaluateDiagnosis}
                  disabled={!finalDiagnosisInput.trim() || isEvaluatingDiagnosis}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {isEvaluatingDiagnosis ? 'Проверявам...' : 'Потвърди диагноза'}
                </button>
              </>
            )}

            {diagnosisEvaluation && (
              <>
                <div className={`p-4 rounded-lg ${
                  diagnosisEvaluation.score >= 70
                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                    : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                }`}>
                  <p className="font-semibold mb-2">
                    {diagnosisEvaluation.score >= 70 ? '✓ Правилно!' : '✗ Неправилно'}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{diagnosisEvaluation.feedback}</p>
                  <p className="text-sm font-medium">
                    Правилна диагноза: {activeCase.hiddenData.actualDiagnosis}
                  </p>
                </div>
                <button
                  onClick={handleNextStep}
                  className="w-full py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Продължи към лечение →
                </button>
              </>
            )}
          </div>
        );

      case 'treatment':
        return (
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              Създайте план за лечение на {activeCase.hiddenData.actualDiagnosis}:
            </p>

            {/* Treatment items */}
            <div className="space-y-3">
              {treatmentItems.map(item => (
                <div key={item.id} className="p-3 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700 space-y-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={item.category}
                      onChange={(e) => updateTreatmentItem(item.id, { category: e.target.value as TreatmentPlanItem['category'] })}
                      className="px-2 py-1 border rounded dark:bg-gray-700 dark:border-gray-600 text-sm"
                    >
                      <option value="medication">Медикамент</option>
                      <option value="procedure">Процедура</option>
                      <option value="lifestyle">Режим</option>
                      <option value="referral">Консултация</option>
                      <option value="monitoring">Мониториране</option>
                    </select>
                    <select
                      value={item.priority}
                      onChange={(e) => updateTreatmentItem(item.id, { priority: e.target.value as TreatmentPlanItem['priority'] })}
                      className="px-2 py-1 border rounded dark:bg-gray-700 dark:border-gray-600 text-sm"
                    >
                      <option value="immediate">Спешно</option>
                      <option value="short_term">Краткосрочно</option>
                      <option value="long_term">Дългосрочно</option>
                    </select>
                    <button
                      onClick={() => removeTreatmentItem(item.id)}
                      className="text-red-500 hover:text-red-700 ml-auto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateTreatmentItem(item.id, { description: e.target.value })}
                    placeholder="Описание..."
                    className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                  />
                  {item.category === 'medication' && (
                    <input
                      type="text"
                      value={item.dosage || ''}
                      onChange={(e) => updateTreatmentItem(item.id, { dosage: e.target.value })}
                      placeholder="Дозировка..."
                      className="w-full px-3 py-2 border rounded dark:bg-gray-700 dark:border-gray-600 text-sm"
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Add treatment buttons */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleAddTreatmentItem('medication')}
                className="px-3 py-1 text-sm border rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                + Медикамент
              </button>
              <button
                onClick={() => handleAddTreatmentItem('procedure')}
                className="px-3 py-1 text-sm border rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                + Процедура
              </button>
              <button
                onClick={() => handleAddTreatmentItem('monitoring')}
                className="px-3 py-1 text-sm border rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                + Мониториране
              </button>
            </div>

            <button
              onClick={handleEvaluateTreatment}
              disabled={treatmentItems.length === 0 || isEvaluatingTreatment}
              className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {isEvaluatingTreatment ? 'Оценявам...' : 'Завърши случая'}
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  // Results screen
  if (showResults && activeCase && caseSummary) {
    return (
      <div className="space-y-6">
        <div className="text-center py-6">
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${
            caseSummary.grade >= 5 ? 'bg-green-100 text-green-600' :
            caseSummary.grade >= 4 ? 'bg-yellow-100 text-yellow-600' :
            'bg-red-100 text-red-600'
          }`}>
            <span className="text-3xl font-bold">{caseSummary.grade}</span>
          </div>
          <h2 className="text-2xl font-bold mb-2">Случаят е завършен!</h2>
          <p className="text-gray-600 dark:text-gray-400">
            {caseSummary.overallScore}% | {formatTime(elapsedTime)}
          </p>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-6 space-y-4">
          <p className="text-gray-700 dark:text-gray-300">{caseSummary.summary}</p>

          {caseSummary.keyLearnings.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Какво научи:</h4>
              <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1">
                {caseSummary.keyLearnings.map((learning, i) => (
                  <li key={i}>{learning}</li>
                ))}
              </ul>
            </div>
          )}

          {caseSummary.areasForReview.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">За преговор:</h4>
              <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 space-y-1">
                {caseSummary.areasForReview.map((area, i) => (
                  <li key={i}>{area}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-blue-600 dark:text-blue-400 italic">{caseSummary.encouragement}</p>
        </div>

        {/* Per-step evaluations */}
        <div className="space-y-3">
          <h4 className="font-semibold">Оценки по стъпки:</h4>
          {activeCase.evaluations.map((evaluation, i) => (
            <div key={i} className="p-3 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-700">
              <div className="flex justify-between items-center">
                <span className="font-medium">
                  {CASE_STEPS.find(s => s.step === evaluation.step)?.name}
                </span>
                <span className={`px-2 py-1 rounded text-sm ${
                  evaluation.score >= 70 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {evaluation.score}%
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <Link
            href="/cases"
            className="flex-1 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-center"
          >
            Нов случай
          </Link>
          <Link
            href={`/subjects/${activeCase.subjectId}/topics/${activeCase.topicId}`}
            className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-center"
          >
            Към темата
          </Link>
        </div>
      </div>
    );
  }

  // Active case view
  if (activeCase) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              if (confirm('Сигурен ли си, че искаш да напуснеш случая?')) {
                setActiveCase(null);
                setCaseStartTime(null);
                setElapsedTime(0);
              }
            }}
            className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Clock className="w-4 h-4" />
            {formatTime(elapsedTime)}
          </div>
        </div>

        {/* Step progress */}
        <div className="flex items-center justify-between bg-gray-100 dark:bg-gray-800 rounded-lg p-2">
          {CASE_STEPS.map((step, index) => {
            const isActive = step.step === activeCase.currentStep;
            const isPast = index < getCurrentStepIndex();
            return (
              <div key={step.step} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : isPast
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-400'
                }`}>
                  {isPast ? <CheckCircle className="w-4 h-4" /> : index + 1}
                </div>
                {index < CASE_STEPS.length - 1 && (
                  <div className={`w-4 md:w-8 h-0.5 ${
                    isPast ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Current step name */}
        <h2 className="text-xl font-semibold text-center">
          {CASE_STEPS.find(s => s.step === activeCase.currentStep)?.name}
        </h2>

        {/* Error display */}
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {/* Step content */}
        {renderStepContent()}
      </div>
    );
  }

  // Topic selection view
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Stethoscope className="w-7 h-7 text-blue-600" />
          Клинични Случаи
        </h1>
        <Link href="/" className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">
          <ArrowLeft className="w-5 h-5" />
        </Link>
      </div>

      {/* Subject selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Предмет
        </label>
        <select
          value={selectedSubjectId || ''}
          onChange={(e) => {
            setSelectedSubjectId(e.target.value || null);
            setSelectedTopicId(null);
          }}
          className="w-full px-4 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
        >
          <option value="">Избери предмет...</option>
          {data.subjects.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Topic selection */}
      {selectedSubjectId && subject && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Тема
          </label>
          <select
            value={selectedTopicId || ''}
            onChange={(e) => setSelectedTopicId(e.target.value || null)}
            className="w-full px-4 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
          >
            <option value="">Избери тема...</option>
            {subject.topics
              .filter(t => t.material && t.material.length > 200)
              .map(t => (
                <option key={t.id} value={t.id}>
                  {t.number}. {t.name} ({STATUS_CONFIG[t.status].label})
                </option>
              ))}
          </select>
          {subject.topics.filter(t => !t.material || t.material.length <= 200).length > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              Някои теми са скрити поради липса на достатъчно материал.
            </p>
          )}
        </div>
      )}

      {/* Difficulty selection */}
      {selectedTopicId && topic && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Трудност
          </label>
          <div className="grid grid-cols-3 gap-3">
            {(['beginner', 'intermediate', 'advanced'] as CaseDifficulty[]).map(d => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`p-3 rounded-lg border text-center transition-all ${
                  difficulty === d
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="font-medium">
                  {d === 'beginner' ? 'Начинаещ' : d === 'intermediate' ? 'Среден' : 'Напреднал'}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {d === 'beginner' ? 'Ясна презентация' : d === 'intermediate' ? 'Умерена сложност' : 'Комплексен случай'}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-3 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* API key warning */}
      {!apiKey && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300 p-3 rounded-lg">
          Нямаш конфигуриран Claude API ключ. Отиди в Settings за да го добавиш.
        </div>
      )}

      {/* Start button */}
      <button
        onClick={handleGenerateCase}
        disabled={!selectedTopicId || !apiKey || isGenerating}
        className="w-full py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg font-semibold"
      >
        {isGenerating ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Генерирам случай...
          </>
        ) : (
          <>
            <Play className="w-6 h-6" />
            Започни случай
          </>
        )}
      </button>

      {/* Info box */}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-sm text-gray-600 dark:text-gray-400">
        <h4 className="font-semibold mb-2">Как работи:</h4>
        <ol className="list-decimal list-inside space-y-1">
          <li>AI генерира клиничен случай от материала на темата</li>
          <li>Събираш анамнеза чрез разговор с "пациента"</li>
          <li>Избираш какво да прегледаш и изследваш</li>
          <li>Създаваш диференциална диагноза и план за лечение</li>
          <li>Получаваш обратна връзка на всяка стъпка</li>
        </ol>
      </div>
    </div>
  );
}

export default function CasesPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CasesContent />
    </Suspense>
  );
}

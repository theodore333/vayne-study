'use client';

import { useState, useEffect, Suspense, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
 Stethoscope, Play, ChevronRight, ArrowLeft, MessageCircle, User,
 Heart, Wind, Brain, Eye, Send, CheckCircle, Pill, ListOrdered,
 TestTube, AlertCircle, Clock, ChevronDown, ChevronUp, GripVertical,
 Plus, Trash2, ArrowRight, Shield, Camera
} from 'lucide-react';
import Link from 'next/link';
import { useApp } from '@/lib/context';
import { STATUS_CONFIG } from '@/lib/constants';
import {
 CASE_STEPS, CaseStep, CaseDifficulty, CaseMessage, ExamFinding,
 CaseInvestigation, DifferentialDiagnosis, TreatmentPlanItem,
 StepEvaluation, InteractiveClinicalCase, EXAM_SYSTEMS, INVESTIGATION_CATEGORIES,
 SuggestedImage, TopicImage
} from '@/lib/types';
import { fetchWithTimeout, getFetchErrorMessage } from '@/lib/fetch-utils';
import { saveImage, getImagesForTopic, deleteImage, resizeImage } from '@/lib/image-storage';
import { generateId } from '@/lib/algorithms';

// Demo case for testing
const DEMO_CASE: InteractiveClinicalCase = {
 id: 'demo_case_1',
 subjectId: 'demo',
 topicId: 'demo',
 difficulty: 'intermediate',
 specialty: 'Кардиология',
 createdAt: new Date().toISOString(),
 completedAt: null,
 presentation: {
 age: 58,
 gender: 'male',
 chiefComplaint: 'Гръдна болка от 2 часа, с изпотяване и задух',
 briefHistory: 'Пациентът съобщава за внезапна поява на стягаща болка зад гръдната кост преди около 2 часа, докато е бил в покой. Болката се разпространява към лявата ръка и е придружена от изпотяване и леко затруднено дишане.'
 },
 hiddenData: {
 actualDiagnosis: 'Остър миокарден инфаркт (STEMI)',
 keyHistoryFindings: [
 'Хипертония от 10 години, нередовно приема лекарства',
 'Пуши по 1 кутия цигари дневно от 30 години',
 'Баща починал от инфаркт на 55 години',
 'Диабет тип 2 от 5 години'
 ],
 keyExamFindings: {
 general: { system: 'general', finding: 'Бледа, изпотена кожа, изглежда неспокоен', isNormal: false, isRelevant: true },
 cardiovascular: { system: 'cardiovascular', finding: 'Тахикардия 110/мин, АН 150/95, тих систолен шум на върха', isNormal: false, isRelevant: true },
 respiratory: { system: 'respiratory', finding: 'Леки влажни хрипове базално двустранно', isNormal: false, isRelevant: true },
 abdominal: { system: 'abdominal', finding: 'Мек, неболезнен, без органомегалия', isNormal: true, isRelevant: false },
 neurological: { system: 'neurological', finding: 'В съзнание, ориентиран, без огнищна симптоматика', isNormal: true, isRelevant: false }
 },
 expectedInvestigations: ['ЕКГ', 'Сърдечни маркери', 'ПКК (CBC)', 'Ехокардиография'],
 investigationImages: {
 'ЕКГ': '/medical-images/ECG-Extensive-Anterolateral-STEMI.jpg'
 },
 differentialDiagnoses: [
 'Остър миокарден инфаркт (STEMI)',
 'Нестабилна ангина',
 'Аортна дисекация',
 'Белодробна емболия',
 'Перикардит'
 ],
 treatmentPlan: [
 { id: 'tx1', category: 'medication', description: 'Аспирин', dosage: '300 mg per os', priority: 'immediate' },
 { id: 'tx2', category: 'medication', description: 'Хепарин', dosage: '5000 IU i.v.', priority: 'immediate' },
 { id: 'tx3', category: 'medication', description: 'Нитроглицерин', dosage: 'сублингвално при болка', priority: 'immediate' },
 { id: 'tx4', category: 'procedure', description: 'Спешна коронарография и PCI', priority: 'immediate' },
 { id: 'tx5', category: 'monitoring', description: 'Непрекъснат ЕКГ мониторинг', priority: 'immediate' }
 ]
 },
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

 // AbortController for cleanup on unmount
 const abortControllerRef = useRef<AbortController | null>(null);

 // Cleanup effect - abort any pending requests on unmount
 useEffect(() => {
 abortControllerRef.current = new AbortController();
 return () => {
 abortControllerRef.current?.abort();
 };
 }, []);

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

 // Load demo case (no API needed)
 const loadDemoCase = () => {
 setActiveCase({ ...DEMO_CASE, id: `demo_${Date.now()}`, createdAt: new Date().toISOString() });
 setCaseStartTime(Date.now());
 setError(null);
 };

 // Generate case
 const handleGenerateCase = async () => {
 if (!subject || !apiKey || isGenerating) return;

 // Pick a random topic — prefer topics with material, but allow any
 const topicsPool = subject.topics.filter(t => t.material && t.material.length > 200);
 const allTopics = subject.topics;
 if (allTopics.length === 0) {
 setError('Няма теми в този предмет');
 return;
 }

 // Prefer topics with material; fall back to any topic
 const randomTopic = topicsPool.length > 0
 ? topicsPool[Math.floor(Math.random() * topicsPool.length)]
 : allTopics[Math.floor(Math.random() * allTopics.length)];

 // Find pharmacology subjects for cross-subject integration
 const pharmacologySubjects = data.subjects.filter(s =>
 !s.archived && !s.deletedAt && s.name.toLowerCase().includes('фармакол')
 );
 const pharmacologyTopics = pharmacologySubjects.flatMap(s =>
 s.topics
 .filter(t => t.material && t.material.length > 100)
 .map(t => ({ id: t.id, name: t.name, subjectId: s.id }))
 );

 setIsGenerating(true);
 setError(null);

 try {
 const response = await fetchWithTimeout('/api/cases', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 apiKey,
 mode: 'generate_case',
 material: randomTopic.material || '',
 topicName: randomTopic.name,
 subjectName: subject.name,
 subjectType: subject.subjectType || 'clinical',
 difficulty,
 pharmacologyTopics: pharmacologyTopics.length > 0 ? pharmacologyTopics : undefined
 }),
 // 60s for case generation
 signal: abortControllerRef.current?.signal
 });

 const result = await response.json();
 if (!response.ok) throw new Error(result.error);

 incrementApiCalls(result.usage?.cost || 0);

 const newCase: InteractiveClinicalCase = {
 id: generateId(),
 subjectId: selectedSubjectId!,
 topicId: randomTopic.id,
 difficulty,
 specialty: result.case.specialty,
 createdAt: new Date().toISOString(),
 completedAt: null,
 presentation: result.case.presentation,
 hiddenData: {
 ...result.case.hiddenData,
 relevantPharmacologyTopicIds: result.case.hiddenData?.relevantPharmacologyTopicIds || [],
 relevantPharmacologyTopicNames: result.case.hiddenData?.relevantPharmacologyTopicNames || [],
 },
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
 setError(getFetchErrorMessage(err));
 } finally {
 setIsGenerating(false);
 }
 };


 // Demo patient responses (when no API key)
 const getDemoPatientResponse = (question: string): string => {
 const q = question.toLowerCase();
 if (q.includes('болка') || q.includes('боли')) {
 return 'Да, много ме боли... тук, в гърдите. Стяга ме, като че ли някой ме притиска. Започна преди около 2 часа.';
 }
 if (q.includes('пуш') || q.includes('цигар')) {
 return 'Да, пуша от много години... по кутия на ден. Знам, че трябва да спра, но е трудно.';
 }
 if (q.includes('лекарства') || q.includes('приемате')) {
 return 'Имам хапчета за кръвно, ама... не ги пия редовно. Понякога забравям.';
 }
 if (q.includes('фамил') || q.includes('родител') || q.includes('баща') || q.includes('майка')) {
 return 'Баща ми почина от инфаркт на 55 години... Майка ми е жива, има високо кръвно.';
 }
 if (q.includes('диабет') || q.includes('захар')) {
 return 'Да, имам захар от няколко години. Лекарят каза, че трябва да внимавам с храната.';
 }
 if (q.includes('кръвно') || q.includes('хипертон') || q.includes('налягане')) {
 return 'Да, имам високо кръвно от около 10 години. Понякога стига до 160-170.';
 }
 if (q.includes('ръка') || q.includes('разпростран')) {
 return 'Да, болката отива към лявата ми ръка... чак до лакътя. И малко изтръпва.';
 }
 if (q.includes('потя') || q.includes('изпотя') || q.includes('пот')) {
 return 'Да, много се изпотих... цялата риза ми е мокра. И ми е студено някак.';
 }
 if (q.includes('дишане') || q.includes('задух') || q.includes('въздух') || q.includes('диша')) {
 return 'Малко ми е трудно да дишам... не мога да поема дълбоко въздух.';
 }
 if (q.includes('гаде') || q.includes('повръщ')) {
 return 'Да, малко ми се гади... но не съм повръщал.';
 }
 return 'Не съм сигурен какво питате, докторе. Може ли да обясните?';
 };

 // Handle patient response in history
 const handleSendQuestion = async () => {
 if (isPatientResponding || !activeCase || !historyInput.trim()) return;

 const newMessage: CaseMessage = {
 id: generateId(),
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
 let patientResponseText: string;
 const isDemo = activeCase.subjectId === 'demo';

 if (!apiKey || isDemo) {
 // Demo mode - use hardcoded responses
 await new Promise(r => setTimeout(r, 800));
 patientResponseText = getDemoPatientResponse(historyInput);
 } else {
 // Real API call
 const response = await fetchWithTimeout('/api/cases', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 apiKey,
 mode: 'patient_response',
 caseContext: JSON.stringify(activeCase.hiddenData),
 conversationHistory: [...activeCase.historyMessages, newMessage],
 studentQuestion: historyInput,
 presentation: activeCase.presentation
 }),
 
 signal: abortControllerRef.current?.signal
 });

 if (!response.ok) {
 const errorText = await response.text();
 throw new Error(errorText || 'API грешка');
 }

 const result = await response.json();
 patientResponseText = result.response;
 incrementApiCalls(result.usage?.cost || 0);
 }

 const patientMessage: CaseMessage = {
 id: (Date.now() + 1).toString(),
 role: 'patient',
 content: patientResponseText,
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
 if (isRevealingExam || !activeCase || selectedExamSystems.size === 0) return;

 setIsRevealingExam(true);

 try {
 const isDemo = activeCase.subjectId === 'demo';
 let findings: ExamFinding[];

 if (!apiKey || isDemo) {
 await new Promise(r => setTimeout(r, 600));
 findings = Array.from(selectedExamSystems).map(system => {
 const hidden = activeCase.hiddenData.keyExamFindings[system];
 if (hidden) return hidden;
 return { system, finding: 'Без патологични отклонения', isNormal: true, isRelevant: false };
 });
 } else {
 const response = await fetchWithTimeout('/api/cases', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 apiKey,
 mode: 'reveal_exam',
 selectedSystems: Array.from(selectedExamSystems),
 hiddenFindings: activeCase.hiddenData.keyExamFindings,
 presentation: activeCase.presentation
 }),
 
 signal: abortControllerRef.current?.signal
 });
 const result = await response.json();
 if (!response.ok) throw new Error(result.error);
 incrementApiCalls(result.usage?.cost || 0);
 findings = result.findings;
 }

 setActiveCase(prev => prev ? {
 ...prev,
 selectedExams: Array.from(selectedExamSystems),
 examFindings: findings
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
 if (isProcessingInvestigation || !activeCase || !selectedInvestigation || !investigationJustification.trim()) return;

 setIsProcessingInvestigation(true);

 try {
 const isDemo = activeCase.subjectId === 'demo';
 let invResult: string;
 let isAppropriate: boolean;
 let feedback: string;

 if (!apiKey || isDemo) {
 await new Promise(r => setTimeout(r, 700));
 const expected = activeCase.hiddenData.expectedInvestigations || [];
 isAppropriate = expected.includes(selectedInvestigation);

 const demoResults: Record<string, string> = {
 'ЕКГ': 'ST елевация в V1-V6, I, aVL. Реципрочна депресия в II, III, aVF. Заключение: Обширен преден STEMI.',
 'Сърдечни маркери': 'Тропонин I: 2.8 ng/mL (норма < 0.04) - ПОВИШЕН. CK-MB: 45 U/L (норма < 25) - ПОВИШЕН. Индикативно за остра миокардна некроза.',
 'ПКК (CBC)': 'Hb 14.2 g/dL, WBC 12.1 x10⁹/L (леко повишени), PLT 245 x10⁹/L. Лека левкоцитоза - стресова реакция.',
 'Ехокардиография': 'Хипокинезия на предна стена и септум. ФИ 40% (понижена). Без перикарден излив. Без клапни лезии.',
 'Кръвна захар': 'Глюкоза: 9.2 mmol/L (повишена - стрес хипергликемия при известен диабет)',
 'Биохимия': 'Креатинин 98 μmol/L (норма), Урея 6.2 mmol/L, AST 52 U/L (леко ↑), ALT 38 U/L',
 'Електролити': 'Na 139 mmol/L, K 4.1 mmol/L, Cl 102 mmol/L - в референтни граници',
 'Коагулация': 'PT 12.5 sec, INR 1.0, aPTT 32 sec - в норма',
 'Рентген гръден кош': 'Лека кардиомегалия. Белодробен застой базално. Без плеврален излив.',
 'D-димер': 'D-димер: 0.38 mg/L (леко повишен, но не суgestивен за БТЕ)',
 'CRP': 'CRP: 15 mg/L (повишен - възпалителна реакция)',
 'Кръвно-газов анализ': 'pH 7.38, pO2 75 mmHg (леко ↓), pCO2 36 mmHg, HCO3 22 - лека хипоксемия'
 };

 invResult = demoResults[selectedInvestigation] || 'Резултат: В референтни граници.';
 feedback = isAppropriate ? 'Добър избор!' : 'Не е от първа необходимост за този случай.';
 } else {
 const response = await fetchWithTimeout('/api/cases', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 apiKey,
 mode: 'process_investigation',
 investigation: { name: selectedInvestigation, justification: investigationJustification },
 caseContext: JSON.stringify(activeCase.hiddenData),
 presentation: activeCase.presentation,
 actualDiagnosis: activeCase.hiddenData.actualDiagnosis
 }),
 
 signal: abortControllerRef.current?.signal
 });
 const result = await response.json();
 if (!response.ok) throw new Error(result.error);
 incrementApiCalls(result.usage?.cost || 0);
 invResult = result.result;
 isAppropriate = result.isAppropriate;
 feedback = result.feedback;
 }

 const newInvestigation: CaseInvestigation = {
 id: generateId(),
 name: selectedInvestigation,
 category: Object.entries(INVESTIGATION_CATEGORIES).find(([, cat]) =>
 (cat.tests as readonly string[]).includes(selectedInvestigation)
 )?.[0] as 'laboratory' | 'imaging' | 'procedure' | 'other' || 'other',
 justification: investigationJustification,
 result: invResult,
 isAppropriate: isAppropriate,
 feedback: feedback
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
 id: generateId(),
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
 if (isEvaluatingDdx || !activeCase || ddxItems.length === 0) return;

 setIsEvaluatingDdx(true);

 try {
 const isDemo = activeCase.subjectId === 'demo';
 let evalScore: number;
 let evalFeedback: string;
 let evalStrengths: string[];
 let evalAreasToImprove: string[];
 let missedDiagnoses: string[];

 if (!apiKey || isDemo) {
 await new Promise(r => setTimeout(r, 800));
 const actualDx = activeCase.hiddenData.actualDiagnosis.toLowerCase();
 const studentDiagnoses = ddxItems.map(d => d.diagnosis.toLowerCase());
 const hasCorrect = studentDiagnoses.some(d => d.includes('инфаркт') || d.includes('stemi') || d.includes('оми'));
 const correctAtTop = ddxItems[0]?.diagnosis.toLowerCase().includes('инфаркт') || ddxItems[0]?.diagnosis.toLowerCase().includes('stemi');

 evalScore = 50 + (hasCorrect ? 25 : 0) + (correctAtTop ? 25 : 0);
 evalFeedback = hasCorrect
 ? (correctAtTop ? 'Отлично! Правилната диагноза е на първо място.' : 'Добре! Включихте STEMI, но може да е по-високо.')
 : 'STEMI трябва да е в диференциалната диагноза при тази презентация.';
 evalStrengths = hasCorrect ? ['Включена правилната диагноза'] : ['Систематичен подход'];
 evalAreasToImprove = hasCorrect ? [] : ['Винаги мислете за ОМИ при гръдна болка'];
 missedDiagnoses = activeCase.hiddenData.differentialDiagnoses.filter(d => !studentDiagnoses.some(sd => sd.includes(d.toLowerCase().split(' ')[0])));
 } else {
 const response = await fetchWithTimeout('/api/cases', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 apiKey,
 mode: 'evaluate_ddx',
 studentDdx: ddxItems,
 correctDdx: activeCase.hiddenData.differentialDiagnoses,
 actualDiagnosis: activeCase.hiddenData.actualDiagnosis,
 caseContext: JSON.stringify(activeCase.presentation)
 }),
 
 signal: abortControllerRef.current?.signal
 });
 const result = await response.json();
 if (!response.ok) throw new Error(result.error);
 incrementApiCalls(result.usage?.cost || 0);
 evalScore = result.evaluation.score;
 evalFeedback = result.evaluation.feedback;
 evalStrengths = result.evaluation.strengths || [];
 evalAreasToImprove = result.evaluation.areasToImprove || [];
 missedDiagnoses = result.evaluation.missedDiagnoses || [];
 }

 const evaluation: StepEvaluation = {
 step: 'ddx',
 score: evalScore,
 feedback: evalFeedback,
 strengths: evalStrengths,
 areasToImprove: evalAreasToImprove,
 missedPoints: missedDiagnoses,
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
 if (isEvaluatingDiagnosis || !activeCase || !finalDiagnosisInput.trim()) return;

 setIsEvaluatingDiagnosis(true);

 try {
 const isDemo = activeCase.subjectId === 'demo';
 let evalScore: number;
 let evalFeedback: string;
 let learningPoints: string[];

 if (!apiKey || isDemo) {
 await new Promise(r => setTimeout(r, 600));
 const student = finalDiagnosisInput.toLowerCase();
 const isCorrect = student.includes('инфаркт') || student.includes('stemi') || student.includes('оми');

 evalScore = isCorrect ? 100 : 30;
 evalFeedback = isCorrect
 ? 'Правилно! STEMI е коректната диагноза.'
 : `Неправилно. Отговорът е: ${activeCase.hiddenData.actualDiagnosis}`;
 learningPoints = ['ST елевация = STEMI', 'Време до PCI < 90 мин', 'Триада: болка + изпотяване + задух'];
 } else {
 const response = await fetchWithTimeout('/api/cases', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 apiKey,
 mode: 'evaluate_diagnosis',
 studentDiagnosis: finalDiagnosisInput,
 actualDiagnosis: activeCase.hiddenData.actualDiagnosis,
 studentDdx: activeCase.studentDdx,
 caseContext: JSON.stringify(activeCase.presentation)
 }),
 
 signal: abortControllerRef.current?.signal
 });
 const result = await response.json();
 if (!response.ok) throw new Error(result.error);
 incrementApiCalls(result.usage?.cost || 0);
 evalScore = result.evaluation.score;
 evalFeedback = result.evaluation.feedback;
 learningPoints = result.evaluation.learningPoints || [];
 }

 const evaluation: StepEvaluation = {
 step: 'confirmation',
 score: evalScore,
 feedback: evalFeedback,
 strengths: learningPoints,
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
 id: generateId(),
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
 if (isEvaluatingTreatment || !activeCase || treatmentItems.length === 0) return;

 setIsEvaluatingTreatment(true);

 try {
 const isDemo = activeCase.subjectId === 'demo';
 let evalScore: number;
 let evalFeedback: string;
 let evalStrengths: string[];
 let evalAreasToImprove: string[];
 let missedElements: string[];
 let pharmacologyFeedback: string | undefined;
 let pharmacologyTopicInfo: Array<{ id: string; name: string; subjectId: string }> = [];

 // Load relevant pharmacology material
 let pharmacologyMaterial = '';
 const pharmaTopicIds = activeCase.hiddenData.relevantPharmacologyTopicIds || [];
 if (pharmaTopicIds.length > 0) {
 for (const s of data.subjects) {
 for (const t of s.topics) {
 if (pharmaTopicIds.includes(t.id) && t.material) {
 pharmacologyTopicInfo.push({ id: t.id, name: t.name, subjectId: s.id });
 const truncated = t.material.substring(0, 3000);
 pharmacologyMaterial += `\n\n--- Тема: ${t.name} ---\n${truncated}`;
 }
 }
 }
 if (pharmacologyMaterial.length > 10000) {
 pharmacologyMaterial = pharmacologyMaterial.substring(0, 10000) + '\n... (съкратено)';
 }
 }

 if (!apiKey || isDemo) {
 await new Promise(r => setTimeout(r, 800));
 const studentMeds = treatmentItems.map(t => t.description.toLowerCase());
 const hasAspirin = studentMeds.some(m => m.includes('аспирин'));
 const hasAnticoag = studentMeds.some(m => m.includes('хепарин'));
 const hasPCI = studentMeds.some(m => m.includes('pci') || m.includes('коронарограф'));

 evalScore = 40 + (hasAspirin ? 20 : 0) + (hasAnticoag ? 20 : 0) + (hasPCI ? 20 : 0);
 evalFeedback = evalScore >= 80 ? 'Отличен план!' : 'Планът може да се подобри.';
 evalStrengths = [
 ...(hasAspirin ? ['Аспирин'] : []),
 ...(hasAnticoag ? ['Антикоагулация'] : []),
 ...(hasPCI ? ['Реваскуларизация'] : [])
 ];
 evalAreasToImprove = [
 ...(!hasAspirin ? ['Добавете аспирин'] : []),
 ...(!hasAnticoag ? ['Добавете хепарин'] : []),
 ...(!hasPCI ? ['PCI е стандарт'] : [])
 ];
 missedElements = [];
 // Demo pharmacology feedback
 pharmacologyTopicInfo = [
 { id: 'demo-pharm-1', name: 'Антитромбоцитни средства', subjectId: 'demo' },
 { id: 'demo-pharm-2', name: 'Антикоагуланти', subjectId: 'demo' }
 ];
 pharmacologyFeedback = 'Аспиринът инхибира COX-1, блокирайки TXA2 синтеза и тромбоцитната агрегация. Хепаринът потенцира антитромбин III. При STEMI е важна двойната антитромбоцитна терапия (аспирин + P2Y12 инхибитор).';
 } else {
 const response = await fetchWithTimeout('/api/cases', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 apiKey,
 mode: 'evaluate_treatment',
 studentTreatment: treatmentItems,
 expectedTreatment: activeCase.hiddenData.treatmentPlan,
 actualDiagnosis: activeCase.hiddenData.actualDiagnosis,
 caseContext: JSON.stringify(activeCase.presentation),
 pharmacologyMaterial: pharmacologyMaterial || undefined,
 pharmacologyTopicNames: activeCase.hiddenData.relevantPharmacologyTopicNames || undefined
 }),

 signal: abortControllerRef.current?.signal
 });
 const result = await response.json();
 if (!response.ok) throw new Error(result.error);
 incrementApiCalls(result.usage?.cost || 0);
 evalScore = result.evaluation.score;
 evalFeedback = result.evaluation.feedback;
 evalStrengths = result.evaluation.strengths || [];
 evalAreasToImprove = result.evaluation.areasToImprove || [];
 missedElements = result.evaluation.missedElements || [];
 pharmacologyFeedback = result.evaluation.pharmacologyFeedback || undefined;
 }

 const evaluation: StepEvaluation = {
 step: 'treatment',
 score: evalScore,
 feedback: evalFeedback,
 strengths: evalStrengths,
 areasToImprove: evalAreasToImprove,
 missedPoints: missedElements,
 timestamp: new Date().toISOString(),
 pharmacologyTopics: pharmacologyTopicInfo.length > 0 ? pharmacologyTopicInfo : undefined,
 pharmacologyFeedback
 };

 setActiveCase(prev => prev ? {
 ...prev,
 treatmentPlan: treatmentItems,
 evaluations: [...prev.evaluations, evaluation]
 } : null);

 // Demo summary or API summary
 if (!apiKey || isDemo) {
 const allEvals = [...activeCase.evaluations, evaluation];
 const avgScore = Math.round(allEvals.reduce((sum, e) => sum + e.score, 0) / allEvals.length);
 const grade = avgScore >= 90 ? 6 : avgScore >= 75 ? 5 : avgScore >= 60 ? 4 : avgScore >= 40 ? 3 : 2;
 setCaseSummary({
 overallScore: avgScore,
 grade,
 summary: 'Демо случай за STEMI завършен.',
 keyLearnings: ['STEMI изисква спешна PCI', 'Ключови: ЕКГ + тропонин', 'Двойна антитромбоцитна терапия'],
 areasForReview: avgScore < 80 ? ['Преговорете STEMI алгоритъма'] : [],
 encouragement: avgScore >= 80 ? 'Отлично представяне!' : 'Добра работа, продължавайте да учите!',
 nextSteps: 'Опитайте с реален случай с API ключ за по-разнообразни сценарии.'
 });
 } else {
 const summaryResponse = await fetchWithTimeout('/api/cases', {
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
 }),
 
 signal: abortControllerRef.current?.signal
 });
 const summaryResult = await summaryResponse.json();
 if (summaryResponse.ok) {
 incrementApiCalls(summaryResult.usage?.cost || 0);
 setCaseSummary(summaryResult.summary);
 }
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
 <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-6">
 <h3 className="text-lg font-semibold text-blue-300 mb-4">
 Представяне на пациента
 </h3>
 <div className="space-y-3 text-slate-200 text-base leading-relaxed">
 <p><strong className="text-slate-100">Възраст:</strong> {activeCase.presentation.age} години</p>
 <p><strong className="text-slate-100">Пол:</strong> {activeCase.presentation.gender === 'male' ? 'Мъж' : 'Жена'}</p>
 <p><strong className="text-slate-100">Основно оплакване:</strong> {activeCase.presentation.chiefComplaint}</p>
 <p className="mt-4 text-slate-300 italic leading-relaxed">
 {activeCase.presentation.briefHistory}
 </p>
 </div>
 </div>
 <button
 onClick={handleNextStep}
 className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 flex items-center justify-center gap-2"
 >
 Започни анамнеза <ArrowRight className="w-5 h-5" />
 </button>
 </div>
 );

 case 'history':
 return (
 <div className="space-y-4">
 <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 h-[28rem] overflow-y-auto">
 {activeCase.historyMessages.length === 0 && (
 <p className="text-slate-500 text-center py-8 text-base">
 Задавай въпроси на пациента, за да съберете анамнеза...
 </p>
 )}
 {activeCase.historyMessages.map((msg, i) => (
 <div key={msg.id} className={`mb-3 flex ${msg.role === 'student' ? 'justify-end' : 'justify-start'}`}>
 <div className={`max-w-[80%] p-3 rounded-lg text-base leading-relaxed ${
 msg.role === 'student'
 ? 'bg-blue-600/80 text-white'
 : 'bg-slate-700/60 text-slate-200 border border-slate-600/50'
 }`}>
 <p className="text-xs font-medium mb-1 opacity-60">
 {msg.role === 'student' ? 'Вие' : 'Пациент'}
 </p>
 {msg.content}
 </div>
 </div>
 ))}
 {isPatientResponding && (
 <div className="flex justify-start">
 <div className="bg-slate-700/60 p-3 rounded-lg border border-slate-600/50">
 <div className="flex gap-1">
 <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" />
 <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
 <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
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
 className="flex-1 px-4 py-3 border border-slate-600 rounded-lg bg-slate-800/50 text-slate-100 placeholder-slate-500 text-base"
 disabled={isPatientResponding}
 />
 <button
 onClick={handleSendQuestion}
 disabled={isPatientResponding || !historyInput.trim()}
 className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50"
 >
 <Send className="w-5 h-5" />
 </button>
 </div>
 <button
 onClick={handleNextStep}
 className="w-full py-2 bg-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-700 border border-slate-600/50"
 >
 Продължи към физикален преглед →
 </button>
 </div>
 );

 case 'physical_exam':
 return (
 <div className="space-y-4">
 <p className="text-slate-300 text-base">
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
 ? 'border-blue-500 bg-blue-500/15 text-blue-300'
 : 'border-slate-600/50 text-slate-300 hover:border-slate-500'
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
 className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50"
 >
 {isRevealingExam ? 'Преглеждам...' : `Прегледай (${selectedExamSystems.size} системи)`}
 </button>
 )}

 {examRevealed && activeCase.examFindings.length > 0 && (
 <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-3">
 <h4 className="font-semibold text-slate-100">Находки от прегледа:</h4>
 {activeCase.examFindings.map((finding, i) => (
 <div key={i} className={`p-3 rounded-lg ${
 finding.isNormal
 ? 'bg-green-500/10 border border-green-500/30'
 : 'bg-yellow-500/10 border border-yellow-500/30'
 }`}>
 <p className="font-medium text-slate-100">{EXAM_SYSTEMS.find(s => s.id === finding.system)?.name}</p>
 <p className="text-base text-slate-300 leading-relaxed">{finding.finding}</p>
 </div>
 ))}
 </div>
 )}

 {examRevealed && (
 <button
 onClick={handleNextStep}
 className="w-full py-2 bg-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-700 border border-slate-600/50"
 >
 Продължи към изследвания →
 </button>
 )}
 </div>
 );

 case 'investigations':
 return (
 <div className="space-y-4">
 <p className="text-slate-300 text-base">
 Назначете изследвания и обосновете избора си:
 </p>

 {/* Investigation categories */}
 <div className="space-y-2">
 {Object.entries(INVESTIGATION_CATEGORIES).map(([key, category]) => (
 <div key={key} className="border border-slate-600/50 rounded-lg">
 <button
 onClick={() => setExpandedCategory(expandedCategory === key ? null : key)}
 className="w-full px-4 py-2 flex justify-between items-center text-left text-slate-200 hover:bg-slate-700/50"
 >
 <span className="font-medium">{category.name}</span>
 {expandedCategory === key ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
 </button>
 {expandedCategory === key && (
 <div className="p-3 border-t border-slate-600/50 grid grid-cols-2 gap-2">
 {category.tests.map(test => {
 const isOrdered = activeCase.orderedInvestigations.some(i => i.name === test);
 return (
 <button
 key={test}
 onClick={() => !isOrdered && setSelectedInvestigation(test)}
 disabled={isOrdered}
 className={`p-2 text-sm rounded border transition-all ${
 selectedInvestigation === test
 ? 'border-blue-500 bg-blue-500/15 text-blue-300'
 : isOrdered
 ? 'border-green-500/30 bg-green-500/10 text-green-400'
 : 'border-slate-600/50 text-slate-300 hover:border-slate-500'
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
 <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 space-y-3">
 <p className="font-medium text-slate-100">Назначаване: {selectedInvestigation}</p>
 <textarea
 value={investigationJustification}
 onChange={(e) => setInvestigationJustification(e.target.value)}
 placeholder="Защо назначавате това изследване?"
 className="w-full px-3 py-2 border border-slate-600 rounded-lg bg-slate-800/50 text-slate-100 placeholder-slate-500"
 rows={2}
 />
 <button
 onClick={handleOrderInvestigation}
 disabled={!investigationJustification.trim() || isProcessingInvestigation}
 className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50"
 >
 {isProcessingInvestigation ? 'Обработвам...' : 'Назначи'}
 </button>
 </div>
 )}

 {/* Ordered investigations */}
 {activeCase.orderedInvestigations.length > 0 && (
 <div className="space-y-3">
 <h4 className="font-semibold text-slate-100">Резултати:</h4>
 {activeCase.orderedInvestigations.map(inv => {
 const invImage = activeCase.hiddenData.investigationImages?.[inv.name];
 return (
 <div key={inv.id} className={`p-4 rounded-lg border bg-slate-800/50 ${inv.isAppropriate ? 'border-green-500/30' : 'border-yellow-500/30'}`}>
 <p className="font-semibold text-slate-100 text-lg">{inv.name}</p>
 {invImage && (
 <div className="my-3">
 <img src={invImage} alt={inv.name} className="rounded-lg max-w-full h-auto border border-slate-600/50" />
 </div>
 )}
 <pre className="text-base text-slate-300 mt-2 whitespace-pre-wrap font-mono bg-slate-900/50 p-3 rounded border border-slate-700/50 leading-relaxed">{inv.result}</pre>
 {inv.feedback && (
 <p className="text-base text-green-400 mt-3 p-2 bg-green-500/10 rounded border border-green-500/20">{inv.feedback}</p>
 )}
 </div>
 );
 })}
 </div>
 )}

 <button
 onClick={handleNextStep}
 className="w-full py-2 bg-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-700 border border-slate-600/50"
 >
 Продължи към DDx →
 </button>
 </div>
 );

 case 'ddx':
 const ddxEvaluation = activeCase.evaluations.find(e => e.step === 'ddx');
 return (
 <div className="space-y-4">
 <p className="text-slate-300 text-base">
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
 className={`p-3 bg-slate-800/50 rounded-lg border border-slate-600/50 flex items-center gap-3 cursor-move text-slate-200 ${
 draggedIndex === index ? 'opacity-50' : ''
 }`}
 >
 <GripVertical className="w-4 h-4 text-slate-500" />
 <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-300 flex items-center justify-center text-sm font-medium">
 {item.rank}
 </span>
 <span className="flex-1">{item.diagnosis}</span>
 {!ddxEvaluation && (
 <button
 onClick={() => handleRemoveDdx(item.id)}
 className="text-red-400 hover:text-red-300"
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
 className="flex-1 px-4 py-3 border border-slate-600 rounded-lg bg-slate-800/50 text-slate-100 placeholder-slate-500 text-base"
 />
 <button
 onClick={handleAddDdx}
 disabled={!newDdxInput.trim()}
 className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50"
 >
 <Plus className="w-5 h-5" />
 </button>
 </div>
 )}

 {/* Evaluation result */}
 {ddxEvaluation && (
 <div className={`p-4 rounded-lg ${
 ddxEvaluation.score >= 70
 ? 'bg-green-500/10 border border-green-500/30'
 : 'bg-yellow-500/10 border border-yellow-500/30'
 }`}>
 <p className="font-semibold mb-2 text-slate-100">Оценка: {ddxEvaluation.score}%</p>
 <p className="text-base text-slate-300 leading-relaxed">{ddxEvaluation.feedback}</p>
 </div>
 )}

 {!ddxEvaluation && ddxItems.length > 0 && (
 <button
 onClick={handleEvaluateDdx}
 disabled={isEvaluatingDdx}
 className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50"
 >
 {isEvaluatingDdx ? 'Оценявам...' : 'Оцени DDx'}
 </button>
 )}

 {ddxEvaluation && (
 <button
 onClick={handleNextStep}
 className="w-full py-2 bg-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-700 border border-slate-600/50"
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
 <p className="text-slate-300 text-base">
 Въз основа на събраната информация, каква е вашата финална диагноза?
 </p>

 {!diagnosisEvaluation && (
 <>
 <input
 type="text"
 value={finalDiagnosisInput}
 onChange={(e) => setFinalDiagnosisInput(e.target.value)}
 placeholder="Въведете финална диагноза..."
 className="w-full px-4 py-3 border border-slate-600 rounded-lg bg-slate-800/50 text-slate-100 placeholder-slate-500 text-lg"
 />
 <button
 onClick={handleEvaluateDiagnosis}
 disabled={!finalDiagnosisInput.trim() || isEvaluatingDiagnosis}
 className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50"
 >
 {isEvaluatingDiagnosis ? 'Проверявам...' : 'Потвърди диагноза'}
 </button>
 </>
 )}

 {diagnosisEvaluation && (
 <>
 <div className={`p-4 rounded-lg ${
 diagnosisEvaluation.score >= 70
 ? 'bg-green-500/10 border border-green-500/30'
 : 'bg-red-500/10 border border-red-500/30'
 }`}>
 <p className={`font-semibold mb-2 ${diagnosisEvaluation.score >= 70 ? 'text-green-400' : 'text-red-400'}`}>
 {diagnosisEvaluation.score >= 70 ? '✓ Правилно!' : '✗ Неправилно'}
 </p>
 <p className="text-base text-slate-300 mb-2 leading-relaxed">{diagnosisEvaluation.feedback}</p>
 <p className="text-base font-medium text-slate-200">
 Правилна диагноза: {activeCase.hiddenData.actualDiagnosis}
 </p>
 </div>
 <button
 onClick={handleNextStep}
 className="w-full py-2 bg-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-700 border border-slate-600/50"
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
 <p className="text-slate-300 text-base">
 Създайте план за лечение на {activeCase.hiddenData.actualDiagnosis}:
 </p>

 {/* Treatment items */}
 <div className="space-y-3">
 {treatmentItems.map(item => (
 <div key={item.id} className="p-3 bg-slate-800/50 rounded-lg border border-slate-600/50 space-y-2">
 <div className="flex items-center gap-2">
 <select
 value={item.category}
 onChange={(e) => updateTreatmentItem(item.id, { category: e.target.value as TreatmentPlanItem['category'] })}
 className="px-2 py-1 border border-slate-600 rounded bg-slate-700 text-slate-200 text-sm"
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
 className="px-2 py-1 border border-slate-600 rounded bg-slate-700 text-slate-200 text-sm"
 >
 <option value="immediate">Спешно</option>
 <option value="short_term">Краткосрочно</option>
 <option value="long_term">Дългосрочно</option>
 </select>
 <button
 onClick={() => removeTreatmentItem(item.id)}
 className="text-red-400 hover:text-red-300 ml-auto"
 >
 <Trash2 className="w-4 h-4" />
 </button>
 </div>
 <input
 type="text"
 value={item.description}
 onChange={(e) => updateTreatmentItem(item.id, { description: e.target.value })}
 placeholder="Описание..."
 className="w-full px-3 py-2 border border-slate-600 rounded bg-slate-800/50 text-slate-100 placeholder-slate-500"
 />
 {item.category === 'medication' && (
 <input
 type="text"
 value={item.dosage || ''}
 onChange={(e) => updateTreatmentItem(item.id, { dosage: e.target.value })}
 placeholder="Дозировка..."
 className="w-full px-3 py-2 border border-slate-600 rounded bg-slate-800/50 text-slate-100 placeholder-slate-500 text-sm"
 />
 )}
 </div>
 ))}
 </div>

 {/* Add treatment buttons */}
 <div className="flex flex-wrap gap-2">
 <button
 onClick={() => handleAddTreatmentItem('medication')}
 className="px-3 py-1 text-sm border border-slate-600/50 text-slate-300 rounded-full hover:bg-slate-700/50"
 >
 + Медикамент
 </button>
 <button
 onClick={() => handleAddTreatmentItem('procedure')}
 className="px-3 py-1 text-sm border border-slate-600/50 text-slate-300 rounded-full hover:bg-slate-700/50"
 >
 + Процедура
 </button>
 <button
 onClick={() => handleAddTreatmentItem('monitoring')}
 className="px-3 py-1 text-sm border border-slate-600/50 text-slate-300 rounded-full hover:bg-slate-700/50"
 >
 + Мониториране
 </button>
 </div>

 <button
 onClick={handleEvaluateTreatment}
 disabled={treatmentItems.length === 0 || isEvaluatingTreatment}
 className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-500 disabled:opacity-50"
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
 caseSummary.grade >= 5 ? 'bg-green-500/20 text-green-400' :
 caseSummary.grade >= 4 ? 'bg-yellow-500/20 text-yellow-400' :
 'bg-red-500/20 text-red-400'
 }`}>
 <span className="text-3xl font-bold">{caseSummary.grade}</span>
 </div>
 <h2 className="text-2xl font-bold mb-2 text-slate-100">Случаят е завършен!</h2>
 <p className="text-slate-400">
 {caseSummary.overallScore}% | {formatTime(elapsedTime)}
 </p>
 </div>

 <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 space-y-4">
 <p className="text-slate-200 text-base leading-relaxed">{String(caseSummary.summary || '')}</p>

 {caseSummary.keyLearnings.length > 0 && (
 <div>
 <h4 className="font-semibold mb-2 text-slate-100">Какво научи:</h4>
 <ul className="list-disc list-inside text-base text-slate-300 space-y-1 leading-relaxed">
 {caseSummary.keyLearnings.map((learning, i) => (
 <li key={i}>{String(learning)}</li>
 ))}
 </ul>
 </div>
 )}

 {caseSummary.areasForReview.length > 0 && (
 <div>
 <h4 className="font-semibold mb-2 text-slate-100">За преговор:</h4>
 <ul className="list-disc list-inside text-base text-slate-300 space-y-1 leading-relaxed">
 {caseSummary.areasForReview.map((area, i) => (
 <li key={i}>{String(area)}</li>
 ))}
 </ul>
 </div>
 )}

 <p className="text-blue-400 italic text-base">{String(caseSummary.encouragement || '')}</p>
 </div>

 {/* Per-step evaluations */}
 <div className="space-y-3">
 <h4 className="font-semibold text-slate-100">Оценки по стъпки:</h4>
 {activeCase.evaluations.map((evaluation, i) => (
 <div key={i} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
 <div className="flex justify-between items-center">
 <span className="font-medium text-slate-200">
 {CASE_STEPS.find(s => s.step === evaluation.step)?.name}
 </span>
 <span className={`px-2 py-1 rounded text-sm ${
 evaluation.score >= 70 ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
 }`}>
 {evaluation.score}%
 </span>
 </div>
 </div>
 ))}
 </div>

 {/* Reveal which topic it was */}
 {(() => {
 const caseSubject = data.subjects.find(s => s.id === activeCase.subjectId);
 const caseTopic = caseSubject?.topics.find(t => t.id === activeCase.topicId);
 return caseTopic && (
 <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
 <p className="text-sm text-blue-400 mb-1">Случаят беше базиран на:</p>
 <p className="font-semibold text-blue-300">{caseTopic.name}</p>
 </div>
 );
 })()}

 {/* Pharmacology topics covered */}
 {(() => {
 const treatmentEval = activeCase.evaluations.find(e => e.step === 'treatment');
 if (!treatmentEval?.pharmacologyTopics?.length) return null;
 return (
 <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4 space-y-2">
 <p className="text-sm font-semibold text-purple-400">
 <Pill className="w-4 h-4 inline mr-1.5" />
 Покрити фармакологични теми:
 </p>
 <div className="space-y-1">
 {treatmentEval.pharmacologyTopics.map(topic => (
 topic.subjectId === 'demo' ? (
 <span key={topic.id} className="block text-purple-300 text-sm">{topic.name}</span>
 ) : (
 <Link
 key={topic.id}
 href={`/subjects/${topic.subjectId}/topics/${topic.id}`}
 className="block text-purple-300 hover:text-purple-200 text-sm underline"
 >
 {topic.name} →
 </Link>
 )
 ))}
 </div>
 {treatmentEval.pharmacologyFeedback && (
 <p className="text-base text-slate-300 mt-3 leading-relaxed border-t border-purple-500/20 pt-3">
 {treatmentEval.pharmacologyFeedback}
 </p>
 )}
 </div>
 );
 })()}

 {/* Suggested Images */}
 {(() => {
 const allSuggestedImages = activeCase.evaluations
   .flatMap(e => e.suggestedImages || [])
   .filter(img => img.description);
 if (allSuggestedImages.length === 0) return null;
 return <CasesSuggestedImagesCard images={allSuggestedImages} topicId={activeCase.topicId} subjectId={activeCase.subjectId} />;
 })()}

 <div className="flex gap-3">
 <Link
 href="/cases"
 className="flex-1 py-3 bg-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-700 border border-slate-600/50 text-center"
 >
 Нов случай
 </Link>
 <Link
 href={`/subjects/${activeCase.subjectId}/topics/${activeCase.topicId}`}
 className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 text-center"
 >
 Преговори темата
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
 className="text-slate-400 hover:text-slate-200"
 >
 <ArrowLeft className="w-5 h-5" />
 </button>
 <div className="flex items-center gap-2 text-sm text-slate-400">
 <Clock className="w-4 h-4" />
 {formatTime(elapsedTime)}
 </div>
 </div>

 {/* Step progress */}
 <div className="flex items-center justify-between bg-slate-800/50 border border-slate-700/50 rounded-lg p-2">
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
 : 'bg-slate-700 text-slate-400'
 }`}>
 {isPast ? <CheckCircle className="w-4 h-4" /> : index + 1}
 </div>
 {index < CASE_STEPS.length - 1 && (
 <div className={`w-4 md:w-8 h-0.5 ${
 isPast ? 'bg-green-500' : 'bg-slate-700'
 }`} />
 )}
 </div>
 );
 })}
 </div>

 {/* Current step name */}
 <h2 className="text-xl font-semibold text-center text-slate-100">
 {CASE_STEPS.find(s => s.step === activeCase.currentStep)?.name}
 </h2>

 {/* Error display */}
 {error && (
 <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-lg flex items-center gap-2">
 <AlertCircle className="w-5 h-5" />
 {error}
 </div>
 )}

 {/* Step content */}
 {renderStepContent()}
 </div>
 );
 }

 // Filter subjects - only clinical and hybrid
 const clinicalSubjects = data.subjects.filter(s =>
    !s.archived &&
    (s.subjectType === 'clinical' || s.subjectType === 'hybrid')
 );

 // Get all topics for selected subject
 const availableTopics = subject?.topics || [];
 const topicsWithMaterial = availableTopics.filter(t => t.material && t.material.length > 200);

 // Topic selection view
 return (
 <div className="space-y-6">
 <div className="flex items-center justify-between">
 <h1 className="text-2xl font-bold flex items-center gap-2 text-slate-100">
 <Stethoscope className="w-7 h-7 text-blue-400" />
 Клинични Случаи
 </h1>
 <Link href="/" className="text-slate-400 hover:text-slate-200">
 <ArrowLeft className="w-5 h-5" />
 </Link>
 </div>

 {/* Subject selection - only clinical/hybrid */}
 <div>
 <label className="block text-sm font-medium text-slate-400 mb-2">
 Предмет
 </label>
 {clinicalSubjects.length === 0 ? (
 <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 p-4 rounded-lg">
 <p className="font-medium mb-1">Няма подходящи предмети</p>
 <p className="text-sm text-yellow-400/80">Клиничните случаи са достъпни само за клинични и хибридни предмети. Отиди в Предмети и промени типа на предмета.</p>
 </div>
 ) : (
 <select
 value={selectedSubjectId || ''}
 onChange={(e) => {
 setSelectedSubjectId(e.target.value || null);
 setSelectedTopicId(null);
 }}
 className="w-full px-4 py-2 border border-slate-600 rounded-lg bg-slate-800/50 text-slate-100"
 >
 <option value="">Избери предмет...</option>
 {clinicalSubjects.map(s => (
 <option key={s.id} value={s.id}>
 {s.name} ({s.subjectType === 'clinical' ? 'Клиничен' : 'Хибриден'})
 </option>
 ))}
 </select>
 )}
 </div>

 {/* Show available topics count */}
 {selectedSubjectId && subject && (
 <div className={`p-4 rounded-lg border ${
 availableTopics.length > 0
 ? topicsWithMaterial.length > 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-amber-500/10 border-amber-500/30'
 : 'bg-yellow-500/10 border-yellow-500/30'
 }`}>
 {availableTopics.length > 0 ? (
 topicsWithMaterial.length > 0 ? (
 <p className="text-green-400">
 <CheckCircle className="w-4 h-4 inline mr-2" />
 {topicsWithMaterial.length} теми с материал, {availableTopics.length - topicsWithMaterial.length > 0 ? `${availableTopics.length - topicsWithMaterial.length} без материал (общи знания)` : 'всички с материал'}.
 </p>
 ) : (
 <p className="text-amber-300">
 <AlertCircle className="w-4 h-4 inline mr-2" />
 {availableTopics.length} теми без материал. Случаят ще е базиран на общи медицински знания.
 </p>
 )
 ) : (
 <p className="text-yellow-400">
 <AlertCircle className="w-4 h-4 inline mr-2" />
 Няма теми в този предмет.
 </p>
 )}
 </div>
 )}

 {/* Difficulty selection */}
 {selectedSubjectId && subject && availableTopics.length > 0 && (
 <div>
 <label className="block text-sm font-medium text-slate-400 mb-2">
 Трудност
 </label>
 <div className="grid grid-cols-3 gap-3">
 {(['beginner', 'intermediate', 'advanced'] as CaseDifficulty[]).map(d => (
 <button
 key={d}
 onClick={() => setDifficulty(d)}
 className={`p-3 rounded-lg border text-center transition-all ${
 difficulty === d
 ? 'border-blue-500 bg-blue-500/15 text-blue-300'
 : 'border-slate-600/50 hover:border-slate-500 text-slate-300'
 }`}
 >
 <div className="font-medium">
 {d === 'beginner' ? 'Начинаещ' : d === 'intermediate' ? 'Среден' : 'Напреднал'}
 </div>
 <div className="text-xs text-slate-500 mt-1">
 {d === 'beginner' ? 'Ясна презентация' : d === 'intermediate' ? 'Умерена сложност' : 'Комплексен случай'}
 </div>
 </button>
 ))}
 </div>
 </div>
 )}

 {/* Error display */}
 {error && (
 <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-lg flex items-center gap-2">
 <AlertCircle className="w-5 h-5" />
 {error}
 </div>
 )}

 {/* API key warning */}
 {!apiKey && (
 <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 p-3 rounded-lg">
 Нямаш конфигуриран Claude API ключ. Отиди в Settings за да го добавиш.
 </div>
 )}

 {/* Start button */}
 <button
 onClick={handleGenerateCase}
 disabled={!selectedSubjectId || !subject || availableTopics.length === 0 || !apiKey || isGenerating}
 className="w-full py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg font-semibold"
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

 {/* Demo button */}
 <button
 onClick={loadDemoCase}
 className="w-full py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-500 flex items-center justify-center gap-2 font-semibold"
 >
 <Stethoscope className="w-5 h-5" />
 Demo: Тествай с готов случай (без API)
 </button>

 {/* Info box */}
 <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-4 text-base text-slate-400">
 <h4 className="font-semibold mb-2 text-slate-300">Как работи:</h4>
 <ol className="list-decimal list-inside space-y-1 leading-relaxed">
 <li>AI избира случайна тема и генерира клиничен случай</li>
 <li>Събираш анамнеза чрез разговор с "пациента"</li>
 <li>Избираш какво да прегледаш и изследваш</li>
 <li>Създаваш диференциална диагноза и план за лечение</li>
 <li>Получаваш обратна връзка и научаваш коя е била темата</li>
 </ol>
 </div>
 </div>
 );
}

export default function CasesPage() {
 return (
 <Suspense fallback={
 <div className="flex items-center justify-center min-h-[400px]">
 <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
 </div>
 }>
 <CasesContent />
 </Suspense>
 );
}

// Suggested Images Card component with upload
function CasesSuggestedImagesCard({ images, topicId, subjectId }: { images: SuggestedImage[]; topicId: string; subjectId: string }) {
  const [uploadedImages, setUploadedImages] = useState<TopicImage[]>([]);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const typeLabels: Record<string, string> = {
    ecg: 'ЕКГ', anatomy: 'Анатомия', imaging: 'Образна диагн.',
    instrument: 'Инструмент', pathology: 'Патология'
  };
  const typeColors: Record<string, string> = {
    ecg: 'bg-red-500/20 text-red-300 border-red-500/30',
    anatomy: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    imaging: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    instrument: 'bg-green-500/20 text-green-300 border-green-500/30',
    pathology: 'bg-orange-500/20 text-orange-300 border-orange-500/30'
  };

  useEffect(() => {
    if (!topicId) return;
    getImagesForTopic(topicId).then(setUploadedImages);
  }, [topicId]);

  const handleUpload = async (idx: number, suggestion: SuggestedImage) => {
    const file = fileInputRefs.current[idx]?.files?.[0];
    if (!file) return;
    try {
      const data = await resizeImage(file);
      const img: TopicImage = {
        id: crypto.randomUUID(),
        topicId,
        subjectId,
        type: suggestion.type,
        description: suggestion.description,
        data,
        createdAt: new Date().toISOString()
      };
      await saveImage(img);
      setUploadedImages(prev => [...prev, img]);
    } catch (err) {
      console.error('Image upload failed:', err);
    }
    if (fileInputRefs.current[idx]) fileInputRefs.current[idx]!.value = '';
  };

  const handleDelete = async (id: string) => {
    await deleteImage(id);
    setUploadedImages(prev => prev.filter(img => img.id !== id));
  };

  return (
    <>
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
        <p className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
          <Shield className="w-4 h-4" /> Изображения за учене
        </p>
        <div className="space-y-3">
          {images.map((img, i) => {
            const matchingImages = uploadedImages.filter(u => u.type === img.type && u.description === img.description);
            return (
              <div key={i} className="bg-slate-900/30 rounded-lg p-3">
                <div className="flex items-start gap-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${typeColors[img.type] || 'bg-slate-500/20 text-slate-300 border-slate-500/30'}`}>
                    {typeLabels[img.type] || img.type}
                  </span>
                  <p className="text-slate-300 text-sm flex-1">{img.description}</p>
                  <button
                    onClick={() => fileInputRefs.current[i]?.click()}
                    className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs rounded-lg border border-amber-500/30 transition-colors flex-shrink-0 flex items-center gap-1"
                  >
                    <Camera size={12} />
                    Качи
                  </button>
                  <input
                    ref={el => { fileInputRefs.current[i] = el; }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={() => handleUpload(i, img)}
                  />
                </div>
                {matchingImages.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {matchingImages.map(uploaded => (
                      <div key={uploaded.id} className="relative group">
                        <img
                          src={uploaded.data}
                          alt={uploaded.description}
                          className="h-24 rounded-lg border border-slate-600 cursor-pointer hover:border-amber-400 transition-colors object-cover"
                          onClick={() => setZoomImage(uploaded.data)}
                        />
                        <button
                          onClick={() => handleDelete(uploaded.id)}
                          className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-amber-400/60 text-xs mt-2">Качете изображения за по-добро визуално учене.</p>
      </div>

      {zoomImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center cursor-pointer"
          onClick={() => setZoomImage(null)}
        >
          <img src={zoomImage} alt="Zoom" className="max-w-[95vw] max-h-[95vh] object-contain rounded-lg" />
          <button
            className="absolute top-4 right-4 w-10 h-10 bg-slate-800 rounded-full text-white text-xl flex items-center justify-center hover:bg-slate-700"
            onClick={() => setZoomImage(null)}
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}

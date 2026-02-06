import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

// Model configuration
const MODEL_MAP = {
  opus: { id: 'claude-opus-4-5-20251101', inputCost: 15, outputCost: 75 },
  sonnet: { id: 'claude-sonnet-4-5-20250929', inputCost: 3, outputCost: 15 },
  haiku: { id: 'claude-haiku-4-5-20251001', inputCost: 0.8, outputCost: 4 }
};

// Subject type prompts for case generation
const SUBJECT_TYPE_CASE_PROMPTS: Record<string, string> = {
  preclinical: `Създай случай, който демонстрира патофизиологичните механизми.
Фокусирай се върху: как симптомите произтичат от нарушените механизми,
лабораторни находки, които отразяват основните процеси.`,

  clinical: `Създай реалистичен клиничен случай с типична презентация.
Фокусирай се върху: анамнеза, физикален преглед, диагностичен процес,
диференциална диагноза, лечение.`,

  hybrid: `Създай случай, който свързва теорията с клиничната практика.
Покажи как патофизиологията се проявява клинично и как
познаването на механизмите помага в диагностиката и лечението.`
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { apiKey, mode } = body;

    if (!apiKey) {
      return NextResponse.json({ error: 'Липсва API ключ' }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey });

    switch (mode) {
      case 'generate_case':
        return handleGenerateCase(anthropic, body);
      case 'patient_response':
        return handlePatientResponse(anthropic, body);
      case 'reveal_exam':
        return handleRevealExam(anthropic, body);
      case 'process_investigation':
        return handleProcessInvestigation(anthropic, body);
      case 'evaluate_ddx':
        return handleEvaluateDdx(anthropic, body);
      case 'evaluate_diagnosis':
        return handleEvaluateDiagnosis(anthropic, body);
      case 'evaluate_treatment':
        return handleEvaluateTreatment(anthropic, body);
      case 'get_case_summary':
        return handleCaseSummary(anthropic, body);
      default:
        return NextResponse.json({ error: 'Невалиден режим' }, { status: 400 });
    }
  } catch (error: unknown) {
    console.error('Cases API error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('invalid_api_key')) {
      return NextResponse.json({ error: 'Невалиден API ключ' }, { status: 401 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Generate a new clinical case from material
async function handleGenerateCase(anthropic: Anthropic, body: {
  material: string;
  topicName: string;
  subjectName: string;
  subjectType?: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  pharmacologyTopics?: Array<{ id: string; name: string; subjectId: string }>;
}) {
  const { material, topicName, subjectName, subjectType, difficulty, pharmacologyTopics } = body;

  if (!material || material.length < 200) {
    return NextResponse.json({
      error: 'Материалът е твърде кратък за генериране на случай (мин. 200 символа)'
    }, { status: 400 });
  }

  const subjectTypePrompt = subjectType && SUBJECT_TYPE_CASE_PROMPTS[subjectType]
    ? SUBJECT_TYPE_CASE_PROMPTS[subjectType]
    : SUBJECT_TYPE_CASE_PROMPTS.clinical;

  const difficultyPrompt = {
    beginner: `BEGINNER: Прост случай с ясна презентация.
- Типични симптоми без усложнения
- Очевидна диагноза при правилен подход
- Стандартно лечение`,
    intermediate: `INTERMEDIATE: Случай със средна сложност.
- Някои атипични елементи
- 2-3 реалистични диференциални диагнози
- Може да има усложняващи фактори`,
    advanced: `ADVANCED: Сложен случай за напреднали.
- Атипична или комплексна презентация
- Множество диференциални диагнози
- Коморбидности или усложнения
- Изисква клинично мислене на високо ниво`
  }[difficulty];

  const response = await anthropic.messages.create({
    model: MODEL_MAP.opus.id,
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `Ти си медицински преподавател, който създава интерактивен клиничен случай за български студент по медицина.

Предмет: ${subjectName}
Тема: ${topicName}

${subjectTypePrompt}

${difficultyPrompt}

Учебен материал:
"""
${material.substring(0, 4000)}
"""

Създай реалистичен клиничен случай БАЗИРАН на този материал.
Случаят трябва да тества разбирането на ключовите концепции от материала.
${pharmacologyTopics && pharmacologyTopics.length > 0 ? `
ФАРМАКОЛОГИЯ: Студентът учи и фармакология. Избери 2-5 теми от списъка, РЕЛЕВАНТНИ за лечението на случая:
${pharmacologyTopics.map(t => `- "${t.name}" (id: "${t.id}", subjectId: "${t.subjectId}")`).join('\n')}
Включи ги в "relevantPharmacologyTopicIds" и "relevantPharmacologyTopicNames" в JSON-а.
Лечебният план трябва да включва лекарства, покрити от тези теми.
` : ''}
Върни САМО валиден JSON:
{
  "presentation": {
    "age": <число 18-85>,
    "gender": "male" или "female",
    "chiefComplaint": "основно оплакване на пациента (1-2 изречения)",
    "briefHistory": "кратка история на настоящото заболяване (2-3 изречения)"
  },
  "hiddenData": {
    "actualDiagnosis": "правилната диагноза",
    "keyHistoryFindings": [
      "важна находка от анамнезата 1",
      "важна находка от анамнезата 2",
      "важна находка от анамнезата 3"
    ],
    "keyExamFindings": {
      "general": { "finding": "общ статус описание", "isNormal": true/false, "isRelevant": true/false },
      "cardiovascular": { "finding": "сърдечносъдов статус", "isNormal": true/false, "isRelevant": true/false },
      "respiratory": { "finding": "дихателен статус", "isNormal": true/false, "isRelevant": true/false },
      "abdominal": { "finding": "коремен статус", "isNormal": true/false, "isRelevant": true/false },
      "neurological": { "finding": "неврологичен статус", "isNormal": true/false, "isRelevant": true/false }
    },
    "expectedInvestigations": ["изследване1", "изследване2", "изследване3"],
    "differentialDiagnoses": ["диагноза1 (най-вероятна)", "диагноза2", "диагноза3", "диагноза4"],
    "treatmentPlan": [
      { "category": "medication", "description": "лекарство", "dosage": "доза", "priority": "immediate" },
      { "category": "monitoring", "description": "мониториране", "priority": "short_term" }
    ]${pharmacologyTopics && pharmacologyTopics.length > 0 ? `,
    "relevantPharmacologyTopicIds": ["id на избрана тема 1", "id на избрана тема 2"],
    "relevantPharmacologyTopicNames": ["име на избрана тема 1", "име на избрана тема 2"]` : ''}
  },
  "specialty": "специалност (напр. Кардиология, Пулмология)",
  "difficulty": "${difficulty}"
}

ВАЖНО:
- Случаят трябва да е на БЪЛГАРСКИ
- Да бъде реалистичен и клинично достоверен
- Да тества концепции от предоставения материал
- hiddenData съдържа информация, която ще се разкрива постепенно`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return NextResponse.json({ error: 'Няма отговор от Claude' }, { status: 500 });
  }

  let responseText = textContent.text.trim();
  responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  let caseData;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    caseData = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
  } catch {
    return NextResponse.json({
      error: 'Грешка при парсване на случая',
      raw: responseText.substring(0, 500)
    }, { status: 500 });
  }

  const cost = (response.usage.input_tokens * MODEL_MAP.opus.inputCost +
                response.usage.output_tokens * MODEL_MAP.opus.outputCost) / 1000000;

  return NextResponse.json({
    case: caseData,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Math.round(cost * 10000) / 10000
    }
  });
}

// Handle patient response during history taking
async function handlePatientResponse(anthropic: Anthropic, body: {
  caseContext: string;
  conversationHistory: Array<{ role: string; content: string }>;
  studentQuestion: string;
  presentation: { age: number; gender: string; chiefComplaint: string };
}) {
  const { caseContext, conversationHistory, studentQuestion, presentation } = body;

  const historyText = conversationHistory
    .map(m => `${m.role === 'student' ? 'Студент' : 'Пациент'}: ${m.content}`)
    .join('\n');

  const genderWord = presentation.gender === 'male' ? 'мъж' : 'жена';

  const response = await anthropic.messages.create({
    model: MODEL_MAP.haiku.id, // Fast and cheap for chat
    max_tokens: 500,
    messages: [{
      role: 'user',
      content: `Ти си пациент в медицинска симулация. Играй ролята убедително.

ТВОИТЕ ДАННИ (СКРИТИ от студента - използвай ги за да отговаряш):
${caseContext}

Ти си ${presentation.age}-годишен ${genderWord} с оплакване: "${presentation.chiefComplaint}"

Досегашен разговор:
${historyText || '(начало на разговора)'}

Студентът пита: "${studentQuestion}"

Отговори като ПАЦИЕНТ:
- Давай реалистични, понякога неясни отговори (както истински пациент)
- Споменавай релевантни симптоми САМО ако бъдеш питан правилно
- НЕ предлагай информация, която не е поискана
- Показвай емоции (тревога, болка, объркване) където е уместно
- Ако питат за нещо, което не е в случая, кажи че нямаш този симптом

Отговори с 1-3 изречения на БЪЛГАРСКИ. Бъди естествен, не медицински.`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  const patientResponse = textContent?.type === 'text' ? textContent.text.trim() : '';

  const cost = (response.usage.input_tokens * MODEL_MAP.haiku.inputCost +
                response.usage.output_tokens * MODEL_MAP.haiku.outputCost) / 1000000;

  return NextResponse.json({
    response: patientResponse,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Math.round(cost * 1000000) / 1000000
    }
  });
}

// Reveal physical exam findings
async function handleRevealExam(anthropic: Anthropic, body: {
  selectedSystems: string[];
  hiddenFindings: Record<string, { finding: string; isNormal: boolean; isRelevant: boolean }>;
  presentation: { age: number; gender: string };
}) {
  const { selectedSystems, hiddenFindings, presentation } = body;

  // Build findings for selected systems
  const findings: Array<{ system: string; finding: string; isNormal: boolean; isRelevant: boolean }> = [];

  for (const system of selectedSystems) {
    if (hiddenFindings[system]) {
      findings.push({
        system,
        ...hiddenFindings[system]
      });
    } else {
      // Generate a normal finding for systems not in hiddenFindings
      findings.push({
        system,
        finding: 'Без патологични отклонения',
        isNormal: true,
        isRelevant: false
      });
    }
  }

  // Use Haiku for formatting (quick and cheap)
  const response = await anthropic.messages.create({
    model: MODEL_MAP.haiku.id,
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `Форматирай тези находки от физикален преглед за ${presentation.age}-годишен пациент.

Находки:
${findings.map(f => `${f.system}: ${f.finding} (${f.isNormal ? 'норма' : 'патология'})`).join('\n')}

Представи ги професионално на български, като медицински доклад.
Включи витални показатели ако е избран "general".
Отговори кратко и ясно.`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  const formattedFindings = textContent?.type === 'text' ? textContent.text.trim() : '';

  const cost = (response.usage.input_tokens * MODEL_MAP.haiku.inputCost +
                response.usage.output_tokens * MODEL_MAP.haiku.outputCost) / 1000000;

  return NextResponse.json({
    findings,
    formattedFindings,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Math.round(cost * 1000000) / 1000000
    }
  });
}

// Process investigation order
async function handleProcessInvestigation(anthropic: Anthropic, body: {
  investigation: { name: string; justification: string };
  caseContext: string;
  presentation: { chiefComplaint: string };
  actualDiagnosis: string;
}) {
  const { investigation, caseContext, presentation, actualDiagnosis } = body;

  const response = await anthropic.messages.create({
    model: MODEL_MAP.sonnet.id,
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `Ти си лаборатория/образен център, която генерира резултати от изследване.

Случай: ${presentation.chiefComplaint}
Диагноза (скрита): ${actualDiagnosis}

Контекст на случая:
${caseContext}

Студентът назначи: ${investigation.name}
Обосновка на студента: "${investigation.justification}"

Генерирай РЕАЛИСТИЧЕН резултат, който:
- Съответства на диагнозата на пациента
- Е клинично достоверен

Върни САМО валиден JSON:
{
  "result": "Детайлен резултат на български (стойности, описание)",
  "isAppropriate": true/false,
  "feedback": "Кратка обратна връзка за избора на изследване",
  "interpretation": "Какво показва този резултат"
}

Бъди реалистичен - не всеки резултат трябва да е патологичен.`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return NextResponse.json({ error: 'Няма отговор' }, { status: 500 });
  }

  let responseText = textContent.text.trim();
  responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  let result;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    result = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
  } catch {
    result = {
      result: responseText,
      isAppropriate: true,
      feedback: '',
      interpretation: ''
    };
  }

  const cost = (response.usage.input_tokens * MODEL_MAP.sonnet.inputCost +
                response.usage.output_tokens * MODEL_MAP.sonnet.outputCost) / 1000000;

  return NextResponse.json({
    ...result,
    investigationName: investigation.name,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Math.round(cost * 10000) / 10000
    }
  });
}

// Evaluate differential diagnosis
async function handleEvaluateDdx(anthropic: Anthropic, body: {
  studentDdx: Array<{ diagnosis: string; rank: number }>;
  correctDdx: string[];
  actualDiagnosis: string;
  caseContext: string;
}) {
  const { studentDdx, correctDdx, actualDiagnosis, caseContext } = body;

  const studentDdxText = studentDdx
    .sort((a, b) => a.rank - b.rank)
    .map((d, i) => `${i + 1}. ${d.diagnosis}`)
    .join('\n');

  const response = await anthropic.messages.create({
    model: MODEL_MAP.sonnet.id,
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `Оцени диференциалната диагноза на студент.

Контекст на случая:
${caseContext}

Правилна диагноза: ${actualDiagnosis}
Очаквана DDx (подредена): ${correctDdx.join(', ')}

DDx на студента:
${studentDdxText}

Оцени:
1. Включена ли е правилната диагноза?
2. На подходящо място ли е в ранкирането?
3. Включени ли са други разумни диференциални диагнози?
4. Качество на клиничното мислене

Върни САМО валиден JSON:
{
  "score": <0-100>,
  "correctDiagnosisIncluded": true/false,
  "correctDiagnosisRank": <number или null>,
  "feedback": "Подробна обратна връзка на български",
  "strengths": ["силна страна 1", "силна страна 2"],
  "areasToImprove": ["област за подобрение 1"],
  "missedDiagnoses": ["пропусната важна диагноза"]
}`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return NextResponse.json({ error: 'Няма отговор' }, { status: 500 });
  }

  let responseText = textContent.text.trim();
  responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  let evaluation;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    evaluation = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
  } catch {
    return NextResponse.json({ error: 'Грешка при оценка', raw: responseText.substring(0, 300) }, { status: 500 });
  }

  const cost = (response.usage.input_tokens * MODEL_MAP.sonnet.inputCost +
                response.usage.output_tokens * MODEL_MAP.sonnet.outputCost) / 1000000;

  return NextResponse.json({
    evaluation,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Math.round(cost * 10000) / 10000
    }
  });
}

// Evaluate final diagnosis
async function handleEvaluateDiagnosis(anthropic: Anthropic, body: {
  studentDiagnosis: string;
  actualDiagnosis: string;
  studentDdx: Array<{ diagnosis: string; rank: number }>;
  caseContext: string;
}) {
  const { studentDiagnosis, actualDiagnosis, studentDdx, caseContext } = body;

  const response = await anthropic.messages.create({
    model: MODEL_MAP.sonnet.id,
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `Оцени финалната диагноза на студент.

Контекст: ${caseContext}

Правилна диагноза: ${actualDiagnosis}
Студентът избра: ${studentDiagnosis}
DDx на студента: ${studentDdx.map(d => d.diagnosis).join(', ')}

Върни САМО валиден JSON:
{
  "score": <0-100>,
  "isCorrect": true/false,
  "feedback": "Обратна връзка на български защо е вярно/грешно",
  "learningPoints": ["какво научаваме от този случай"],
  "explanation": "Защо правилната диагноза е ${actualDiagnosis}"
}`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return NextResponse.json({ error: 'Няма отговор' }, { status: 500 });
  }

  let responseText = textContent.text.trim();
  responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  let evaluation;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    evaluation = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
  } catch {
    return NextResponse.json({ error: 'Грешка при оценка' }, { status: 500 });
  }

  const cost = (response.usage.input_tokens * MODEL_MAP.sonnet.inputCost +
                response.usage.output_tokens * MODEL_MAP.sonnet.outputCost) / 1000000;

  return NextResponse.json({
    evaluation,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Math.round(cost * 10000) / 10000
    }
  });
}

// Evaluate treatment plan
async function handleEvaluateTreatment(anthropic: Anthropic, body: {
  studentTreatment: Array<{ category: string; description: string; dosage?: string; priority: string }>;
  expectedTreatment: Array<{ category: string; description: string; dosage?: string; priority: string }>;
  actualDiagnosis: string;
  caseContext: string;
  pharmacologyMaterial?: string;
  pharmacologyTopicNames?: string[];
}) {
  const { studentTreatment, expectedTreatment, actualDiagnosis, caseContext, pharmacologyMaterial, pharmacologyTopicNames } = body;

  const studentPlanText = studentTreatment
    .map(t => `- [${t.priority}] ${t.category}: ${t.description}${t.dosage ? ` (${t.dosage})` : ''}`)
    .join('\n');

  const expectedPlanText = expectedTreatment
    .map(t => `- [${t.priority}] ${t.category}: ${t.description}${t.dosage ? ` (${t.dosage})` : ''}`)
    .join('\n');

  const hasPharmacology = pharmacologyMaterial && pharmacologyMaterial.length > 50;

  const pharmacologySection = hasPharmacology ? `

ФАРМАКОЛОГИЧЕН МАТЕРИАЛ от курса на студента:
"""
${pharmacologyMaterial}
"""

Релевантни фармакологични теми: ${pharmacologyTopicNames?.join(', ') || 'N/A'}

Освен стандартната оценка, ЗАДЪЛЖИТЕЛНО оцени фармакологичните знания на студента:
6. Механизъм на действие - правилен ли е изборът на лекарства спрямо патофизиологията?
7. Дозировка и начин на приложение - съвпадат ли с учебния материал?
8. Лекарствени взаимодействия - има ли потенциални проблеми?
9. Контраиндикации - пропуснати ли са важни контраиндикации?
10. Фармакокинетика - уместен ли е изборът спрямо клиничната ситуация?` : '';

  const pharmacologyJsonFields = hasPharmacology
    ? `"pharmacologyFeedback": "Подробна оценка на фармакологичните знания, базирана на учебния материал - механизми, взаимодействия, контраиндикации",
  "pharmacologyScore": <0-100>,`
    : '';

  const response = await anthropic.messages.create({
    model: MODEL_MAP.opus.id,
    max_tokens: hasPharmacology ? 2000 : 1200,
    messages: [{
      role: 'user',
      content: `Оцени план за лечение на студент.

Диагноза: ${actualDiagnosis}
Контекст: ${caseContext}

Очаквано лечение:
${expectedPlanText}

План на студента:
${studentPlanText}
${pharmacologySection}

Оцени:
1. Правилни ли са медикаментите/интервенциите?
2. Подходящи ли са дозите (ако са посочени)?
3. Правилна ли е приоритизацията?
4. Пропуснати ли са важни елементи?
5. Има ли опасни пропуски?

Върни САМО валиден JSON:
{
  "score": <0-100>,
  "feedback": "Подробна обратна връзка на български",
  "strengths": ["силна страна 1"],
  "areasToImprove": ["област за подобрение 1"],
  "missedElements": ["пропуснат елемент"],
  "safetyIssues": ["проблем с безопасността"] или [],
  "suggestions": "Как да подобри плана",
  ${pharmacologyJsonFields}
}`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return NextResponse.json({ error: 'Няма отговор' }, { status: 500 });
  }

  let responseText = textContent.text.trim();
  responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  let evaluation;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    evaluation = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
  } catch {
    return NextResponse.json({ error: 'Грешка при оценка' }, { status: 500 });
  }

  const cost = (response.usage.input_tokens * MODEL_MAP.opus.inputCost +
                response.usage.output_tokens * MODEL_MAP.opus.outputCost) / 1000000;

  return NextResponse.json({
    evaluation,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Math.round(cost * 10000) / 10000
    }
  });
}

// Generate final case summary
async function handleCaseSummary(anthropic: Anthropic, body: {
  caseData: {
    presentation: { age: number; gender: string; chiefComplaint: string };
    actualDiagnosis: string;
    specialty: string;
  };
  evaluations: Array<{ step: string; score: number; feedback: string }>;
  timeSpentMinutes: number;
}) {
  const { caseData, evaluations, timeSpentMinutes } = body;

  const evaluationsText = evaluations
    .map(e => `${e.step}: ${e.score}% - ${e.feedback}`)
    .join('\n');

  const avgScore = evaluations.length > 0
    ? Math.round(evaluations.reduce((sum, e) => sum + e.score, 0) / evaluations.length)
    : 0;

  const response = await anthropic.messages.create({
    model: MODEL_MAP.opus.id,
    max_tokens: 1500,
    messages: [{
      role: 'user',
      content: `Създай финално обобщение на клиничен случай.

Случай: ${caseData.presentation.age}г. ${caseData.presentation.gender === 'male' ? 'мъж' : 'жена'} с ${caseData.presentation.chiefComplaint}
Диагноза: ${caseData.actualDiagnosis}
Специалност: ${caseData.specialty}
Време: ${timeSpentMinutes} минути

Оценки по стъпки:
${evaluationsText}

Средна оценка: ${avgScore}%

Създай мотивиращо и образователно обобщение на български:

Върни САМО валиден JSON:
{
  "overallScore": ${avgScore},
  "grade": <2-6 по българската система>,
  "summary": "Кратко обобщение на представянето",
  "keyLearnings": ["какво научи студентът 1", "какво научи 2", "какво научи 3"],
  "areasForReview": ["област за преговор 1"],
  "encouragement": "Мотивиращо съобщение",
  "nextSteps": "Препоръки за следващи стъпки в обучението"
}`
    }]
  });

  const textContent = response.content.find(c => c.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    return NextResponse.json({ error: 'Няма отговор' }, { status: 500 });
  }

  let responseText = textContent.text.trim();
  responseText = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

  let summary;
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    summary = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
  } catch {
    summary = {
      overallScore: avgScore,
      grade: avgScore >= 90 ? 6 : avgScore >= 75 ? 5 : avgScore >= 60 ? 4 : avgScore >= 40 ? 3 : 2,
      summary: 'Случаят е завършен.',
      keyLearnings: [],
      areasForReview: [],
      encouragement: 'Добра работа!',
      nextSteps: 'Продължавай да практикуваш.'
    };
  }

  const cost = (response.usage.input_tokens * MODEL_MAP.opus.inputCost +
                response.usage.output_tokens * MODEL_MAP.opus.outputCost) / 1000000;

  return NextResponse.json({
    summary,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cost: Math.round(cost * 10000) / 10000
    }
  });
}

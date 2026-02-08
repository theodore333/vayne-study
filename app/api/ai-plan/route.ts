import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';

// Types for request data
interface QuizHistoryItem {
  score: number;
  date: string;
  bloomLevel?: number;
}

interface RequestTopic {
  id: string;
  number: number;
  name: string;
  status: 'gray' | 'orange' | 'yellow' | 'green';
  avgGrade: number | null;
  quizHistory?: QuizHistoryItem[];
  quizCount: number;
  lastReview: string | null;
  size: 'small' | 'medium' | 'large' | null;
  material?: string;
  materialImages?: string[];
}

interface RequestSubject {
  id: string;
  name: string;
  color: string;
  subjectType: string;
  examDate: string | null;
  examFormat: string | null;
  topics: RequestTopic[];
}

interface ScheduleClass {
  id: string;
  subjectId: string;
  day: number;
  time: string;
  type: string;
}

interface GeneratedTask {
  subjectId: string;
  subjectName: string;
  subjectColor: string;
  type: 'setup' | 'critical' | 'high' | 'medium' | 'normal';
  typeLabel: string;
  description: string;
  topicIds: string[];
  estimatedMinutes: number;
}

export async function POST(request: NextRequest) {
  try {
    const { subjects, schedule, dailyStatus, apiKey, studyGoals, bonusMode, studyTechniques } = await request.json() as {
      subjects: RequestSubject[];
      schedule: ScheduleClass[];
      dailyStatus: { sick?: boolean; holiday?: boolean };
      apiKey: string;
      studyGoals?: { dailyMinutes?: number; weekendDailyMinutes?: number; vacationMode?: boolean; vacationMultiplier?: number };
      bonusMode?: 'tomorrow' | 'review' | 'weak';
      studyTechniques?: Array<{ name: string; slug: string; practiceCount: number; lastPracticedAt: string | null; howToApply: string }>;
    };

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API ключ е задължителен. Добави го в Settings.' },
        { status: 400 }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDay = (tomorrow.getDay() + 6) % 7; // Convert to Mon=0
    const todayStr = today.toISOString().split('T')[0];
    const isWeekend = today.getDay() === 0 || today.getDay() === 6;

    // Calculate daily capacity
    const userDailyGoalMinutes = studyGoals?.dailyMinutes || 480;
    const userWeekendGoalMinutes = studyGoals?.weekendDailyMinutes || userDailyGoalMinutes;
    let dailyMinutes = isWeekend ? userWeekendGoalMinutes : userDailyGoalMinutes;

    // Adjust for vacation mode
    const isVacationMode = studyGoals?.vacationMode === true;
    // Ensure minimum multiplier of 0.1 to prevent 0 capacity
    const vacationMultiplier = Math.max(0.1, studyGoals?.vacationMultiplier ?? 0.4);
    if (isVacationMode) {
      dailyMinutes = Math.round(dailyMinutes * vacationMultiplier);
    }

    // Adjust for sick/holiday
    if (dailyStatus?.sick || dailyStatus?.holiday) {
      dailyMinutes = Math.round(dailyMinutes * 0.5);
    }

    // Roughly 20-30 minutes per topic, but cap at reasonable maximum
    const rawCapacity = Math.round(dailyMinutes / 25);
    const MAX_TOPICS_PER_DAY = 12; // Hard limit for reasonable daily workload
    const dailyTopicCapacity = Math.min(rawCapacity, MAX_TOPICS_PER_DAY);

    // Check for exercises tomorrow
    const tomorrowExercises = schedule.filter(
      c => c.day === tomorrowDay && c.type === 'exercise'
    );

    // Build detailed subject data for the prompt
    const subjectData = subjects.map(s => {
      const totalTopics = s.topics.length;
      const greenTopics = s.topics.filter(t => t.status === 'green').length;
      const yellowTopics = s.topics.filter(t => t.status === 'yellow').length;
      const orangeTopics = s.topics.filter(t => t.status === 'orange').length;
      const grayTopics = s.topics.filter(t => t.status === 'gray').length;

      // Calculate setup completeness
      const hasTopics = totalTopics > 0;
      const hasExamDate = s.examDate !== null;
      const topicsWithMaterial = s.topics.filter(t =>
        (t.material && t.material.trim().length > 0) ||
        (t.materialImages && t.materialImages.length > 0)
      ).length;
      const topicsWithQuizzes = s.topics.filter(t =>
        t.quizCount > 0 || (t.quizHistory && t.quizHistory.length > 0)
      ).length;
      const hasMaterial = topicsWithMaterial > 0;
      const hasQuizzes = topicsWithQuizzes > 0;

      // Setup status for AI to consider
      const setupStatus = {
        hasTopics,
        hasExamDate,
        hasMaterial,
        hasQuizzes,
        materialCoverage: totalTopics > 0 ? Math.round((topicsWithMaterial / totalTopics) * 100) : 0,
        quizCoverage: totalTopics > 0 ? Math.round((topicsWithQuizzes / totalTopics) * 100) : 0,
        isReadyForStudy: hasTopics && hasExamDate && (hasMaterial || hasQuizzes),
        missingSetup: [] as string[]
      };

      // Build list of missing setup items
      if (!hasTopics) setupStatus.missingSetup.push('НЯМА ТЕМИ/КОНСПЕКТ');
      if (!hasExamDate) setupStatus.missingSetup.push('НЯМА ДАТА НА ИЗПИТ');
      if (!hasMaterial) setupStatus.missingSetup.push('НЯМА ВКАРАН МАТЕРИАЛ');
      if (!hasQuizzes) setupStatus.missingSetup.push('НЕ Е ПРАВЕН ТЕСТ');

      let daysUntilExam = null;
      if (s.examDate) {
        const examDate = new Date(s.examDate);
        daysUntilExam = Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      }

      // Find topics that need review (haven't been reviewed recently)
      const topicsNeedingReview = s.topics.filter(t => {
        if (t.status === 'gray') return false;
        if (!t.lastReview) return true;
        const daysSince = Math.floor((today.getTime() - new Date(t.lastReview).getTime()) / (1000 * 60 * 60 * 24));
        // Adaptive threshold based on mastery
        const grade = t.avgGrade ? ((t.avgGrade - 2) / 4) * 100 : 0;
        const threshold = grade >= 95 ? 21 : grade >= 85 ? 16 : grade >= 70 ? 12 : grade >= 50 ? 8 : 5;
        return daysSince >= threshold;
      });

      return {
        id: s.id,
        name: s.name,
        color: s.color,
        subjectType: s.subjectType,
        examDate: s.examDate,
        examFormat: s.examFormat,
        daysUntilExam,
        totalTopics,
        greenTopics,
        yellowTopics,
        orangeTopics,
        grayTopics,
        setupStatus, // NEW: setup completeness info
        topicsNeedingReview: topicsNeedingReview.length,
        hasExerciseTomorrow: tomorrowExercises.some(e => e.subjectId === s.id),
        topics: s.topics.map(t => ({
          id: t.id,
          number: t.number,
          name: t.name.substring(0, 50), // Truncate for prompt efficiency
          status: t.status,
          avgGrade: t.avgGrade,
          lastReview: t.lastReview,
          size: t.size,
          hasMaterial: (t.material && t.material.trim().length > 0) || (t.materialImages && t.materialImages.length > 0),
          hasQuiz: t.quizCount > 0,
          needsReview: topicsNeedingReview.some(r => r.id === t.id)
        }))
      };
    });

    // Check if any subjects need setup
    const subjectsNeedingSetup = subjectData.filter(s => !s.setupStatus.isReadyForStudy);
    const hasSetupTasks = subjectsNeedingSetup.length > 0;

    // Bonus mode specific instructions
    let bonusModeInstructions = '';
    if (bonusMode === 'tomorrow') {
      bonusModeInstructions = `
🎯 БОНУС РЕЖИМ: УТРЕШЕН МАТЕРИАЛ
Студентът вече завърши дневния си план и иска да започне напред!

СПЕЦИАЛНИ ПРАВИЛА:
- Фокусирай се САМО върху СИВИ (непокрити) теми
- Избирай теми които логически следват от днешния материал
- Предпочитай теми от предмети с по-близки изпити
- Приоритизирай теми с добавен материал (hasMaterial: true)
- План за 3-5 теми максимум (бонус сесия, не пълен ден)
- Тип на задачите: "normal" (нов материал)
`;
    } else if (bonusMode === 'review') {
      bonusModeInstructions = `
🎯 БОНУС РЕЖИМ: ЕКСТРА ПРЕГОВОР
Студентът иска да затвърди наученото!

СПЕЦИАЛНИ ПРАВИЛА:
- Фокусирай се върху ЖЪЛТИ и ЗЕЛЕНИ теми (вече научени)
- Предпочитай теми с needsReview: true или по-стари lastReview
- Избягвай сиви теми (нов материал)
- Приоритизирай теми с по-ниски avgGrade стойности
- План за 4-6 теми максимум (бонус сесия)
- Тип на задачите: "medium" (преговор)
`;
    } else if (bonusMode === 'weak') {
      bonusModeInstructions = `
🎯 БОНУС РЕЖИМ: СЛАБИ ТЕМИ
Студентът иска да работи върху проблемни области!

СПЕЦИАЛНИ ПРАВИЛА:
- Фокусирай се върху ОРАНЖЕВИ теми (слаби познания)
- Включи и жълти теми с нисък avgGrade (под 4.0)
- Избягвай зелени теми (вече усвоени)
- Предпочитай теми с материал за ефективно учене
- План за 3-5 теми максимум (интензивна работа)
- Тип на задачите: "high" (приоритетна работа върху слабости)
`;
    }

    // Build the prompt
    const prompt = `Ти си експертен AI планировчик за медицински студент. Твоята задача е да генерираш ОПТИМАЛЕН ${bonusMode ? 'БОНУС' : 'дневен'} план за учене.

ДАТА: ${todayStr} (${isWeekend ? 'уикенд' : 'делник'})
КАПАЦИТЕТ: ${dailyTopicCapacity} теми (${dailyMinutes} минути общо)
${isVacationMode ? `РЕЖИМ: 🏖️ ВАКАНЦИЯ - намален workload до ${Math.round(vacationMultiplier * 100)}%! Фокус върху поддръжка и лек преговор.` : ''}
${dailyStatus?.sick ? 'СТАТУС: Болен - намален капацитет!' : dailyStatus?.holiday ? 'СТАТУС: Почивка - намален капацитет!' : ''}
${bonusModeInstructions}
${hasSetupTasks && !bonusMode ? `⚠️ ВАЖНО: НЯКОИ ПРЕДМЕТИ ИМАТ НЕПЪЛНА ИНФОРМАЦИЯ!
Предмети нуждаещи се от setup: ${subjectsNeedingSetup.map(s => `${s.name} (${s.setupStatus.missingSetup.join(', ')})`).join('; ')}

ПРЕДИ ДА ГЕНЕРИРАШ ПЛАН ЗА УЧЕНЕ, трябва да дадеш SETUP TASKS за непълните предмети!
` : ''}

ПРЕДМЕТИ И ТЕМИ:
${JSON.stringify(subjectData, null, 2)}

ПРАВИЛА ЗА ПРИОРИТИЗАЦИЯ (спазвай стриктно!):

${hasSetupTasks && !bonusMode ? `0. SETUP TASKS (НАЙ-ВИСОК ПРИОРИТЕТ! type: "setup"):
   - За предмети с setupStatus.isReadyForStudy = false
   - НЕ включвай теми (topicIds: []) - това са административни задачи
   - Примери:
     * "📋 Добави конспект" ако няма теми
     * "📅 Задай дата на изпит" ако няма examDate
     * "📝 Вкарай материал" ако няма материал (hasMaterial: false)
     * "🧪 Направи първи тест" ако няма quizzes (hasQuizzes: false)
   - estimatedMinutes: 15-30 мин за setup tasks
   - ВАЖНО: НЕ ПЛАНИРАЙ УЧЕНЕ за предмети без пълен setup!

` : ''}${bonusMode ? `
(Следвай СПЕЦИАЛНИТЕ ПРАВИЛА от бонус режима по-горе!)
` : `1. КРИТИЧНИ (type: "critical"):
   - Упражнение утре → теми от този предмет ЗАДЪЛЖИТЕЛНО първи
   - Изпит до 3 дни → максимален фокус
   - САМО за предмети с setupStatus.isReadyForStudy = true!

2. ВИСОКИ (type: "high"):
   - Изпит 4-7 дни → интензивна подготовка

3. СРЕДНИ (type: "medium"):
   - Теми в риск от забравяне (needsReview: true)
   - Изпит 8-14 дни

4. НОРМАЛНИ (type: "normal"):
   - Нов материал (сиви теми) - МИНИМУМ 25% от плана!
   - Общо развитие`}

ВАЖНИ ПРАВИЛА:
- ⚠️ КРИТИЧНО: ОБЩО МАКСИМУМ ${bonusMode ? '5' : dailyTopicCapacity} ТЕМИ ЗА ЦЕЛИЯ ПЛАН! Не повече!
- Максимум ${bonusMode ? '2-3' : '4-5'} задачи общо (групирай добре)
${hasSetupTasks && !bonusMode ? '- ⚠️ SETUP TASKS ПЪРВО! Не планирай учене за непълни предмети!' : ''}
${!bonusMode ? '- ЗАДЪЛЖИТЕЛНО включи поне 25% сиви теми (нов материал) за да има прогрес!' : ''}
- Групирай свързани теми по предмет (2-4 теми на задача максимум)
- Приоритизирай теми С материал (hasMaterial: true) - те са по-ефективни за учене
${!bonusMode ? `- Ако има много жълти теми - те са БЪРЗ преговор, не пълно учене
- Оранжеви теми имат само основи - нужна е работа
- Малки теми (size: "small") дават бързи победи` : ''}
- Не претоварвай - ${bonusMode ? 'това е БОНУС сесия!' : 'студентът трябва реално да свърши плана!'}
${studyTechniques && studyTechniques.length > 0 ? `
УЧЕБНИ ТЕХНИКИ (IcanStudy):
Студентът практикува следните техники: ${studyTechniques.map(t => `${t.name} (${t.practiceCount}x практикувана${t.lastPracticedAt ? ', последно: ' + new Date(t.lastPracticedAt).toLocaleDateString('bg-BG') : ''})`).join(', ')}
${(() => { const stale = studyTechniques.filter(t => { if (!t.lastPracticedAt) return true; return Math.floor((today.getTime() - new Date(t.lastPracticedAt).getTime()) / 86400000) >= 3; }); return stale.length > 0 ? `Непрактикувани >3 дни: ${stale.map(t => t.name).join(', ')}` : ''; })()}
В описанието на задачите, ПРЕДЛОЖИ конкретна техника за прилагане (напр. "Приложи Chunking - групирай концепциите" или "Interleaving - смесвай с вчерашния материал").
` : ''}
ФОРМАТ НА ОТГОВОР (САМО валиден JSON, без markdown):
{
  "tasks": [
    {
      "subjectId": "id на предмета",
      "subjectName": "име на предмета",
      "subjectColor": "цвят",
      "type": "setup|critical|high|medium|normal",
      "typeLabel": "кратък етикет с emoji (напр. '📝 Изпит след 3 дни' или '📋 Setup')",
      "description": "кратко описание какво да се направи",
      "topicIds": ["id1", "id2", "..."],
      "estimatedMinutes": число
    }
  ],
  "reasoning": "кратко обяснение защо този план е оптимален (1-2 изречения)"
}

Генерирай САМО JSON без допълнителен текст!`;

    const message = await anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = message.content.find(block => block.type === 'text');
    const responseText = textContent ? textContent.text : '';

    // Parse the JSON response
    let parsedResponse: { tasks: GeneratedTask[]; reasoning?: string };
    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', responseText);
      return NextResponse.json(
        { error: 'AI генерира невалиден отговор. Опитай отново.' },
        { status: 500 }
      );
    }

    // Convert to DailyTask format with full topic data
    // Also enforce hard limit on total topics
    let totalTopicsUsed = 0;
    const dailyTasks = [];

    for (let index = 0; index < parsedResponse.tasks.length; index++) {
      const task = parsedResponse.tasks[index];
      const subject = subjects.find(s => s.id === task.subjectId);

      // Handle setup tasks (no topics required)
      if (task.type === 'setup') {
        dailyTasks.push({
          id: `ai-task-${Date.now()}-${index}`,
          subjectId: task.subjectId,
          subjectName: task.subjectName,
          subjectColor: task.subjectColor,
          type: task.type,
          typeLabel: task.typeLabel + ' (AI)',
          description: task.description,
          topics: [], // Setup tasks have no topics
          estimatedMinutes: task.estimatedMinutes || 20,
          completed: false
        });
        continue;
      }

      // Get topics but respect the hard limit
      const remainingCapacity = MAX_TOPICS_PER_DAY - totalTopicsUsed;
      if (remainingCapacity <= 0) break; // Stop if we've hit the limit

      let topics = task.topicIds
        .map(id => subject?.topics.find(t => t.id === id))
        .filter((t): t is RequestTopic => t !== undefined);

      // Truncate topics if needed
      if (topics.length > remainingCapacity) {
        topics = topics.slice(0, remainingCapacity);
      }

      if (topics.length === 0) continue; // Skip empty study tasks

      totalTopicsUsed += topics.length;

      dailyTasks.push({
        id: `ai-task-${Date.now()}-${index}`,
        subjectId: task.subjectId,
        subjectName: task.subjectName,
        subjectColor: task.subjectColor,
        type: task.type,
        typeLabel: task.typeLabel + ' (AI)',
        description: task.description,
        topics: topics,
        estimatedMinutes: task.estimatedMinutes || topics.length * 20,
        completed: false
      });
    }

    // Calculate cost (Opus pricing)
    const inputTokens = message.usage.input_tokens;
    const outputTokens = message.usage.output_tokens;
    const cost = (inputTokens * 0.015 + outputTokens * 0.075) / 1000;

    return NextResponse.json({
      tasks: dailyTasks,
      reasoning: parsedResponse.reasoning || '',
      cost
    });

  } catch (error) {
    console.error('AI plan error:', error);

    let errorMessage = 'Грешка при генериране на план';
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('authentication')) {
        errorMessage = 'Невалиден API ключ. Провери го в Settings.';
      } else if (error.message.includes('429') || error.message.includes('rate')) {
        errorMessage = 'Rate limit - опитай пак след малко.';
      } else {
        errorMessage = `Грешка: ${error.message}`;
      }
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

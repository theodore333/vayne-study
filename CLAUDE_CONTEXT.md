# Vayne Study - Project Context for Claude

**Last Updated:** January 29, 2026
**Project:** Study Command Center for Medical Students (MU Sofia)
**Stack:** Next.js 16, React, TypeScript, TailwindCSS, Anthropic API

---

## Quick Start Prompt (Copy this to start next session)

```
Прочети файла C:\Users\User\vayne-study\CLAUDE_CONTEXT.md за контекст на проекта.

Имплементирано е:
- FSRS spaced repetition (lib/algorithms.ts)
- 4-tier daily plan (Critical → High → New Material → FSRS)
- Bonus AI plan при 100% completion

Следващи стъпки от PLANNED_FEATURES.md:
- Topic Size classification (small/medium/large)
- Topic Relations (clustering)
- Crunch Mode за time pressure
```

---

## Project Overview

Vayne Study е учебно приложение за медицински студенти с функции за:
- **Subjects & Topics** - Управление на предмети и теми с цветен статус (gray/orange/yellow/green)
- **Timer** - Pomodoro таймер + свободен режим с статистики
- **Quiz** - AI-генерирани тестове с Bloom's Taxonomy levels
- **Question Bank** - Извличане на въпроси от PDF документи
- **AI Advice** - Персонализирани съвети базирани на прогрес
- **Prediction** - Monte Carlo симулация за изпитни резултати
- **GPA Calculator** - Калкулатор за среден успех

---

## Key Files

### Core
- `lib/types.ts` - TypeScript типове (Subject, Topic, AppData, etc.)
- `lib/context.tsx` - React context за state management
- `lib/storage.ts` - localStorage с lz-string compression
- `lib/algorithms.ts` - Decay, weighted workload, priority calculations, FSRS, daily plan generation
- `lib/constants.ts` - Storage keys, defaults

### Pages
- `app/today/page.tsx` - Daily dashboard с AI advice
- `app/timer/page.tsx` - Pomodoro + свободен таймер
- `app/subjects/page.tsx` - Subjects list
- `app/quiz/page.tsx` - Quiz interface
- `app/prediction/page.tsx` - Exam prediction с Monte Carlo

### API Routes
- `app/api/quiz/route.ts` - Quiz generation (Opus 4.5)
- `app/api/ai-advice/route.ts` - AI study coach (Sonnet 4.5)
- `app/api/extract-material/route.ts` - PDF extraction
- `app/api/extract-questions/route.ts` - Question bank extraction

---

## Current Systems

### Weighted Workload (Implemented)
```typescript
const STATUS_WEIGHTS = {
  gray: 1.0,    // Не съм пипал - пълно учене
  orange: 0.75, // Минимални основи
  yellow: 0.35, // Знам добре - само преговор
  green: 0      // Готово
};
```

### Compression (Implemented)
- Main data: `vayne-data` key (compressed if beneficial)
- Materials: `vayne-materials` key (always compressed)
- Uses lz-string library

### Pomodoro (Fixed January 2026)
- Browser notifications on completion
- Visibility change detection for background tabs
- Pending completion state for missed pomodoros
- State persistence in localStorage

---

## Planned Features (in PLANNED_FEATURES.md)

### 1. Session Mode - Priority: HIGH
Автоматичен планировчик за изпитна сесия. Не е имплементиран още.

### 2. Smart Scheduling & Prioritization - Priority: HIGH (NEXT TO IMPLEMENT)

**Topic Size Classification:**
- `small` | `medium` | `large` per topic
- AI assigns on material import, manual override
- Used for crunch mode prioritization

**Topic Relations (Clustering):**
- `relatedTopics: string[]` - linked topics
- `cluster: string | null` - group name (e.g., "Пулмология")
- `prerequisites: string[]` - dependencies
- Batch analysis button for subject

**Crunch Mode:**
```typescript
const isCrunchMode = (
  workloadPerDay > 5 ||
  (daysUntilExam < 7 && workloadPerDay > 3)
);

// Size bonus for gray topics in crunch mode
const sizeBonus = { small: 3, medium: 1, large: 0 };
```

**Data Model Additions:**
```typescript
interface Topic {
  // ... existing fields
  size: 'small' | 'medium' | 'large' | null;
  sizeSetBy: 'ai' | 'user' | null;
  relatedTopics: string[];
  cluster: string | null;
  prerequisites: string[];
}
```

---

## Model IDs

| Model | ID | Use Case |
|-------|-----|----------|
| **Opus 4.5** | `claude-opus-4-5-20251101` | Complex reasoning, quiz generation |
| **Sonnet 4.5** | `claude-sonnet-4-5-20250929` | PDF extraction, balanced tasks |
| **Haiku 4.5** | `claude-haiku-4-5-20251001` | Fast/cheap tasks, hints |

**Usage in project:**
- `/api/extract` - Sonnet 4.5 (PDF extraction)
- `/api/quiz` - Opus 4.5 (quiz generation), Haiku 4.5 (hints)
- `/api/test-key` - Haiku 4.5 (API key validation)

**Deprecated (do not use):** `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`, `claude-opus-4-20250514`, `claude-sonnet-4-20250514`

---

## Recent Changes (January 2026)

1. **lz-string compression** - Separate materials storage, compressed
2. **Pomodoro fixes** - Background tab support, notifications
3. **Smart Scheduling plan** - Documented in PLANNED_FEATURES.md
4. **Weighted workload** - AI advice uses status weights
5. **FSRS implementation** - Spaced repetition for topics with Anki-like settings
6. **Daily plan tiers** - 4-tier priority (Critical → High → New Material → FSRS)
7. **Task persistence** - Daily plan completion state persists in localStorage
8. **Bonus AI plan** - Option to generate extra plan after 100% completion

---

## Build & Deploy

```bash
cd C:\Users\User\vayne-study
npm run build
npx vercel --prod
```

Git:
```bash
git add -A
git commit -m "message"
git push origin master
```

---

## FSRS Spaced Repetition System (January 2026)

### Overview
FSRS (Free Spaced Repetition Scheduler) - модерен алгоритъм от Anki 23+, адаптиран за теми (вместо flashcards).

### Core Algorithm
```typescript
// Forgetting curve: R(t) = e^(-t/S)
// R = retrievability (probability of recall)
// S = stability (how long memory lasts in days)
// t = time since last review

interface FSRSState {
  stability: number;       // S - days until 90% forgetting
  difficulty: number;      // D - inherent topic difficulty (0.1-1.0)
  lastReview: string;      // ISO date of last review
  reps: number;            // successful review count
  lapses: number;          // times forgotten (score < 60%)
}
```

### Key Functions (lib/algorithms.ts)
- `calculateRetrievability(fsrs)` - Current memory strength (0-100%)
- `getDaysUntilReview(fsrs, targetRetention)` - Days until review needed
- `topicNeedsReview(fsrs, goals)` - Boolean check against user settings
- `initializeFSRS(score)` - Create initial state from first quiz
- `updateFSRS(fsrs, score)` - Update state after quiz
- `getTopicsNeedingFSRSReview(subjects, goals)` - Get all topics needing review

### Anti-Review-Hell Protections
1. **Topic multiplier 1.5x** - Longer intervals than flashcards (topics are larger units)
2. **Max reviews per day** - Default 8, user configurable (3-20)
3. **Max interval cap** - Default 180 days, user configurable (30-365)
4. **Minimum stability** - 0.5 days floor

### User Settings (app/settings/page.tsx)
```typescript
// In StudyGoals type:
fsrsEnabled?: boolean;           // Toggle on/off (default: true)
fsrsTargetRetention?: number;    // 0.70-0.95 (default: 0.85 = 85%)
fsrsMaxReviewsPerDay?: number;   // 3-20 (default: 8)
fsrsMaxInterval?: number;        // 30-365 days (default: 180)
```

### Integration Points
1. **Quiz completion** (lib/context.tsx) - Updates FSRS state
2. **Topic page** - Shows memory indicator (%, stability, days until review)
3. **Daily plan** - Includes FSRS reviews as Tier 4

---

## Daily Plan Priority System (January 2026)

### 5-Tier Priority Order
```
Tier 1: CRITICAL (urgentExercises)
  - Упражнения утре → трябва да се подготвя

Tier 2: HIGH (highPriority)
  - Изпит след 4-7 дни, тема gray/orange

Tier 3: FSRS REVIEWS
  - Теми, нуждаещи се от преговор по FSRS
  - Поддържа дългосрочна памет

Tier 4: NEW MATERIAL
  - Нов материал (gray теми), динамична квота

Tier 5: LEGACY DECAY
  - Теми без FSRS state (стари теми)
```

### Dynamic New Material Quota
```typescript
// Base quota: 25% of daily tasks
// Increases based on:
// - grayPercentage > 60% → 45%
// - grayPercentage > 40% && exam < 14 days → 50%
// - grayPercentage > 40% → 40%
// - exam < 7 days && grayPercentage > 20% → 40%
// - Otherwise → 30%
```

### Rationale
- **New material before FSRS** - Covering syllabus is priority
- **FSRS still runs** - Just lower priority than new topics
- **Dynamic quota** - More new material when behind schedule

---

## Notes for Claude

- Проектът е на **български** - UI текстове са на български
- User е медицински студент в МУ София
- Фокус на **простота** - не over-engineer
- Винаги прочети файла преди да го редактираш
- Тествай с `npm run build` преди commit
- Използвай PowerShell за Windows команди

---

## VAYNE OS Integration (January 2026)

Study sessions can sync to VAYNE OS for unified XP tracking.

### Files Created
- `lib/vayne-os-sync.ts` - Client-side sync functions
- `app/api/vayne-sync/route.ts` - Server-side proxy (keeps API key secure)

### Environment Variables
```bash
# Add to .env.local
VAYNE_OS_API_URL=https://vayne-os-production.up.railway.app
VAYNE_OS_SYNC_KEY=<same as STUDY_SYNC_API_KEY in VAYNE OS>
VAYNE_OS_USER_ID=26f7e2f7-131c-409c-9612-e85fbb524641
```

### How to Use
Import and call sync functions in context.tsx or timer/page.tsx:

```typescript
import { syncStudySession, syncTopicProgress, syncQuizResult } from '@/lib/vayne-os-sync';

// After session completes:
await syncStudySession({
  id: session.id,
  subjectId: subject.id,
  subjectName: subject.name,
  topicId: topic?.id,
  topicName: topic?.name,
  duration: durationMinutes,
  pomodorosCompleted: count,
  rating: userRating,
  sessionType: 'pomodoro'
});

// After topic goes green:
await syncTopicProgress({
  topicId: topic.id,
  topicName: topic.name,
  subjectName: subject.name,
  newStatus: 'green',
  previousStatus: 'yellow'
});
```

### Sync Types
- `session` - Study session completed → Activity log + XP
- `topic_progress` - Topic mastered (green) → 50 XP
- `quiz` - Quiz completed → 15-30 XP based on score
- `exam_date` - Exam date set → Creates goal in VAYNE OS

### TODO
- [ ] Add sync calls to context.tsx (stopTimerWithNote, addPomodoroSession)
- [ ] Add sync call to setTopicStatus when going green
- [ ] Add sync call to quiz completion
- [ ] Test end-to-end sync

---

*Този файл се update-ва при значими промени в проекта.*

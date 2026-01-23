# Vayne Study - Project Context for Claude

**Last Updated:** January 2026
**Project:** Study Command Center for Medical Students (MU Sofia)
**Stack:** Next.js 16, React, TypeScript, TailwindCSS, Anthropic API

---

## Quick Start Prompt (Copy this to start next session)

```
Прочети файла C:\Users\User\vayne-study\CLAUDE_CONTEXT.md за контекст на проекта.

След това искам да имплементираме Smart Scheduling feature от PLANNED_FEATURES.md:
- Topic Size classification (small/medium/large)
- Topic Relations (clustering)
- Crunch Mode за time pressure

Прочети PLANNED_FEATURES.md секция "Smart Scheduling & Prioritization" за детайлите.
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
- `lib/algorithms.ts` - Decay, weighted workload, priority calculations
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

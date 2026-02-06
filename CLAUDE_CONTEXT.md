# Vayne Study - Project Context for Claude

**Last Updated:** February 5, 2026
**Project:** Study Command Center for Medical Students (MU Sofia)
**Stack:** Next.js 16, React, TypeScript, TailwindCSS, Anthropic API

---

## Quick Start Prompt

```
Прочети CLAUDE_CONTEXT.md за пълен контекст.
Всички основни features са имплементирани. Фокус: polish и подобрения.
```

---

## Feature Map (Existing Pages)

| Страница | Път | Описание |
|----------|-----|----------|
| **Табло** | `/` | Dashboard с 10+ widgets |
| **Предмети** | `/subjects` | CRUD за предмети и теми |
| **Тема детайл** | `/subjects/[id]/topics/[id]` | Материал, quiz, статус |
| **Днешен план** | `/today` | AI daily plan, Crunch Mode |
| **График** | `/schedule` | Седмично разписание, Academic Events |
| **Таймер** | `/timer` | Pomodoro + свободен режим |
| **Quiz** | `/quiz` | 7 quiz режима, Bloom levels |
| **Сборници** | `/question-bank` | Импорт въпроси от PDF |
| **Клинични случаи** | `/cases` | 7-step case simulation |
| **Прогноза** | `/prediction` | Monte Carlo за изпити |
| **GPA** | `/gpa` | Калкулатор среден успех |
| **Статистики** | `/analytics` | Charts, streaks, progress |
| **Проекти** | `/projects` | Development projects (Vayne Doctor) |
| **Настройки** | `/settings` | API key, FSRS settings, goals |

---

## Dashboard Widgets (February 2026)

Всички имплементирани в `components/dashboard/`:

| Widget | Файл | Описание |
|--------|------|----------|
| Study Streak | `StudyStreakWidget.tsx` | Flame animation, current/record |
| Weekly Bar Chart | `WeeklyBarChart.tsx` | 7-day study time |
| Goal Progress Rings | `GoalProgressRings.tsx` | Daily/weekly/monthly SVG rings |
| Continue Study | `ContinueStudyWidget.tsx` | Last opened topic link |
| Quick Actions | `QuickActionsRow.tsx` | Pomodoro + Quiz buttons |
| Academic Events | `AcademicEventsWidget.tsx` | Upcoming colloquiums/tests |
| Subject Health | `SubjectHealthIndicator.tsx` | Warning/critical subjects |
| Exam Readiness | `ExamReadinessWidget.tsx` | Countdown + readiness % |
| Daily Goals | `DailyGoalsChecklist.tsx` | Editable daily checklist |

---

## Implemented Systems

### Topic Size Classification
```typescript
size: 'small' | 'medium' | 'large' | null;
sizeSetBy: 'ai' | 'user' | null;
```
- AI assigns on material import
- Manual override in topic detail
- Used in Crunch Mode prioritization

### Crunch Mode (lib/algorithms.ts)
```typescript
detectCrunchMode(subjects): CrunchModeStatus
// Activates when:
// - workloadPerDay > 5 topics
// - OR exam < 7 days AND workload > 3 topics
// Shows tips, prioritizes small topics
```

### FSRS Spaced Repetition
```typescript
interface FSRSState {
  stability: number;      // Days until 90% forgetting
  difficulty: number;     // 0.1-1.0
  lastReview: string;
  reps: number;
  lapses: number;
}
```
- `calculateRetrievability(fsrs)` - Current memory %
- `getDaysUntilReview(fsrs)` - Days until review needed
- Settings: targetRetention, maxReviewsPerDay, maxInterval

### Daily Plan Priority (5 Tiers)
1. CRITICAL - Exercises tomorrow
2. HIGH - Exam < 7 days, gray/orange topics
3. FSRS REVIEWS - Topics needing review
4. NEW MATERIAL - Gray topics (dynamic quota 25-50%)
5. LEGACY DECAY - Topics without FSRS

### Academic Events
```typescript
type AcademicEventType = 'colloquium' | 'control_test' | 'practical_exam' | 'final_exam' | 'presentation' | 'other';
```
- Stored in `data.academicEvents`
- Managed in `/schedule` page
- Shown in dashboard widget

### Daily Goals
```typescript
interface DailyGoal {
  id: string;
  text: string;
  completed: boolean;
  date: string;
  type: 'daily' | 'weekly';
}
```
- `addDailyGoal()`, `toggleDailyGoal()`, `deleteDailyGoal()`
- Persisted in context

---

## Key Files

### Core
- `lib/types.ts` - All TypeScript types (~350 lines)
- `lib/context.tsx` - React context, all state operations
- `lib/storage.ts` - localStorage + lz-string compression
- `lib/algorithms.ts` - FSRS, decay, daily plan, crunch mode (~1800 lines)
- `lib/constants.ts` - Colors, configs, defaults

### Important Pages
- `app/page.tsx` - Dashboard with all widgets
- `app/subjects/page.tsx` - Subject/topic management, bulk edit
- `app/today/page.tsx` - Daily plan, crunch mode indicator
- `app/quiz/page.tsx` - 7 quiz modes (~3000 lines)
- `app/timer/page.tsx` - Pomodoro + floating widget

### API Routes
- `/api/quiz` - Quiz generation (Opus 4.5)
- `/api/ai-advice` - Study coach (Sonnet 4.5)
- `/api/extract-material` - PDF/image extraction
- `/api/extract-syllabus` - OCR for syllabus import
- `/api/cases` - Clinical case simulation

---

## Model IDs

| Model | ID | Use Case |
|-------|-----|----------|
| Opus 4.5 | `claude-opus-4-5-20251101` | Quiz, complex reasoning |
| Sonnet 4.5 | `claude-sonnet-4-5-20250929` | PDF extraction, advice |
| Haiku 4.5 | `claude-haiku-4-5-20251001` | Hints, fast tasks |

---

## Recent Changes (February 2026)

1. **10 Dashboard Widgets** - Full implementation with safety guards
2. **Inline Topic Editing** - Click title to edit in subjects/topic pages
3. **Delete Topic Button** - Trash icon in subjects list
4. **Sidebar Reorder** - Планиране moved to 2nd position
5. **Academic Events Widget** - Shows upcoming tests/exams
6. **Subject Health Indicator** - Warning for at-risk subjects
7. **Daily Goals Checklist** - Persistent todo list
8. **Continue Study Widget** - Links to last opened topic
9. **Storage Migration** - Added lastOpenedTopic, dailyGoals defaults

---

## UI Patterns

### Card Style
```css
bg-[rgba(20,20,35,0.8)] border border-[#1e293b] rounded-xl
```

### Colors
- Cyan: Primary actions, links
- Purple: Quiz, AI features
- Orange: Warnings, streak
- Red: Critical, delete
- Green: Success, mastery

### Icons
- lucide-react, size 16-20
- Always with text labels on buttons

---

## Build & Deploy

```bash
npm run build          # Verify before commit
git push origin master # Auto-deploys to Railway
```

---

## Notes for Claude

- UI е на **български**
- Фокус на **простота** - не over-engineer
- Винаги прочети файла преди edit
- Тествай с `npm run build`
- Safety checks за null/undefined в widgets
- Deploy е на Railway (vayne-study-production.up.railway.app)

---

*Последна актуализация: 5 Февруари 2026*

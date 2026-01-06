# VAYNE Study Command Center - Features Documentation

## Overview
VAYNE е лично приложение за учене, създадено за студент по медицина в МУ София.
Целта е да помага с организация на учебния материал, tracking на прогреса и AI-базирани тестове.

---

## Core Features

### 1. Subjects Management (`/subjects`)
- Създаване на предмети с цвят и дата на изпит
- **Формат на изпит** - описание как изглежда изпита (напр. "20 теста, 2 казуса")
- Импорт на теми:
  - **AI Import** - от PDF/снимка чрез Claude Haiku (OCR)
  - **Ръчен import** - copy-paste списък
- Редактиране и изтриване на теми
- Търсене и филтриране по статус

### 2. Topic Status System (Color-Coded)
Статусите показват представянето по темата:

| Статус | Цвят | Условие | Описание |
|--------|------|---------|----------|
| Gray   | Сиво | Няма quiz данни | Не е учена |
| Orange | Оранжево | avgGrade < 3.5 | Слабо представяне |
| Yellow | Жълто | avgGrade 3.5-4.5 | Средно представяне |
| Green  | Зелено | avgGrade >= 4.5 | Отлично представяне |

Функцията `gradeToStatus()` в `lib/algorithms.ts` конвертира оценка в статус.

### 3. AI Quiz System (`/quiz`)
- Генериране на тестове от материал чрез **Claude Opus**
- Типове въпроси:
  - Multiple choice
  - Open questions
  - Case studies (клинични сценарии)
- **Bloom's Taxonomy** - 6 нива на познание:
  1. Запомняне (Remember)
  2. Разбиране (Understand)
  3. Прилагане (Apply)
  4. Анализиране (Analyze)
  5. Оценяване (Evaluate)
  6. Създаване (Create)

#### Quiz Modes (5 режима)

| Mode | Описание | Bloom Levels |
|------|----------|--------------|
| **Assess My Level** | AI определя нивото ти | 1-6 (всички) |
| **Free Recall** | Пиши → AI оценява | N/A |
| **Mid-Order** | Прилагане и анализ | 3-4 |
| **Higher-Order** | Оценяване и създаване | 5-6 |
| **Gap Analysis** | Открива слаби места | Mixed |
| **Custom** | Ръчен override | Избор |

#### AI Recommendation System
AI автоматично препоръчва КОЙ РЕЖИМ да ползваш:
- **Първи тест** → Assess My Level
- **< 3 дни до изпит** → Gap Analysis
- **Bloom 5-6** → Higher-Order
- **Bloom 3-4** → Mid-Order
- **< 14 дни до изпит** → Free Recall
- **Default** → Assess My Level

AI препоръчва режим в banner отгоре и автоматично го избира.

#### Match Exam Format
Checkbox опция - когато е включена, AI генерира въпроси в точния формат на изпита (напр. "20 теста, 2 казуса").

#### Free Recall Mode
- Пиши всичко, което помниш по темата
- AI оценява покритие и точност
- **Hints** - до 3 подсказки на сесия (anti-abuse)
- Използва Haiku за hints (по-евтино), Opus за оценка
- Връща: score, grade, covered concepts, missing concepts

#### Gap Analysis Mode
- Анализира quiz history за слаби места
- AI генерира стратегически въпроси за проверка
- Връща: critical concepts, weak area predictions, study recommendations

#### Intelligent Question Count
**AI ВИНАГИ решава** колко въпроса да генерира:
- Базирано на complexity и breadth на материала
- Може да е 5 за прости теми или 20+ за комплексни
- Само в Custom mode може ръчно да се зададе брой

- Progress tracking - при >=75% score се преминава на следващо Bloom ниво
- Assessment tracking - quiz history записва всички резултати

### 4. Timer (`/timer`)
- Pomodoro-style таймер за учене
- Tracking на сесии по предмет/тема
- Rating на сесията след приключване

### 5. GPA Calculator (`/gpa`)
- Въвеждане на оценки по семестри
- Изчисляване на среден успех
- Target GPA tracking

### 6. Schedule (`/schedule`)
- Седмичен график на занятия
- Добавяне на упражнения по предмети

### 7. Today's Plan (`/today`)
- AI-генериран дневен план за учене
- Приоритизиране спрямо изпити и статус на теми

### 8. Prediction (`/prediction`)
- Прогноза за оценка базирана на:
  - Текущ прогрес по теми
  - Дни до изпит
  - Sleep/energy status

### 9. Settings (`/settings`)
- Claude API key management
- Тест на API key
- **Usage tracking:**
  - Дневни API calls
  - Месечни разходи
  - Бюджет лимит с предупреждение
- Информация за AI модели и цени

---

## Technical Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **UI:** Custom components, Lucide icons
- **State:** React Context
- **Storage:**
  - localStorage (instant)
  - Vercel Redis (cloud sync)
- **AI:** Anthropic Claude API
  - Haiku - OCR, извличане на теми
  - Opus - Quiz generation, анализ

---

## Data Types (lib/types.ts)

### Subject
```typescript
{
  id: string;
  name: string;
  color: string;
  examDate: string | null;
  examFormat: string | null;  // NEW: формат на изпит
  topics: Topic[];
  createdAt: string;
}
```

### Topic
```typescript
{
  id: string;
  number: number;
  name: string;
  status: TopicStatus;  // 'gray' | 'orange' | 'yellow' | 'green'
  lastReview: string | null;
  grades: number[];
  avgGrade: number | null;
  quizCount: number;
  material: string;
  materialImages: string[];
  currentBloomLevel: BloomLevel;  // NEW: 1-6
  quizHistory: QuizResult[];  // NEW: история на тестове
}
```

### BloomLevel
```typescript
type BloomLevel = 1 | 2 | 3 | 4 | 5 | 6;
```

### QuizResult
```typescript
{
  date: string;
  bloomLevel: BloomLevel;
  score: number;  // 0-100
  questionsCount: number;
  correctAnswers: number;
}
```

---

## API Endpoints

| Endpoint | Method | Purpose | Model |
|----------|--------|---------|-------|
| `/api/extract` | POST | OCR от PDF/снимка | Haiku |
| `/api/quiz` | POST | Генериране на тест | Opus |
| `/api/test-key` | POST | Валидиране на API key | Haiku |
| `/api/data` | GET/POST | Cloud sync с Redis | - |

---

## Cost Estimation

### Claude Haiku (Extract)
- $0.25 / 1M input tokens
- $1.25 / 1M output tokens
- Използва се за: OCR, извличане на теми

### Claude Opus (Quiz)
- $15 / 1M input tokens
- $75 / 1M output tokens
- Използва се за: Quiz generation, AI анализ

### Cost Warning
При големи файлове (>5MB или >10000 tokens) се показва предупреждение с очакваната цена преди extraction.

---

## Recent Updates

### Session 3 (Jan 2025)
- **5 Quiz Modes** - Assess My Level, Free Recall, Mid-Order, Higher-Order, Gap Analysis, Custom
- **AI Recommendation System** - AI препоръчва КОЙ РЕЖИМ да ползваш (banner)
- **Match Exam Format** - checkbox за генериране във формат на изпит
- **Mid-Order Quiz** - Bloom 3-4 (Apply, Analyze)
- **Higher-Order Quiz** - Bloom 5-6 (Evaluate, Create)
- **Free Recall Mode** - свободно изписване с AI оценка
- **Hint System** - до 3 hints на сесия (anti-abuse), използва Haiku
- **Gap Analysis** - търсене на слаби места в знанията
- **NO Fixed Question Limits** - AI ВИНАГИ определя брой въпроси (освен в Custom)
- **Custom Override** - скрит по default, единственият режим с ръчен брой

### Session 2 (Jan 2025)
- Премахнати кредити от GPA (не се ползват в БГ)
- Изтрит Focus Mode
- Cloud sync с Vercel Redis
- AI Import с Claude Haiku
- Settings страница с API key
- Usage tracking с бюджет лимит
- Формат на изпит за предмети
- Bloom's Taxonomy tracking
- Quiz generation с exam format
- Cost estimation преди extraction
- Topic editing в import modal

---

## TODO / Ideas
- [x] ~~Decay система за статус~~ (имплементирано в algorithms.ts)
- [ ] Spaced repetition препоръки
- [ ] Export на данни
- [ ] Statistics dashboard
- [ ] Mobile responsive improvements
- [ ] Notifications за изпити
- [ ] Offline mode с service worker
- [ ] Voice input за Free Recall

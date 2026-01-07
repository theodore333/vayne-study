# Planned Features - Vayne Study

## Session Mode (Режим Сесия) - Priority: HIGH

### Overview
Автоматичен планировчик за изпитна сесия. Създава детайлен calendar/timetable който разпределя всички теми по дни до всеки изпит. Студентът вижда точно какво трябва да учи всеки ден.

**Важно:** По време на сесия НЯМА лекции и упражнения. Целият ден е за учене.

---

### User Flow

1. **Активиране на Session Mode**
   - Бутон "Започни Сесия" в Today или нова страница /session
   - Избира начална и крайна дата на сесията (напр. 15 Юни - 10 Юли)
   - Системата автоматично взима всички предмети с examDate в този период

2. **Конфигурация (еднократна)**
   - Часове на ден: използва studyGoals.dailyMinutes (вече съществува)
   - Уикенд часове: използва studyGoals.weekendDailyMinutes (вече съществува)
   - Buffer дни преди изпит: 1-2 дни за преговор (default: 1)
   - Минути на тема (average): default 30-45 мин, може да се настрои

3. **Генериране на план**
   - Алгоритъмът разпределя темите автоматично
   - Показва calendar view с всеки ден
   - Warning ако планът е нереалистичен

4. **Daily View**
   - Показва темите за днес като checklist
   - Отбелязваш коя тема си минал
   - Progress bar за деня

5. **Rebalance**
   - Ако изостанеш или си болен, бутон "Преизчисли"
   - Разпределя оставащите теми по оставащите дни

---

### Data Model

```typescript
// Нов тип в types.ts
interface SessionPlan {
  id: string;
  startDate: string;           // ISO date
  endDate: string;             // ISO date
  isActive: boolean;
  bufferDays: number;          // Days before exam for review (default 1)
  minutesPerTopic: number;     // Average minutes per topic (default 40)
  createdAt: string;
  updatedAt: string;
}

interface SessionDay {
  date: string;                // ISO date (YYYY-MM-DD)
  type: 'study' | 'review' | 'exam' | 'rest';
  subjectId: string | null;    // Which subject this day is for
  subjectName: string | null;
  plannedTopics: string[];     // Topic IDs planned for this day
  completedTopics: string[];   // Topic IDs actually completed
  examId: string | null;       // If type === 'exam', which subject
  notes: string | null;
}

// В AppData добави:
interface AppData {
  // ... existing fields
  sessionPlan: SessionPlan | null;
  sessionDays: SessionDay[];
}
```

---

### Algorithm: generateSessionPlan()

```typescript
function generateSessionPlan(
  subjects: Subject[],
  sessionStart: Date,
  sessionEnd: Date,
  bufferDays: number,
  minutesPerTopic: number,
  dailyMinutes: number,
  weekendMinutes: number
): SessionDay[] {

  // 1. Събери всички изпити в периода, сортирани по дата
  const exams = subjects
    .filter(s => s.examDate && isWithinSession(s.examDate))
    .sort((a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime());

  // 2. За всеки изпит изчисли:
  //    - availableDays = дни от сега (или след предишен изпит) до examDate - bufferDays
  //    - remainingTopics = topics.filter(t => t.status !== 'green')
  //    - topicsPerDay = Math.ceil(remainingTopics.length / availableDays)

  // 3. Разпредели темите по дни:
  //    - Изчисли колко теми се събират в един ден (dailyMinutes / minutesPerTopic)
  //    - Ако topicsPerDay > maxTopicsPerDay, маркирай като WARNING
  //    - Приоритизирай: gray > orange > yellow (непокритите първо)

  // 4. Добави buffer дни преди всеки изпит (type: 'review')

  // 5. Маркирай exam days (type: 'exam')

  // 6. Return масив от SessionDay обекти

  // СПЕЦИАЛНА ЛОГИКА:
  // - Ако има 2+ изпита близо един до друг, редувай предметите
  // - Ако examFormat включва "случаен" - приоритизирай широко покритие
  // - Ако тема е "weak" (нисък quiz score) - сложи я по-рано за повече време

}
```

---

### UI Components

#### 1. Session Setup Page (/session или modal)
```
┌─────────────────────────────────────────────────────┐
│  ЗАПОЧНИ СЕСИЯ                                      │
├─────────────────────────────────────────────────────┤
│  Период: [15 Юни 2025] - [10 Юли 2025]             │
│                                                     │
│  Открити изпити:                                    │
│  ✓ Генетика - 18 Юни (65 теми, 55 оставащи)        │
│  ✓ Анатомия - 25 Юни (120 теми, 80 оставащи)       │
│  ✓ Биохимия - 5 Юли (90 теми, 90 оставащи)         │
│                                                     │
│  Настройки:                                         │
│  - Buffer дни преди изпит: [1] ден                  │
│  - Минути на тема (средно): [40] мин                │
│                                                     │
│  [ Генерирай План ]                                 │
└─────────────────────────────────────────────────────┘
```

#### 2. Session Calendar View (/session/calendar)
```
┌─────────────────────────────────────────────────────┐
│  СЕСИЯ: 15 Юни - 10 Юли          [Преизчисли план] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ЮНИ 2025                                          │
│  ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐       │
│  │ Пон │ Вто │ Сря │ Чет │ Пет │ Съб │ Нед │       │
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤       │
│  │     │     │     │     │     │ 15  │ 16  │       │
│  │     │     │     │     │     │ GEN │ GEN │       │
│  │     │     │     │     │     │ 8t  │ 8t  │       │
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤       │
│  │ 17  │ 18  │ 19  │ 20  │ 21  │ 22  │ 23  │       │
│  │ REV │ EXAM│ ANA │ ANA │ ANA │ ANA │ ANA │       │
│  │ GEN │ GEN │ 10t │ 10t │ 10t │ 6t  │ 6t  │       │
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤       │
│  │ ... │     │     │     │     │     │     │       │
│  └─────┴─────┴─────┴─────┴─────┴─────┴─────┘       │
│                                                     │
│  Легенда: GEN=Генетика, ANA=Анатомия               │
│           REV=Преговор, EXAM=Изпит, t=теми          │
│                                                     │
│  ⚠️ WARNING: Анатомия изисква 10 теми/ден          │
│     (препоръчително: max 8)                         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### 3. Daily Session View (в Today page или отделна)
```
┌─────────────────────────────────────────────────────┐
│  ДНЕС: Понеделник, 17 Юни                          │
│  Предмет: ГЕНЕТИКА (преговор преди изпит)          │
│  Изпит: УТРЕ!                                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Теми за преговор (10):                            │
│  ✓ Менделови закони                                │
│  ✓ Хромозомна теория                               │
│  ☐ Генни мутации                                   │
│  ☐ Хромозомни аберации                             │
│  ☐ Полово свързано унаследяване                    │
│  ☐ Митохондриално унаследяване                     │
│  ☐ Епигенетика                                     │
│  ☐ Генетични болести                               │
│  ☐ Популационна генетика                           │
│  ☐ Генетично консултиране                          │
│                                                     │
│  Прогрес: ████░░░░░░ 2/10 (20%)                    │
│                                                     │
│  [ Започни таймер за текуща тема ]                 │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### 4. Session Stats Panel
```
┌─────────────────────────────────────────────────────┐
│  СТАТИСТИКА НА СЕСИЯТА                             │
├─────────────────────────────────────────────────────┤
│  Общо дни: 25                                       │
│  Изминали: 3                                        │
│  Оставащи: 22                                       │
│                                                     │
│  Изпити:                                            │
│  ✓ Генетика (18 Юни) - 55/55 теми минати           │
│  → Анатомия (25 Юни) - 30/80 теми (37%)            │
│  ○ Биохимия (5 Юли) - 0/90 теми                    │
│                                                     │
│  On track: ДА / НЕ                                  │
│  Ако продължиш така: Ще свършиш на 3 Юли           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

### Integration Points

1. **Today Page**
   - Ако sessionPlan.isActive === true, показва Session Daily View вместо/до Daily Plan
   - Или добавя секция "Сесия" с темите за днес

2. **Timer**
   - Когато избереш тема от Session Daily View, автоматично стартира таймер
   - След приключване, маркира темата като completed в sessionDays

3. **AI Advice**
   - Ако е активна сесия, AI получава sessionPlan и sessionDays
   - Може да коментира: "Изоставаш с 5 теми от плана, наваксай днес"

4. **Topic Status**
   - Когато маркираш тема като completed в сесията, update-ва topic.status
   - gray → orange (минато), orange → yellow (преговорено)

5. **Floating Widget**
   - Показва: "Сесия: 3/10 теми днес | Генетика | Изпит след 2д"

---

### Edge Cases & Special Logic

1. **Нереалистичен план**
   - Ако topicsPerDay > 15, показва WARNING
   - Ако topicsPerDay > 25, показва CRITICAL и предлага да се намали обхвата

2. **Изоставане от плана**
   - Track-ва completedTopics vs plannedTopics за всеки ден
   - Ако завършиш деня с deficit, показва опция "Преизчисли план"
   - Rebalance разпределя пропуснатите теми в оставащите дни

3. **Болен ден**
   - Ако dailyStatus.sick === true, автоматично намалява plannedTopics за деня с 50%
   - Остатъкът се разпределя в следващите дни

4. **Два изпита в един ден**
   - Рядко, но възможно
   - Алгоритъмът трябва да раздели предишните дни между двата предмета

5. **Изпит без теми**
   - Ако предмет няма topics, пропусни го от плана
   - Покажи warning: "Анатомия има изпит но няма теми!"

6. **Exam Format Integration**
   - Ако examFormat включва "случаен избор" / "теглят се":
     - Приоритизирай широко покритие (повече теми, по-малко дълбочина)
     - В review дните, фокусирай се на overview вместо детайли
   - Ако examFormat включва "казуси":
     - Приоритизирай практически теми
     - Препоръчай повече време на тема за разбиране

---

### Implementation Steps (for Claude)

**Phase 1: Data Model & Storage**
1. Добави SessionPlan и SessionDay в types.ts
2. Добави sessionPlan и sessionDays в AppData (context.tsx, storage.ts)
3. Добави CRUD функции: createSessionPlan, updateSessionDay, clearSession

**Phase 2: Algorithm**
1. Създай lib/session-planner.ts
2. Имплементирай generateSessionPlan()
3. Имплементирай rebalanceSession()
4. Добави helper функции за изчисления

**Phase 3: UI - Setup**
1. Създай app/session/page.tsx
2. Session setup form с дати и настройки
3. Preview на плана преди потвърждение

**Phase 4: UI - Calendar**
1. Calendar grid component
2. Day cell component с цветове по предмет
3. Legend и warnings

**Phase 5: UI - Daily View**
1. Checklist на теми за деня
2. Progress bar
3. Quick actions (старт таймер, маркирай готово)

**Phase 6: Integration**
1. Today page - показва session info ако е активна
2. Timer - автоматично избира тема от плана
3. AI Advice - получава session context
4. Floating widget - session progress

**Phase 7: Polish**
1. Rebalance функционалност
2. Sick day handling
3. Warnings и notifications
4. Export to calendar (optional, low priority)

---

### Future Enhancements (v2)

- **Drag & drop** за ръчно преместване на теми между дни
- **Google Calendar export** - sync с външен календар
- **Spaced repetition** - автоматично schedule-ва review на минати теми
- **Difficulty rating** - потребителят може да маркира тема като "трудна" за повече време
- **Study blocks** - сутрин Предмет A, следобед Предмет B
- **Pomodoro integration** - планира брой pomodoros на тема
- **Analytics** - сравнение план vs реалност, graphs

---

### Notes

- Session Mode е OPTIONAL - студентът може да не го ползва
- Не замества Daily Plan, а го допълва/замества по време на сесия
- Фокус е на ПРОСТОТА - генерирай план, следвай го, преизчисли ако трябва
- Mobile-friendly е важно - студентите учат от телефон

---

*Документ създаден: Януари 2025*
*За имплементация: Преди лятна сесия 2025*

---
---

## Smart Scheduling & Prioritization - Priority: HIGH

### Overview

Интелигентна система за приоритизиране на теми, базирана на:
1. **Topic Size** - класификация на теми по дължина (small/medium/long)
2. **Topic Relations** - групиране на свързани теми за по-ефективно учене
3. **Crunch Mode** - автоматичен режим при time pressure, приоритизиращ кратки теми

**Ключова идея:** При изпити със случаен избор на теми, по-добре е да знаеш 10 кратки теми отколкото 3 дълги.

---

### Feature 1: Topic Size Classification

#### Когато се задава?
- **Автоматично** при import/extract на материал - AI анализира и класифицира
- **Ръчно** - потребителят може да промени ако не е съгласен с AI

#### Категории
```
small:  Кратка тема, 15-25 мин за научаване
medium: Средна тема, 30-45 мин за научаване
large:  Дълга/сложна тема, 60+ мин за научаване
```

#### AI Classification Prompt (при extract-material)
```
Анализирай материала и определи размера на темата:
- small: Малко съдържание, 1-2 основни концепции, лесно за запомняне
- medium: Умерено съдържание, 3-5 концепции, нужен е преговор
- large: Много съдържание, 6+ концепции, сложни взаимовръзки

Върни JSON: { "size": "small" | "medium" | "large" }
```

#### Data Model
```typescript
// В Topic type добави:
interface Topic {
  // ... existing fields
  size: 'small' | 'medium' | 'large' | null;  // null = не е класифицирано
  sizeSetBy: 'ai' | 'user' | null;            // кой е задал размера
}
```

#### UI
- В Topic Detail: показва badge "S" / "M" / "L" до името
- Dropdown за ръчна промяна
- При extract: показва AI suggestion с опция за override

---

### Feature 2: Topic Relations (Clustering)

#### Когато се задава?
1. **При import** - AI автоматично тагва related topics от същия предмет
2. **Batch Analysis** - бутон "Анализирай връзки" за цял предмет/конспект

#### Какво прави?
- Групира теми със споделен материал (напр. всички теми за бели дробове → "Пулмология")
- Идентифицира prerequisite връзки (Тема B изисква знание от Тема A)
- Scheduler слага свързани теми в един ден за по-бързо учене

#### Data Model
```typescript
// В Topic type добави:
interface Topic {
  // ... existing fields
  relatedTopics: string[];     // Topic IDs на свързани теми
  cluster: string | null;      // Име на групата (напр. "Пулмология")
  prerequisites: string[];     // Topic IDs които трябва да се научат първо
}

// Или отделна структура за по-сложни връзки:
interface TopicRelation {
  topicId: string;
  relatedTopicId: string;
  relationType: 'similar' | 'prerequisite' | 'same-cluster';
  strength: number;            // 0-1, колко силна е връзката
}
```

#### AI Analysis Prompt (batch)
```
Анализирай следните теми от предмет "${subjectName}":
${topicNames.join('\n')}

За всяка тема определи:
1. cluster: Група/категория (напр. "Пулмология", "Кардиология")
2. relatedTopics: Кои други теми са свързани (споделят концепции)
3. prerequisites: Кои теми трябва да се научат ПРЕДИ тази

Върни JSON масив с резултати.
```

#### UI
- В Subjects page: визуализация на clusters (grouped view)
- Topic Detail: секция "Свързани теми" с линкове
- При Batch Analysis: progress indicator + preview на резултати

#### Scheduler Integration
```
При генериране на дневен план:

1. Вземи приоритетните теми за деня
2. Групирай ги по cluster
3. Ако две теми са related И се събират в един ден:
   → Сложи ги последователно
   → Показва: "Тема X + Тема Y (свързани, учи заедно)"

Пример:
  Ден 1: Генни мутации → Хромозомни аберации (related)
  Ден 2: ДНК репарация → Генетични болести (related)

  ВМЕСТО:
  Ден 1: Генни мутации → Популационна генетика (unrelated)
```

---

### Feature 3: Crunch Mode

#### Кога се активира?

```typescript
const isCrunchMode = (
  workloadPerDay > 5  // Много работа
  ||
  (daysUntilExam < 7 && workloadPerDay > 3)  // Скоро + умерено натоварен
);
```

**Thresholds:**
- `workloadPerDay > 5 units` → CRUNCH (независимо от времето)
- `daysUntilExam < 7 AND workloadPerDay > 3 units` → CRUNCH (скоро + натоварен)

#### Какво се променя в Crunch Mode?

```typescript
// НОРМАЛЕН режим:
priority = decayScore + weightedStatus;

// CRUNCH режим (за СИВИ теми):
priority = decayScore + weightedStatus + sizeBonus;

const sizeBonus = {
  'small': 3,   // Кратките получават голям бонус
  'medium': 1,  // Средните - малък бонус
  'large': 0    // Дългите - без бонус
};

// Резултат: Кратките сиви теми изплуват нагоре в приоритета
```

#### Логика
```
При случаен изпит + малко време:
  → По-добре да покриеш 10 кратки теми
  → Отколкото да научиш 3 дълги перфектно
  → Защото шансът да изтеглиш позната тема е по-голям
```

#### UI Indicators

**Today Page (при активен Crunch Mode):**
```
┌─────────────────────────────────────────────────────┐
│ ⚡ CRUNCH MODE                                       │
│    5.2 units/ден | Изпит след 4 дни                │
│    Приоритет: кратки непокрити теми                │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Препоръчани днес:                                  │
│ 🟢 S  Тема X ────────────────────── свързана с Y   │
│ 🟢 S  Тема Y ────────────────────── свързана с X   │
│ 🟡 M  Тема Z                                        │
│ ⚪ L  Тема W ────────────────────── ако остане време│
│                                                     │
│ Стратегия: Мини първо кратките (S), после средните │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Size Badges:**
```
🟢 S = Small (кратка)
🟡 M = Medium (средна)
🔴 L = Large (дълга)
```

**AI Advice Integration:**
```
При crunch mode, AI получава:
- isCrunchMode: true
- workloadPerDay: 5.2
- topicsBySize: { small: 15, medium: 20, large: 10 }

AI може да каже:
"CRUNCH MODE: Имаш 15 кратки теми непокрити.
 Ако минеш 5 кратки днес вместо 2 дълги,
 шансът да изтеглиш позната тема се увеличава значително."
```

---

### Data Model Summary

```typescript
// Additions to Topic interface in types.ts
interface Topic {
  // ... existing fields (id, name, status, material, etc.)

  // NEW: Size classification
  size: 'small' | 'medium' | 'large' | null;
  sizeSetBy: 'ai' | 'user' | null;

  // NEW: Relations
  relatedTopics: string[];      // IDs of related topics
  cluster: string | null;       // Group name (e.g., "Пулмология")
  prerequisites: string[];      // IDs of prerequisite topics
}

// Helper type for relation analysis
interface TopicCluster {
  name: string;                 // e.g., "Пулмология"
  topicIds: string[];
  subjectId: string;
}
```

---

### Algorithm: Smart Daily Schedule

```typescript
function generateSmartDailyPlan(
  subject: Subject,
  daysUntilExam: number,
  workloadPerDay: number,
  dailyCapacity: number  // max topics per day
): Topic[] {

  const isCrunchMode = workloadPerDay > 5 || (daysUntilExam < 7 && workloadPerDay > 3);

  // 1. Get all non-green topics
  let candidates = subject.topics.filter(t => t.status !== 'green');

  // 2. Calculate priority for each
  candidates = candidates.map(topic => ({
    ...topic,
    priority: calculatePriority(topic, isCrunchMode)
  }));

  // 3. Sort by priority (highest first)
  candidates.sort((a, b) => b.priority - a.priority);

  // 4. Select topics for today (respect capacity)
  let selected: Topic[] = [];
  let remainingCapacity = dailyCapacity;

  for (const topic of candidates) {
    if (remainingCapacity <= 0) break;

    // Check if a related topic is already selected
    const hasRelatedSelected = topic.relatedTopics.some(
      relId => selected.find(s => s.id === relId)
    );

    // Boost priority if related topic already selected (keep them together)
    if (hasRelatedSelected) {
      selected.push(topic);
      remainingCapacity--;
      continue;
    }

    selected.push(topic);
    remainingCapacity--;
  }

  // 5. Sort selected by cluster (group related topics)
  selected.sort((a, b) => {
    if (a.cluster === b.cluster) return 0;
    return (a.cluster || '').localeCompare(b.cluster || '');
  });

  return selected;
}

function calculatePriority(topic: Topic, isCrunchMode: boolean): number {
  let priority = 0;

  // Base priority from status (gray = highest need)
  const statusWeight = { gray: 10, orange: 7, yellow: 3, green: 0 };
  priority += statusWeight[topic.status];

  // Decay score (older = higher priority)
  priority += topic.decayScore || 0;

  // Crunch mode: boost small topics
  if (isCrunchMode && topic.status === 'gray') {
    const sizeBonus = { small: 3, medium: 1, large: 0 };
    priority += sizeBonus[topic.size || 'medium'];
  }

  // Prerequisite penalty (if prerequisites not done, lower priority)
  const unmetPrereqs = topic.prerequisites.filter(
    preId => !isTopicComplete(preId)
  ).length;
  priority -= unmetPrereqs * 2;

  return priority;
}
```

---

### Implementation Steps

**Phase 1: Data Model**
1. Add `size`, `sizeSetBy`, `relatedTopics`, `cluster`, `prerequisites` to Topic type
2. Add migration in storage.ts for existing topics (default: null)
3. Update context.tsx with update functions

**Phase 2: Size Classification**
1. Update extract-material API to return size classification
2. Add size badge to Topic Detail page
3. Add manual size override dropdown
4. Update Topic card to show size indicator

**Phase 3: Relations & Clustering**
1. Create "Analyze Relations" API endpoint
2. Add batch analysis button to Subject page
3. Show related topics in Topic Detail
4. Add cluster grouping view option in Subjects

**Phase 4: Crunch Mode Logic**
1. Add `isCrunchMode()` helper in algorithms.ts
2. Update priority calculation to include size bonus
3. Update Today page to show crunch mode indicator
4. Update AI Advice to mention crunch strategy

**Phase 5: Smart Scheduling**
1. Implement `generateSmartDailyPlan()`
2. Group related topics in daily recommendations
3. Show "learn together" hints in UI
4. Add prerequisite warnings

**Phase 6: Polish**
1. Visual indicators for size (S/M/L badges)
2. Cluster visualization in subject overview
3. Crunch mode banner with strategy tips
4. Settings for threshold customization

---

### Edge Cases

1. **No size data** - If topic.size is null, treat as 'medium' for calculations
2. **Circular prerequisites** - Detect and warn, don't block
3. **Orphan topics** - Topics with no relations still get scheduled normally
4. **Manual override** - User size choice always wins over AI
5. **Large cluster** - If cluster has 10+ topics, split across days intelligently

---

### Integration with Session Mode

When Session Mode is active:
- Crunch Mode can still trigger within a session
- Size/relations affect daily topic distribution
- Calendar view shows clusters visually
- Rebalance respects size priorities

---

### Future Enhancements (v2)

- **Learning time tracking** - Actual time per topic to improve size estimates
- **Difficulty rating** - Separate from size (short but hard vs long but easy)
- **Concept graph** - Visual map of topic relationships
- **Smart review** - Spaced repetition using relations (review related topics together)
- **Import from syllabus** - Bulk extract relations from official syllabus PDF

---

*Добавено: Януари 2025*
*За имплементация: След Session Mode или паралелно*

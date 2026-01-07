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

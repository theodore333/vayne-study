# Vayne Study Command Center

Академичен command center за медицински студенти. Персонализирана система за учене с AI интеграция, gamification и spaced repetition.

## Features

### Core Features

#### Subjects & Topics Management
- Създаване на предмети с цвят, тип (preclinical/clinical/basic), изпитна дата и формат
- Добавяне на теми (ръчно, от PDF, или чрез AI извличане)
- Статус система с 4 нива: Gray (нов) → Orange (прочетен) → Yellow (упражняван) → Green (усвоен)
- Decay система - статусът пада ако не преговаряш 7+ дни
- Bloom's Taxonomy tracking (6 нива на познание)

#### AI-Powered Quiz System
- Генериране на въпроси от материал чрез Claude AI
- MCQ (multiple choice) и Open-ended въпроси
- Адаптивна трудност базирана на Bloom's Taxonomy
- Quiz Length presets: Quick (5q, 0.5x), Standard (12q, 1.0x), Deep (22q, 1.5x), Marathon (35q, 2.0x)
- Weighted scoring - по-дългите тестове имат по-голямо влияние върху mastery
- Timer и keyboard shortcuts (A-D/1-4 за MCQ, Ctrl+Enter за open, Enter за next)

#### Question Bank
- Извличане на въпроси от PDF файлове (изпитни теми, тестове)
- Поддръжка на multi-part файлове (въпроси и отговори в отделни PDFs)
- Format A (стандартни MCQ) и Format B (твърдения + комбинации)
- Поддръжка на multiple correct answers
- Practice mode с timer и keyboard shortcuts

#### Material Extraction
- Upload PDF → AI извлича текст, таблици, диаграми
- Ctrl+V paste за screenshots директно
- Описване на диаграми и схеми текстово
- Автоматично добавяне към материала на темата

### Timer & Productivity

#### Pomodoro Timer
- Настройваеми work/break интервали
- Auto-start breaks/work опция
- Sound notifications
- **Persistent timer** - продължава дори при затворен браузър/tab
- **Floating widget** - показва се на всички страници докато работи
- Записва сесиите в статистиките

#### Normal Timer
- Свободен таймер за проследяване на учебни сесии
- Избор на предмет и тема
- Rating система след приключване

### Today Dashboard

#### Daily Plan
- Автоматично генериране на дневни задачи базирано на:
  - Упражнения/изпити утре (critical priority)
  - Изпити в следващите 7 дни (high priority)
  - Теми с риск от забравяне (medium priority)
  - Нов материал (normal priority)
- Topic-based workload (не часове) - изчислява реалния брой теми за деня

#### AI Advice
- "AI Съвет" бутон за персонализирани съвети
- "Седмичен Преглед" за weekly review
- Анализ на слаби теми и приоритети

#### Workload Display
- Показва реалния брой теми за деня по предмети
- Urgency levels: Critical (≤3д), High (≤7д), Medium (≤14д), Low
- Warnings за unrealistic workload (>10 или >20 теми/ден)

### Gamification System

#### XP & Levels
- 9 нива: Студент → Начинаещ → Напреднал → Експерт → Майстор → Гуру → Легенда → Митичен → Vayne Mode
- XP за: промяна на статус, quiz-ове, perfect scores, Bloom level up
- Combo система (1.2x-2x XP за действия в рамките на 30мин)

#### Achievements (25+)
- Streak achievements (3, 7, 14, 30 дни)
- Topic milestones (10, 50, 100 теми)
- Quiz achievements (first quiz, 10 quizzes, perfect scores)
- Level achievements (достигане на всяко ниво)
- Special: "Vayne Mode" за ниво 9

#### Stats Tracking
- Topics completed, Green topics, Quizzes taken
- Perfect quizzes, Longest streak
- Daily/Weekly/Monthly study time

### Prediction & Analytics

#### Exam Prediction
- Monte Carlo симулация (1000 итерации)
- Best case (95th percentile), Expected, Worst case (5th percentile)
- Variance analysis
- Critical topics identification
- Impact recommendations

#### Format Gap Analysis
- Анализ на слабости по тип въпрос (MCQ vs cases vs open)
- Format-specific tips

### Schedule & GPA

#### Weekly Schedule
- Седмично разписание на занятия
- Class types: Lecture, Seminar, Exercise, Lab, Clinical
- Prep required флаг за упражнения

#### GPA Calculator
- Semester grades tracking
- Target GPA setting
- Current vs Target comparison

### Settings & Sync

#### Cloud Sync
- Redis-based cloud synchronization
- Real-time sync indicator
- Manual sync button

#### Settings
- Claude API key configuration
- Pomodoro timing settings
- Study goals (daily/weekly/monthly minutes)
- Academic period (semester/session dates)
- Monthly API budget

### Daily Status
- Sick mode (50% workload)
- Holiday mode (50% workload)
- Normal mode

## Tech Stack

- **Frontend**: Next.js 16, React, TypeScript, Tailwind CSS
- **AI**: Claude API (Anthropic)
- **Storage**: localStorage + Redis cloud sync
- **Deployment**: Railway

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Run development server: `npm run dev`
4. Add Claude API key in Settings

## Keyboard Shortcuts

### Quiz
- `A-D` or `1-4`: Select MCQ answer
- `Ctrl+Enter`: Submit open-ended answer
- `Enter`: Next question

### Question Bank Practice
- `A-D` or `1-4`: Select answer
- `Enter`: Next question

### General
- `Ctrl+V`: Paste screenshot (on topic page)

## API Endpoints

- `POST /api/quiz` - Generate quiz questions
- `POST /api/extract-material` - Extract text from PDF/images
- `POST /api/extract-questions` - Extract questions from exam PDFs
- `POST /api/ai-advice` - Get AI study advice
- `GET/POST /api/data` - Cloud sync

---

Built with Claude Code

# VAYNE Study - Context за Claude

**Прочети този файл в началото на всяка сесия!**

## Какво е VAYNE?
AI-powered study app за медицински студент в МУ София (3-ти курс). Целта е **6.00 среден успех**.

**Stack:** Next.js 14 + TypeScript + Tailwind + Claude API

**Repo:** `C:\Users\User\vayne-study`

---

## Основни компоненти

| Път | Описание |
|-----|----------|
| `/subjects` | Управление на предмети и теми |
| `/subjects/[subjectId]/topics/[topicId]` | **Full page** за тема (статус, материал, оценки) |
| `/quiz` | AI Quiz с 5 режима (Bloom's Taxonomy) |
| `/question-bank` | Сборници с тестове от PDF |
| `/question-bank/practice` | Practice с 4 режима (All, Weak, Spaced, Custom) |
| `/prediction` | Прогноза за оценка |
| `/today` | Дневен план за учене |
| `lib/algorithms.ts` | Prediction, Monte Carlo, Daily Plan |
| `lib/types.ts` | Всички TypeScript типове |
| `lib/context.tsx` | React Context + localStorage |

---

## Question Bank система

### Типове въпроси
- `mcq` - Multiple choice
- `open` - Отворен въпрос
- `case_study` - Клиничен казус

### BankQuestion stats
```typescript
stats: {
  attempts: number;
  correct: number;
  lastAttempt?: string;  // ISO date
}
linkedTopicIds: string[];  // AI auto-links при импорт
```

### Practice Modes
1. **All Questions** - случаен ред
2. **Weak Focus** - accuracy < 50%
3. **Spaced Review** - най-старите първо
4. **Custom Count** - slider за брой въпроси

---

## Prediction алгоритъм (текущо)

```typescript
calculatePredictedGrade(subject, vayneMode) → PredictedGrade
```

**Фактори:**
1. Coverage Score - статуси на темите (🟢🟡🟠⚪)
2. Mastery Score - средна оценка от AI Quiz
3. Consistency Score - теми прегледани в последните 7 дни
4. Time Factor - дни до изпит
5. Decay Risk - теми непрегледани 5+ дни

**НЕ включва:** Question Bank accuracy!

---

## В момента се работи по:

### ⏳ Question Bank → Prediction
**Цел:** Accuracy от сборниците да влияе на прогнозата.

**Стъпки:**
1. [ ] Добави `questionBanks` параметър към `calculatePredictedGrade()`
2. [ ] Изчисли общ accuracy от всички банки за предмета
3. [ ] Добави нов фактор "Question Bank Performance"
4. [ ] Покажи в Prediction UI

**Файлове за промяна:**
- `lib/algorithms.ts` - calculatePredictedGrade()
- `app/prediction/page.tsx` - подаване на questionBanks
- `app/page.tsx` - dashboard (ако показва prediction)

---

## Скорошни промени (Jan 2025)

- ✅ Topic full page вместо sidebar
- ✅ Smart Practice Modes (4 режима)
- ✅ Auto-link въпроси → теми (по ID)
- ✅ Natural sorting за multi-part файлове
- ✅ Статуси обърнати в табло (⚪→🟢)
- ✅ Custom question count с slider

---

## Команди

```bash
cd C:\Users\User\vayne-study
npm run dev      # Development
npm run build    # Production build
git push origin master  # Deploy (auto-deploy)
```

---

## Бележки

- Всичко е на български в UI
- Claude Sonnet 4.5 за PDF extraction
- Claude Opus за Quiz generation
- localStorage + Vercel Redis за sync

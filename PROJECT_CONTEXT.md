# VAYNE Study Assistant - Project Context

**Last Updated:** 2026-01-07

## Project Overview
AI-powered study assistant for medical students in Bulgaria. Помага с:
- Организиране на учебен материал по предмети и теми
- AI-генерирани quiz-ове (MCQ, open, case studies)
- Question Bank - импорт на PDF сборници с тестове
- Прогноза за оценки с Monte Carlo симулация
- Daily planning базиран на изпитен график и decay risk

## Tech Stack
- **Framework:** Next.js 16.1 (App Router, Turbopack)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **AI:** Claude API (Sonnet 4)
- **Storage:** localStorage + optional Redis cloud sync
- **Deploy:** Railway (НЕ Vercel - timeout issues!)

## Critical Files
```
lib/
├── algorithms.ts     # Grade prediction, Monte Carlo, daily planning
├── context.tsx       # React context for global state
├── storage.ts        # localStorage operations
├── cloud-sync.ts     # Redis sync (optional)
├── types.ts          # TypeScript interfaces
└── constants.ts      # Status colors, config

app/api/
├── quiz/route.ts           # AI quiz generation, free recall, gap analysis
├── extract/route.ts        # PDF text extraction
├── extract-questions/route.ts  # Question extraction from PDF
├── data/route.ts           # Redis CRUD
└── test-key/route.ts       # API key validation

app/
├── quiz/page.tsx           # Main quiz interface
├── question-bank/          # PDF question banks
│   ├── page.tsx           # Bank management
│   └── practice/page.tsx  # Practice mode
├── prediction/page.tsx     # Grade prediction
├── today/page.tsx          # Daily plan
├── subjects/page.tsx       # Subject management
├── settings/page.tsx       # API key, cloud sync
└── timer/page.tsx          # Pomodoro timer
```

## Key Algorithms

### Grade Prediction (`calculatePredictedGrade`)
- Weighted factors: coverage, quiz avg, consistency, decay risk
- Question Bank bonus from practice stats
- "Vayne mode" - optimistic prediction (+0.5-1.0)
- Monte Carlo simulation for best/worst case scenarios

### Topic Priority (`getTopicPriority`)
- Combines: status weight, decay risk, recent performance, exam proximity
- Used for daily plan generation

### Bloom's Taxonomy Progression
- Levels 1-6: Remember → Create
- Adaptive based on quiz history performance

## Audit Fixes Applied (2026-01-07)

### CRITICAL Fixes:
1. **Monte Carlo impact formula** (`algorithms.ts:68-74`)
   - OLD: `impact = (improvedContribution - currentContribution) * (1 / topics.length * actualTopicsOnExam)`
   - NEW: `impact = scoreDiff * selectionProbability` (correct probability calc)

2. **Free recall validation** (`api/quiz/route.ts:82-88`)
   - Added check for empty string submission
   - Returns error "Напиши нещо преди да оцениш" for empty input

3. **Recursive prediction** (`algorithms.ts:358-373`)
   - Removed recursive call to `calculatePredictedGrade(subject, true)`
   - Now calculates both modes in single pass

4. **Missing questionBanks param** (`prediction/page.tsx:338`)
   - Added missing parameter to `calculatePredictedGrade` call

### MEDIUM Fixes:
5. **useEffect dependencies** (`quiz/page.tsx:174-226`, `practice/page.tsx:178-244`)
   - Inlined handler logic to avoid stale closures
   - Fixed keyboard shortcuts with proper state access

## Known Issues (LOW priority - for future)

### Rate Limiting
- No API rate limiting - злонамерен потребител може да spam-ва
- Consider: Redis-based rate limit per API key

### Token Management
- Large materials can exceed token limits
- Consider: chunking or warning for >50K chars

### Error Messages
- Mixed Bulgarian/English in some error handlers
- Consider: consistent Bulgarian throughout

### Redis Efficiency
- New connection on every request in `api/data/route.ts`
- Consider: connection pooling singleton

### UI Edge Cases
- Very long topic names can overflow in some views
- Mobile responsiveness could be improved

## Testing Notes

### Manual Test Scenarios:
1. **Empty inputs** - All forms have validation
2. **Long inputs** - Most have reasonable limits
3. **Button spam** - Loading states disable buttons
4. **Refresh during action** - State recovery via localStorage
5. **Offline mode** - Works with localStorage, cloud sync graceful fallback

### API Endpoints:
- All endpoints have try/catch
- JSON parse errors handled
- Claude API errors propagated with helpful messages

## Deploy (Railway)

```bash
# Build
npm run build

# Push to Railway
git push origin master
# Auto-deploys on Railway
```

Railway advantages over Vercel:
- No 10-second function timeout (PDF extraction needs more)
- Better WebSocket support for future features
- Persistent Redis connection possible

## Environment Variables (Railway)
```
REDIS_URL=redis://...        # Optional, for cloud sync
ANTHROPIC_API_KEY=sk-...     # Optional, users can add their own
```

## API Key Security
- Users store their own Claude API key in localStorage
- Key is sent to backend only for API calls
- Not stored on server side
- Alternative: server-side key in env for all users

# VAYNE Study Assistant - Changelog

## 2025-01-07

### Quiz System
- **Unified Quiz Setup Screen** - Mix Quiz и single topic quiz вече използват един и същ екран
  - Същите режими за двата типа (Assessment, Mid-Order, Higher-Order, Gap Analysis, Custom)
  - Quiz Length presets с тежест (Quick 0.5x, Standard 1.0x, Deep 1.5x, Marathon 2.0x)
  - Free Recall скрит за Mix Quiz (няма смисъл за много теми)
  - AI препоръка показана само за single topic
- **Quiz Question Distribution** - Quiz вече генерира предимно open въпроси и case studies
  - 60-70% Open въпроси (изискват писане)
  - 20-30% Case Studies (клинични сценарии)
  - Макс 10-20% MCQ (за MCQ има Question Bank)
- **Bug Fix** - Quiz вече не се връща към mode selection след preview screen

### Question Bank
- **Manual Question Entry** - Нов бутон "Ръчно" за добавяне на въпроси без PDF
  - Поле за текст на въпроса
  - Динамични опции (2-6 отговора)
  - Поддръжка на един или няколко верни отговора
  - Обяснение (optional)
  - Добавяне към съществуващ сборник или създаване на нов
  - Формата се нулира за бързо въвеждане на много въпроси
- **Explanations on Wrong Answer** - При грешен отговор се показва обяснение защо е грешен
  - Работи за нови сборници (Claude генерира обясненията при извличане)
- **Modal Close Protection** - Потвърждение преди затваряне на Import modal ако има неимпортнати въпроси
  - Предотвратява случайна загуба на извлечени въпроси

### UI/UX
- Консистентен UI между Mix Quiz и Single Topic Quiz
- По-добра защита срещу случайно затваряне на модали с данни

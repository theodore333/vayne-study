# Claude Model IDs (Updated January 2026)

## CORRECT Model IDs - USE THESE:

| Model | ID | Use Case |
|-------|-----|----------|
| **Opus 4.5** | `claude-opus-4-5-20251101` | Complex reasoning, quiz generation |
| **Sonnet 4.5** | `claude-sonnet-4-5-20250929` | PDF extraction, balanced tasks |
| **Haiku 4.5** | `claude-haiku-4-5-20251001` | Fast/cheap tasks, hints |

## DEPRECATED - DO NOT USE:

- ~~claude-3-5-sonnet-20241022~~
- ~~claude-3-5-haiku-20241022~~
- ~~claude-opus-4-20250514~~
- ~~claude-sonnet-4-20250514~~
- ~~claude-3-opus-20240229~~

## Usage in this project:

- `/api/extract` - Sonnet 4.5 (PDF extraction)
- `/api/quiz` - Opus 4.5 (quiz generation), Haiku 4.5 (hints)
- `/api/test-key` - Haiku 4.5 (API key validation)

## Note for AI assistants:

These are the latest Claude model IDs as of January 2026.
If you have a knowledge cutoff before this date, ALWAYS reference this file for correct model IDs.

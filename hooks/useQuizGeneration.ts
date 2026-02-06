import { useState, useEffect, useCallback, useRef } from 'react';
import { Question } from '@/lib/quiz-types';
import { fetchWithTimeout, getFetchErrorMessage, isAbortOrTimeoutError } from '@/lib/fetch-utils';

export interface GenerateResult {
  questions?: Question[];
  usage?: { cost: number };
  countWarning?: string;
  error?: string;
  aborted?: boolean;
}

export function useQuizGeneration() {
  const [generatingStartTime, setGeneratingStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Init abort controller + cleanup on unmount
  useEffect(() => {
    abortControllerRef.current = new AbortController();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Elapsed time counter during generation
  useEffect(() => {
    if (!generatingStartTime) {
      setElapsedSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - generatingStartTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [generatingStartTime]);

  const generate = useCallback(async (
    requestBody: Record<string, unknown>,
    options?: { onRetry?: () => void }
  ): Promise<GenerateResult> => {
    setGeneratingStartTime(Date.now());

    try {
      let response: Response | null = null;
      let result: Record<string, unknown> | null = null;
      let lastError: string | null = null;

      for (let attempt = 0; attempt < 2; attempt++) {
        if (abortControllerRef.current?.signal.aborted) break;

        try {
          response = await fetchWithTimeout('/api/quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
            timeout: 240000,
            signal: abortControllerRef.current?.signal
          });

          result = await response.json() as Record<string, unknown>;

          if (response.ok) break;

          lastError = (result?.error as string) || `HTTP ${response.status}`;

          // Don't retry on 4xx errors
          if (response.status >= 400 && response.status < 500) break;

          if (attempt === 0) {
            options?.onRetry?.();
          }
        } catch (err) {
          if (isAbortOrTimeoutError(err)) throw err;
          lastError = getFetchErrorMessage(err);
          if (attempt === 0) {
            options?.onRetry?.();
          }
        }
      }

      setGeneratingStartTime(null);

      if (!response?.ok || !result) {
        return { error: lastError || 'Грешка при генериране.' };
      }

      return {
        questions: result.questions as Question[],
        usage: result.usage as { cost: number } | undefined,
        countWarning: result.countWarning as string | undefined,
      };
    } catch (error) {
      setGeneratingStartTime(null);
      if (isAbortOrTimeoutError(error)) {
        return { error: 'Генерирането беше отменено.', aborted: true };
      }
      return { error: getFetchErrorMessage(error) };
    }
  }, []);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    setGeneratingStartTime(null);
  }, []);

  return {
    elapsedSeconds,
    abortControllerRef,
    generate,
    cancel,
  };
}

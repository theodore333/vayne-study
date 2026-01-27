/**
 * Fetch utilities with timeout and abort support
 */

export interface FetchWithTimeoutOptions extends RequestInit {
  timeout?: number; // milliseconds, default 300000 (5 minutes)
}

export class FetchTimeoutError extends Error {
  constructor(message: string = 'Request timed out') {
    super(message);
    this.name = 'FetchTimeoutError';
  }
}

export class FetchAbortedError extends Error {
  constructor(message: string = 'Request was aborted') {
    super(message);
    this.name = 'FetchAbortedError';
  }
}

/**
 * Fetch with automatic timeout
 * @param url - The URL to fetch
 * @param options - Fetch options with optional timeout (default 5 minutes)
 * @returns Promise<Response>
 * @throws FetchTimeoutError if request times out
 * @throws FetchAbortedError if request is aborted externally
 */
export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {}
): Promise<Response> {
  const { timeout = 300000, signal: externalSignal, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // If external signal is provided, forward its abort to our controller
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      throw new FetchAbortedError();
    }
    externalSignal.addEventListener('abort', () => controller.abort());
  }

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        // Check if it was external abort or timeout
        if (externalSignal?.aborted) {
          throw new FetchAbortedError();
        }
        throw new FetchTimeoutError(`Request timed out after ${timeout}ms`);
      }
    }
    throw error;
  }
}

/**
 * Create an abort controller that can be used for cleanup
 * Returns controller and a cleanup function
 */
export function createAbortController(): {
  controller: AbortController;
  cleanup: () => void;
  signal: AbortSignal;
} {
  const controller = new AbortController();
  return {
    controller,
    signal: controller.signal,
    cleanup: () => controller.abort()
  };
}

/**
 * Helper to check if an error is a timeout or abort error
 */
export function isAbortOrTimeoutError(error: unknown): boolean {
  return error instanceof FetchTimeoutError ||
         error instanceof FetchAbortedError ||
         (error instanceof Error && error.name === 'AbortError');
}

/**
 * Get user-friendly error message for fetch errors
 */
export function getFetchErrorMessage(error: unknown): string {
  if (error instanceof FetchTimeoutError) {
    return 'Заявката отне твърде дълго. Провери интернет връзката си и опитай отново.';
  }
  if (error instanceof FetchAbortedError) {
    return 'Заявката беше прекъсната.';
  }
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return 'Няма интернет връзка. Провери връзката си и опитай отново.';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Възникна неочаквана грешка.';
}

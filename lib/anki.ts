// AnkiConnect API helper
// AnkiConnect runs on localhost:8765 by default

const ANKI_CONNECT_URL = 'http://localhost:8765';

interface AnkiConnectRequest {
  action: string;
  version: number;
  params?: Record<string, unknown>;
}

interface AnkiConnectResponse<T> {
  result: T;
  error: string | null;
}

async function invoke<T>(action: string, params?: Record<string, unknown>): Promise<T> {
  const request: AnkiConnectRequest = {
    action,
    version: 6,
    params
  };

  const response = await fetch(ANKI_CONNECT_URL, {
    method: 'POST',
    body: JSON.stringify(request),
  });

  const data: AnkiConnectResponse<T> = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  return data.result;
}

// Check if AnkiConnect is available
export async function checkAnkiConnect(): Promise<boolean> {
  try {
    const version = await invoke<number>('version');
    return version >= 6;
  } catch {
    return false;
  }
}

// Get all deck names
export async function getDeckNames(): Promise<string[]> {
  return invoke<string[]>('deckNames');
}

// Get deck stats (due counts)
export interface DeckStats {
  deck_id: number;
  name: string;
  new_count: number;
  learn_count: number;
  review_count: number;
}

export async function getDeckStats(): Promise<DeckStats[]> {
  const deckNames = await getDeckNames();
  const stats: DeckStats[] = [];

  for (const name of deckNames) {
    try {
      // Get due counts for each deck
      const dueInfo = await invoke<{ new_count: number; learn_count: number; review_count: number }>(
        'getDeckStats',
        { deck: name }
      );

      stats.push({
        deck_id: 0,
        name,
        new_count: dueInfo.new_count || 0,
        learn_count: dueInfo.learn_count || 0,
        review_count: dueInfo.review_count || 0
      });
    } catch {
      // If getDeckStats fails, try alternative method
      try {
        const cards = await invoke<number[]>('findCards', { query: `deck:"${name}" is:due` });
        const newCards = await invoke<number[]>('findCards', { query: `deck:"${name}" is:new` });

        stats.push({
          deck_id: 0,
          name,
          new_count: newCards.length,
          learn_count: 0,
          review_count: cards.length
        });
      } catch {
        stats.push({
          deck_id: 0,
          name,
          new_count: 0,
          learn_count: 0,
          review_count: 0
        });
      }
    }
  }

  return stats;
}

// Get total due cards across all decks
export async function getTotalDueCards(): Promise<{ new: number; learn: number; review: number; total: number }> {
  try {
    const newCards = await invoke<number[]>('findCards', { query: 'is:new' });
    const dueCards = await invoke<number[]>('findCards', { query: 'is:due -is:new' });

    return {
      new: newCards.length,
      learn: 0, // Hard to get accurately
      review: dueCards.length,
      total: newCards.length + dueCards.length
    };
  } catch {
    return { new: 0, learn: 0, review: 0, total: 0 };
  }
}

// Get collection stats
export interface CollectionStats {
  totalCards: number;
  totalDecks: number;
  dueToday: number;
  newToday: number;
}

export async function getCollectionStats(): Promise<CollectionStats> {
  try {
    const deckNames = await getDeckNames();
    const allCards = await invoke<number[]>('findCards', { query: 'deck:*' });
    const dueCards = await invoke<number[]>('findCards', { query: 'is:due' });
    const newCards = await invoke<number[]>('findCards', { query: 'is:new' });

    return {
      totalCards: allCards.length,
      totalDecks: deckNames.filter(n => !n.includes('::')).length, // Only top-level decks
      dueToday: dueCards.length,
      newToday: newCards.length
    };
  } catch {
    return {
      totalCards: 0,
      totalDecks: 0,
      dueToday: 0,
      newToday: 0
    };
  }
}

// Sync/refresh Anki (trigger sync if AnkiWeb configured)
export async function syncAnki(): Promise<void> {
  await invoke('sync');
}

// Get review stats for today
export async function getTodayStats(): Promise<{ reviewed: number; minutes: number }> {
  try {
    // Get cards reviewed today
    const reviewed = await invoke<number[]>('findCards', { query: 'rated:1' });

    return {
      reviewed: reviewed.length,
      minutes: Math.round(reviewed.length * 0.5) // Rough estimate: 30 sec per card
    };
  } catch {
    return { reviewed: 0, minutes: 0 };
  }
}

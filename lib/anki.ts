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

export async function getCollectionStats(selectedDecks?: string[]): Promise<CollectionStats> {
  try {
    const deckNames = await getDeckNames();

    // If no decks selected, use all decks
    const decksToUse = selectedDecks && selectedDecks.length > 0
      ? selectedDecks
      : deckNames;

    // Build query for selected decks
    const deckQuery = decksToUse.map(d => `"deck:${d}"`).join(' OR ');

    const allCards = await invoke<number[]>('findCards', { query: deckQuery });
    const dueCards = await invoke<number[]>('findCards', { query: `(${deckQuery}) is:due` });
    const newCards = await invoke<number[]>('findCards', { query: `(${deckQuery}) is:new` });

    return {
      totalCards: allCards.length,
      totalDecks: decksToUse.filter(n => !n.includes('::')).length,
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

// Get selected decks from localStorage
export function getSelectedDecks(): string[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('anki-selected-decks');
  return stored ? JSON.parse(stored) : [];
}

// Save selected decks to localStorage
export function saveSelectedDecks(decks: string[]): void {
  localStorage.setItem('anki-selected-decks', JSON.stringify(decks));
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

// Create a deck (supports nested decks with :: notation)
export async function createDeck(deckName: string): Promise<number> {
  return invoke<number>('createDeck', { deck: deckName });
}

// Export subject with all topics as Anki subdecks
export interface ExportResult {
  success: boolean;
  parentDeck: string;
  createdDecks: string[];
  error?: string;
}

export async function exportSubjectToAnki(
  subjectName: string,
  topics: { number: number; name: string }[]
): Promise<ExportResult> {
  const createdDecks: string[] = [];

  try {
    // Create parent deck
    await createDeck(subjectName);
    createdDecks.push(subjectName);

    // Create subdeck for each topic
    for (const topic of topics) {
      // Format: "Subject::01. Topic Name"
      const paddedNumber = String(topic.number).padStart(2, '0');
      const subdeckName = `${subjectName}::${paddedNumber}. ${topic.name}`;
      await createDeck(subdeckName);
      createdDecks.push(subdeckName);
    }

    return {
      success: true,
      parentDeck: subjectName,
      createdDecks
    };
  } catch (error) {
    return {
      success: false,
      parentDeck: subjectName,
      createdDecks,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

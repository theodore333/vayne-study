/**
 * IndexedDB storage for large data (materials, images)
 * IndexedDB has a much larger limit than localStorage (50MB+ vs 5MB)
 */

const DB_NAME = 'vayne-study-db';
const DB_VERSION = 2;
const MATERIALS_STORE = 'materials';
const BACKUPS_STORE = 'backups';
const MAX_AUTO_BACKUPS = 3;

let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

/**
 * Initialize the IndexedDB database
 */
function initDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('IndexedDB not available on server'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      dbInitPromise = null; // Reset so next call can retry
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create materials store if it doesn't exist
      if (!db.objectStoreNames.contains(MATERIALS_STORE)) {
        db.createObjectStore(MATERIALS_STORE, { keyPath: 'topicId' });
      }

      // Create backups store (added in v2)
      if (!db.objectStoreNames.contains(BACKUPS_STORE)) {
        db.createObjectStore(BACKUPS_STORE, { keyPath: 'id' });
      }
    };
  });

  return dbInitPromise;
}

/**
 * Get material from IndexedDB
 */
export async function getMaterialFromIDB(topicId: string): Promise<string> {
  try {
    const db = await initDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(MATERIALS_STORE, 'readonly');
      const store = transaction.objectStore(MATERIALS_STORE);
      const request = store.get(topicId);

      request.onsuccess = () => {
        resolve(request.result?.content || '');
      };

      request.onerror = () => {
        console.error('Error getting material from IndexedDB:', request.error);
        resolve('');
      };
    });
  } catch {
    return '';
  }
}

/**
 * Set material in IndexedDB
 */
export async function setMaterialInIDB(topicId: string, content: string): Promise<boolean> {
  try {
    const db = await initDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(MATERIALS_STORE, 'readwrite');
      const store = transaction.objectStore(MATERIALS_STORE);

      // Add transaction complete handler
      transaction.oncomplete = () => {
      };
      transaction.onerror = () => {
        console.error('[IDB] Transaction error for:', topicId, transaction.error);
      };

      if (content) {
        const request = store.put({ topicId, content, updatedAt: new Date().toISOString() });
        request.onsuccess = () => {
          resolve(true);
        };
        request.onerror = () => {
          console.error('[IDB] Put request failed for:', topicId, request.error);
          resolve(false);
        };
      } else {
        // Delete if content is empty
        const request = store.delete(topicId);
        request.onsuccess = () => resolve(true);
        request.onerror = () => resolve(false);
      }
    });
  } catch (error) {
    console.error('[IDB] setMaterialInIDB exception:', error);
    return false;
  }
}

/**
 * Get all materials from IndexedDB
 */
export async function getAllMaterialsFromIDB(): Promise<Record<string, string>> {
  try {
    const db = await initDB();
    return new Promise((resolve) => {
      const transaction = db.transaction(MATERIALS_STORE, 'readonly');
      const store = transaction.objectStore(MATERIALS_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const materials: Record<string, string> = {};
        for (const item of request.result) {
          materials[item.topicId] = item.content;
        }
        resolve(materials);
      };

      request.onerror = () => {
        console.error('[IDB] getAllMaterialsFromIDB error:', request.error);
        resolve({});
      };
    });
  } catch (error) {
    console.error('[IDB] getAllMaterialsFromIDB exception:', error);
    return {};
  }
}

/**
 * Migrate materials from localStorage to IndexedDB
 */
export async function migrateFromLocalStorage(): Promise<{ migrated: number; freed: number }> {
  if (typeof window === 'undefined') return { migrated: 0, freed: 0 };

  try {
    const MATERIALS_KEY = 'vayne-materials';
    const stored = localStorage.getItem(MATERIALS_KEY);

    if (!stored) return { migrated: 0, freed: 0 };

    // Try to decompress (materials are always compressed)
    const LZString = (await import('lz-string')).default;
    const decompressed = LZString.decompress(stored);
    if (!decompressed) return { migrated: 0, freed: 0 };

    const materials = JSON.parse(decompressed) as Record<string, string>;
    const topicIds = Object.keys(materials);

    if (topicIds.length === 0) return { migrated: 0, freed: 0 };

    // Migrate each material to IndexedDB
    let migrated = 0;
    for (const topicId of topicIds) {
      const success = await setMaterialInIDB(topicId, materials[topicId]);
      if (success) migrated++;
    }

    // Calculate freed space
    const freedBytes = stored.length * 2; // UTF-16

    // Remove from localStorage after successful migration
    if (migrated === topicIds.length) {
      localStorage.removeItem(MATERIALS_KEY);
    }

    return { migrated, freed: freedBytes };
  } catch (error) {
    console.error('Migration error:', error);
    return { migrated: 0, freed: 0 };
  }
}

/**
 * Get IndexedDB storage usage estimate
 */
export async function getIDBStorageUsage(): Promise<{ used: number; available: number }> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { used: 0, available: 50 * 1024 * 1024 }; // Default 50MB
  }

  try {
    const estimate = await navigator.storage.estimate();
    return {
      used: estimate.usage || 0,
      available: estimate.quota || 50 * 1024 * 1024
    };
  } catch {
    return { used: 0, available: 50 * 1024 * 1024 };
  }
}

/**
 * Check if IndexedDB is available
 */
export function isIndexedDBAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return !!window.indexedDB;
}

/**
 * Clear only the materials store (preserves backups)
 */
export async function clearMaterialsStore(): Promise<void> {
  try {
    const db = await initDB();
    const tx = db.transaction(MATERIALS_STORE, 'readwrite');
    tx.objectStore(MATERIALS_STORE).clear();
  } catch { /* non-critical */ }
}

// --- Backup Snapshots ---

export interface BackupSnapshot {
  id: number; // timestamp
  type: 'auto' | 'pre-clear';
  data: string; // JSON-stringified AppData
  subjectCount: number;
  topicCount: number;
}

/**
 * Save a backup snapshot to IndexedDB, keeping max 3 auto snapshots
 */
export async function saveBackupSnapshot(data: unknown, type: 'auto' | 'pre-clear' = 'auto'): Promise<boolean> {
  try {
    const db = await initDB();
    const dataStr = JSON.stringify(data);
    const parsed = data as any;
    const subjects = Array.isArray(parsed?.subjects) ? parsed.subjects : [];

    const snapshot: BackupSnapshot = {
      id: Date.now(),
      type,
      data: dataStr,
      subjectCount: subjects.length,
      topicCount: subjects.reduce((sum: number, s: any) => sum + (Array.isArray(s?.topics) ? s.topics.length : 0), 0),
    };

    return new Promise((resolve) => {
      const tx = db.transaction(BACKUPS_STORE, 'readwrite');
      const store = tx.objectStore(BACKUPS_STORE);

      // Save the new snapshot
      const putReq = store.put(snapshot);
      putReq.onerror = () => resolve(false);

      tx.oncomplete = () => {
        // Clean up old auto backups (keep only MAX_AUTO_BACKUPS)
        pruneOldBackups().catch(() => {});
        resolve(true);
      };
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

async function pruneOldBackups(): Promise<void> {
  try {
    const db = await initDB();
    const tx = db.transaction(BACKUPS_STORE, 'readwrite');
    const store = tx.objectStore(BACKUPS_STORE);
    const allReq = store.getAll();

    allReq.onsuccess = () => {
      const all = allReq.result as BackupSnapshot[];
      const autos = all.filter(b => b.type === 'auto').sort((a, b) => b.id - a.id);

      // Delete excess auto backups
      for (let i = MAX_AUTO_BACKUPS; i < autos.length; i++) {
        store.delete(autos[i].id);
      }

      // Also delete pre-clear backups older than 7 days
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const oldPreClears = all.filter(b => b.type === 'pre-clear' && b.id < weekAgo);
      for (const b of oldPreClears) {
        store.delete(b.id);
      }
    };
  } catch { /* non-critical */ }
}

/**
 * Get all backup snapshots, sorted newest first
 */
export async function getBackupSnapshots(): Promise<BackupSnapshot[]> {
  try {
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction(BACKUPS_STORE, 'readonly');
      const store = tx.objectStore(BACKUPS_STORE);
      const req = store.getAll();

      req.onsuccess = () => {
        const all = (req.result as BackupSnapshot[]).sort((a, b) => b.id - a.id);
        resolve(all);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/**
 * Get the latest backup snapshot (any type)
 */
export async function getLatestBackup(): Promise<BackupSnapshot | null> {
  const all = await getBackupSnapshots();
  return all.length > 0 ? all[0] : null;
}

import { initDB, IMAGES_STORE } from './indexeddb-storage';
import type { TopicImage } from './types';

/**
 * Resize an image file to max width and return as base64 data URI
 */
export async function resizeImage(file: File, maxWidth = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas not supported')); return; }

        ctx.drawImage(img, 0, 0, width, height);
        const dataUri = canvas.toDataURL('image/jpeg', 0.8);
        resolve(dataUri);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Save an image to IndexedDB
 */
export async function saveImage(img: TopicImage): Promise<boolean> {
  try {
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IMAGES_STORE, 'readwrite');
      const store = tx.objectStore(IMAGES_STORE);
      const req = store.put(img);
      req.onsuccess = () => resolve(true);
      req.onerror = () => { console.error('saveImage error:', req.error); resolve(false); };
    });
  } catch (err) {
    console.error('saveImage exception:', err);
    return false;
  }
}

/**
 * Get images for a topic, optionally filtered by type
 */
export async function getImagesForTopic(topicId: string, type?: string): Promise<TopicImage[]> {
  try {
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IMAGES_STORE, 'readonly');
      const store = tx.objectStore(IMAGES_STORE);
      const index = store.index('topicId');
      const req = index.getAll(topicId);

      req.onsuccess = () => {
        let results = req.result as TopicImage[];
        if (type) {
          results = results.filter(img => img.type === type);
        }
        resolve(results);
      };
      req.onerror = () => { console.error('getImagesForTopic error:', req.error); resolve([]); };
    });
  } catch (err) {
    console.error('getImagesForTopic exception:', err);
    return [];
  }
}

/**
 * Delete an image by ID
 */
export async function deleteImage(id: string): Promise<boolean> {
  try {
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IMAGES_STORE, 'readwrite');
      const store = tx.objectStore(IMAGES_STORE);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => { console.error('deleteImage error:', req.error); resolve(false); };
    });
  } catch (err) {
    console.error('deleteImage exception:', err);
    return false;
  }
}

/**
 * Clear all images (used by clearData)
 */
export async function clearImagesStore(): Promise<void> {
  try {
    const db = await initDB();
    const tx = db.transaction(IMAGES_STORE, 'readwrite');
    tx.objectStore(IMAGES_STORE).clear();
  } catch { /* non-critical */ }
}

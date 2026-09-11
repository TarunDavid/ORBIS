/**
 * ORBIS Focus Audio Database — IndexedDB wrapper
 * ================================================
 * Caches TTS-generated audio clips per student so the focus alert
 * ("Hey {name}, please focus!") only needs to be generated once.
 *
 * Gracefully degrades in private browsing or when IndexedDB is unavailable.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AudioClipRecord {
  studentId: number;
  blob: Blob;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Database constants
// ---------------------------------------------------------------------------

const DB_NAME = 'orbis-focus-audio';
const DB_VERSION = 1;
const STORE_NAME = 'audio_clips';

// ---------------------------------------------------------------------------
// FocusAudioDB class
// ---------------------------------------------------------------------------

class FocusAudioDB {
  private db: IDBDatabase | null = null;
  private openFailed = false;

  /** Open (or create) the IndexedDB database. */
  async open(): Promise<void> {
    if (this.db || this.openFailed) return;

    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'studentId' });
          }
        };

        request.onsuccess = () => {
          this.db = request.result;
          resolve();
        };

        request.onerror = () => {
          console.warn('[FocusAudioDB] IndexedDB open failed — audio caching disabled:', request.error);
          this.openFailed = true;
          resolve(); // Resolve (not reject) for graceful degradation
        };
      } catch (e) {
        console.warn('[FocusAudioDB] IndexedDB not available — audio caching disabled:', e);
        this.openFailed = true;
        resolve();
      }
    });
  }

  /** Check if the database is usable. */
  get isAvailable(): boolean {
    return this.db !== null && !this.openFailed;
  }

  /** Retrieve a cached audio clip for a student. */
  async getClip(studentId: number): Promise<Blob | null> {
    if (!this.db) return null;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(studentId);
        req.onsuccess = () => {
          const record = req.result as AudioClipRecord | undefined;
          resolve(record?.blob ?? null);
        };
        req.onerror = () => {
          console.warn('[FocusAudioDB] Failed to read clip:', req.error);
          resolve(null);
        };
      } catch (e) {
        console.warn('[FocusAudioDB] getClip error:', e);
        resolve(null);
      }
    });
  }

  /** Save an audio clip blob for a student. */
  async saveClip(studentId: number, blob: Blob): Promise<void> {
    if (!this.db) return;

    const record: AudioClipRecord = {
      studentId,
      blob,
      createdAt: Date.now(),
    };

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => {
          console.warn('[FocusAudioDB] Failed to save clip:', tx.error);
          resolve();
        };
      } catch (e) {
        console.warn('[FocusAudioDB] saveClip error:', e);
        resolve();
      }
    });
  }

  /** Delete a cached audio clip for a student. */
  async deleteClip(studentId: number): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(studentId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => {
          console.warn('[FocusAudioDB] Failed to delete clip:', tx.error);
          resolve();
        };
      } catch (e) {
        console.warn('[FocusAudioDB] deleteClip error:', e);
        resolve();
      }
    });
  }
}

// Singleton export
export const focusAudioDb = new FocusAudioDB();
export default focusAudioDb;

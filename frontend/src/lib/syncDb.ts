/**
 * ORBIS Sync Database — IndexedDB wrapper
 * ========================================
 * Persists sync state (manifests, download progress, chunk cache)
 * across browser sessions for resumable offline-first downloads.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChunkProgress {
  filePath: string;
  chunkIndex: number;
  status: 'pending' | 'downloading' | 'done' | 'error';
  data?: ArrayBuffer;       // Cached chunk bytes (cleared after file assembly)
  sha256?: string;
  timestamp: number;
}

export interface FileProgress {
  filePath: string;
  totalChunks: number;
  completedChunks: number;
  totalBytes: number;
  downloadedBytes: number;
  status: 'pending' | 'downloading' | 'paused' | 'done' | 'error';
  error?: string;
  startedAt: number;
  updatedAt: number;
}

export interface SyncManifest {
  version: number;
  generated_at: number;
  default_chunk_size: number;
  files: FileManifestEntry[];
}

export interface FileManifestEntry {
  path: string;
  size: number;
  mtime: number;
  sha256_full: string;
  chunk_size: number;
  chunks: ChunkEntry[];
}

export interface ChunkEntry {
  index: number;
  offset: number;
  size: number;
  sha256: string;
}

// ---------------------------------------------------------------------------
// Database constants
// ---------------------------------------------------------------------------

const DB_NAME = 'orbis-sync';
const DB_VERSION = 1;

const STORES = {
  MANIFESTS: 'manifests',
  FILE_PROGRESS: 'file_progress',
  CHUNK_PROGRESS: 'chunk_progress',
} as const;

// ---------------------------------------------------------------------------
// SyncStateDB class
// ---------------------------------------------------------------------------

class SyncStateDB {
  private db: IDBDatabase | null = null;

  /** Open (or create) the IndexedDB database. */
  async open(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(STORES.MANIFESTS)) {
          db.createObjectStore(STORES.MANIFESTS, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(STORES.FILE_PROGRESS)) {
          db.createObjectStore(STORES.FILE_PROGRESS, { keyPath: 'filePath' });
        }

        if (!db.objectStoreNames.contains(STORES.CHUNK_PROGRESS)) {
          const chunkStore = db.createObjectStore(STORES.CHUNK_PROGRESS, {
            keyPath: ['filePath', 'chunkIndex'],
          });
          chunkStore.createIndex('by_file', 'filePath', { unique: false });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  /** Ensure the DB is open before any operation. */
  private ensureOpen(): IDBDatabase {
    if (!this.db) throw new Error('SyncStateDB not open — call open() first');
    return this.db;
  }

  // -----------------------------------------------------------------------
  // Manifests
  // -----------------------------------------------------------------------

  async saveManifest(manifest: SyncManifest): Promise<void> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.MANIFESTS, 'readwrite');
      tx.objectStore(STORES.MANIFESTS).put({ id: 'local', ...manifest });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getManifest(): Promise<SyncManifest | null> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.MANIFESTS, 'readonly');
      const req = tx.objectStore(STORES.MANIFESTS).get('local');
      req.onsuccess = () => {
        const result = req.result;
        if (!result) {
          resolve(null);
          return;
        }
        // Strip the IDB key before returning
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, ...manifest } = result;
        resolve(manifest as SyncManifest);
      };
      req.onerror = () => reject(req.error);
    });
  }

  // -----------------------------------------------------------------------
  // File progress
  // -----------------------------------------------------------------------

  async saveFileProgress(progress: FileProgress): Promise<void> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.FILE_PROGRESS, 'readwrite');
      tx.objectStore(STORES.FILE_PROGRESS).put(progress);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getFileProgress(filePath: string): Promise<FileProgress | null> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.FILE_PROGRESS, 'readonly');
      const req = tx.objectStore(STORES.FILE_PROGRESS).get(filePath);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllFileProgress(): Promise<FileProgress[]> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.FILE_PROGRESS, 'readonly');
      const req = tx.objectStore(STORES.FILE_PROGRESS).getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  }

  async clearFileProgress(filePath: string): Promise<void> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.FILE_PROGRESS, 'readwrite');
      tx.objectStore(STORES.FILE_PROGRESS).delete(filePath);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // -----------------------------------------------------------------------
  // Chunk progress
  // -----------------------------------------------------------------------

  async saveChunkProgress(chunk: ChunkProgress): Promise<void> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.CHUNK_PROGRESS, 'readwrite');
      tx.objectStore(STORES.CHUNK_PROGRESS).put(chunk);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getChunkProgress(filePath: string, chunkIndex: number): Promise<ChunkProgress | null> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.CHUNK_PROGRESS, 'readonly');
      const req = tx.objectStore(STORES.CHUNK_PROGRESS).get([filePath, chunkIndex]);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async getChunksForFile(filePath: string): Promise<ChunkProgress[]> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.CHUNK_PROGRESS, 'readonly');
      const index = tx.objectStore(STORES.CHUNK_PROGRESS).index('by_file');
      const req = index.getAll(filePath);
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  }

  async clearChunksForFile(filePath: string): Promise<void> {
    const db = this.ensureOpen();
    const chunks = await this.getChunksForFile(filePath);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.CHUNK_PROGRESS, 'readwrite');
      const store = tx.objectStore(STORES.CHUNK_PROGRESS);
      for (const chunk of chunks) {
        store.delete([chunk.filePath, chunk.chunkIndex]);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // -----------------------------------------------------------------------
  // Bulk cleanup
  // -----------------------------------------------------------------------

  async clearAll(): Promise<void> {
    const db = this.ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        [STORES.MANIFESTS, STORES.FILE_PROGRESS, STORES.CHUNK_PROGRESS],
        'readwrite',
      );
      tx.objectStore(STORES.MANIFESTS).clear();
      tx.objectStore(STORES.FILE_PROGRESS).clear();
      tx.objectStore(STORES.CHUNK_PROGRESS).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

// Singleton export
export const syncDb = new SyncStateDB();
export default syncDb;

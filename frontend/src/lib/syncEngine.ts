/**
 * ORBIS Sync Engine
 * =================
 * Core sync engine with resumable chunked downloads, SHA-256 verification,
 * delta-based updates, and progress tracking.
 *
 * Optimised for low-connectivity / intermittent internet environments.
 */

import { syncDb, type SyncManifest, type FileManifestEntry, type ChunkEntry } from './syncDb';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_BASE = `http://${window.location.hostname || 'localhost'}:8000/api`;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;   // Base retry delay (exponential backoff)
const CONCURRENT_CHUNKS = 2;   // Max parallel chunk downloads (gentle on slow links)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncProgress {
  phase: 'idle' | 'checking' | 'downloading' | 'verifying' | 'complete' | 'error';
  totalFiles: number;
  completedFiles: number;
  currentFile: string;
  totalChunks: number;
  completedChunks: number;
  bytesDownloaded: number;
  bytesTotal: number;
  speed: number;             // bytes/sec (rolling average)
  eta: number;               // seconds remaining
  error?: string;
}

export interface DeltaPlan {
  new_files: string[];
  deleted_files: string[];
  modified_files: ModifiedFile[];
  unchanged_files: number;
  total_download_bytes: number;
}

interface ModifiedFile {
  path: string;
  new_size: number;
  old_size: number;
  changed_chunks: number[];
  total_chunks: number;
  chunk_size: number;
  download_bytes: number;
}

type ProgressCallback = (progress: SyncProgress) => void;

// ---------------------------------------------------------------------------
// SHA-256 verification using Web Crypto API
// ---------------------------------------------------------------------------

async function sha256(data: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Sync Engine
// ---------------------------------------------------------------------------

export class SyncEngine {
  private abortController: AbortController | null = null;
  private progress: SyncProgress = this.defaultProgress();
  private onProgress: ProgressCallback | null = null;
  private speedSamples: number[] = [];
  private lastSpeedTime = 0;
  private lastSpeedBytes = 0;

  private defaultProgress(): SyncProgress {
    return {
      phase: 'idle',
      totalFiles: 0,
      completedFiles: 0,
      currentFile: '',
      totalChunks: 0,
      completedChunks: 0,
      bytesDownloaded: 0,
      bytesTotal: 0,
      speed: 0,
      eta: 0,
    };
  }

  private emit() {
    this.onProgress?.({ ...this.progress });
  }

  private updateSpeed(newBytes: number) {
    const now = Date.now();
    if (this.lastSpeedTime > 0) {
      const elapsed = (now - this.lastSpeedTime) / 1000;
      if (elapsed > 0) {
        const byteDelta = newBytes - this.lastSpeedBytes;
        const instantSpeed = byteDelta / elapsed;
        this.speedSamples.push(instantSpeed);
        if (this.speedSamples.length > 10) this.speedSamples.shift();
        this.progress.speed = this.speedSamples.reduce((a, b) => a + b, 0) / this.speedSamples.length;
        const remaining = this.progress.bytesTotal - this.progress.bytesDownloaded;
        this.progress.eta = this.progress.speed > 0 ? remaining / this.progress.speed : 0;
      }
    }
    this.lastSpeedTime = now;
    this.lastSpeedBytes = newBytes;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Cancel an ongoing sync. */
  cancel() {
    this.abortController?.abort();
    this.progress.phase = 'idle';
    this.emit();
  }

  /** Get current progress (snapshot). */
  getProgress(): SyncProgress {
    return { ...this.progress };
  }

  /**
   * Full sync workflow:
   *  1. Fetch server manifest
   *  2. Load local manifest
   *  3. Compute delta
   *  4. Download changed/new chunks
   *  5. Verify integrity
   *  6. Update local manifest
   */
  async syncAll(onProgress: ProgressCallback): Promise<void> {
    this.onProgress = onProgress;
    this.progress = this.defaultProgress();
    this.abortController = new AbortController();
    this.speedSamples = [];
    this.lastSpeedTime = 0;
    this.lastSpeedBytes = 0;

    try {
      await syncDb.open();

      // Phase 1: Checking
      this.progress.phase = 'checking';
      this.emit();

      const serverManifest = await this.fetchServerManifest();
      const localManifest = await syncDb.getManifest();

      // Compute delta
      const delta = await this.computeDelta(localManifest, serverManifest);

      const filesToDownload = [
        ...delta.new_files.map(path => ({ path, chunks: 'all' as const })),
        ...delta.modified_files.map(mf => ({ path: mf.path, chunks: mf.changed_chunks })),
      ];

      if (filesToDownload.length === 0 && delta.deleted_files.length === 0) {
        this.progress.phase = 'complete';
        this.progress.totalFiles = delta.unchanged_files;
        this.progress.completedFiles = delta.unchanged_files;
        this.emit();
        await syncDb.saveManifest(serverManifest);
        return;
      }

      // Phase 2: Downloading
      this.progress.phase = 'downloading';
      this.progress.totalFiles = filesToDownload.length;
      this.progress.bytesTotal = delta.total_download_bytes;
      this.emit();

      // Build server file lookup
      const serverFileMap = new Map<string, FileManifestEntry>();
      for (const f of serverManifest.files) {
        serverFileMap.set(f.path, f);
      }

      for (let i = 0; i < filesToDownload.length; i++) {
        if (this.abortController.signal.aborted) throw new Error('Sync cancelled');

        const { path, chunks } = filesToDownload[i];
        this.progress.currentFile = path;
        this.emit();

        const fileManifest = serverFileMap.get(path);
        if (!fileManifest) continue;

        const chunksToDownload: ChunkEntry[] =
          chunks === 'all'
            ? fileManifest.chunks
            : fileManifest.chunks.filter(c => (chunks as number[]).includes(c.index));

        this.progress.totalChunks = chunksToDownload.length;
        this.progress.completedChunks = 0;

        // Check for already-downloaded chunks (resume support)
        const existingChunks = await syncDb.getChunksForFile(path);
        const doneSet = new Set(
          existingChunks.filter(c => c.status === 'done').map(c => c.chunkIndex),
        );

        const remaining = chunksToDownload.filter(c => !doneSet.has(c.index));
        this.progress.completedChunks = chunksToDownload.length - remaining.length;
        // Adjust bytesDownloaded for already-done chunks
        for (const c of chunksToDownload) {
          if (doneSet.has(c.index)) {
            this.progress.bytesDownloaded += c.size;
          }
        }
        this.emit();

        // Download remaining chunks with limited concurrency
        await this.downloadChunksBatch(path, remaining);

        // Mark file complete
        this.progress.completedFiles = i + 1;
        await syncDb.clearChunksForFile(path);
        await syncDb.clearFileProgress(path);
        this.emit();
      }

      // Phase 3: Verifying
      this.progress.phase = 'verifying';
      this.emit();

      // Save updated manifest
      await syncDb.saveManifest(serverManifest);

      // Phase 4: Complete
      this.progress.phase = 'complete';
      this.emit();

    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'Sync cancelled') {
        this.progress.phase = 'idle';
      } else {
        this.progress.phase = 'error';
        this.progress.error = err instanceof Error ? err.message : String(err);
      }
      this.emit();
    }
  }

  // -----------------------------------------------------------------------
  // Server communication
  // -----------------------------------------------------------------------

  private async fetchServerManifest(): Promise<SyncManifest> {
    const res = await fetch(`${API_BASE}/sync/manifest/`, {
      signal: this.abortController?.signal,
    });
    if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status}`);
    return res.json();
  }

  private async computeDelta(
    localManifest: SyncManifest | null,
    serverManifest: SyncManifest,
  ): Promise<DeltaPlan> {
    if (!localManifest || !localManifest.files?.length) {
      // First sync — everything is new
      return {
        new_files: serverManifest.files.map(f => f.path),
        deleted_files: [],
        modified_files: [],
        unchanged_files: 0,
        total_download_bytes: serverManifest.files.reduce((acc, f) => acc + f.size, 0),
      };
    }

    // Use server-side diff for accuracy
    const res = await fetch(`${API_BASE}/sync/diff/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(localManifest),
      signal: this.abortController?.signal,
    });

    if (!res.ok) throw new Error(`Diff computation failed: ${res.status}`);
    return res.json();
  }

  // -----------------------------------------------------------------------
  // Chunk downloading
  // -----------------------------------------------------------------------

  private async downloadChunksBatch(
    filePath: string,
    chunks: ChunkEntry[],
  ): Promise<void> {
    // Process chunks with limited concurrency
    let idx = 0;

    const downloadNext = async (): Promise<void> => {
      while (idx < chunks.length) {
        if (this.abortController?.signal.aborted) return;
        
        const chunk = chunks[idx++];
        const chunkData = await this.downloadSingleChunk(filePath, chunk);

        this.progress.completedChunks++;
        this.progress.bytesDownloaded += chunk.size;
        this.updateSpeed(this.progress.bytesDownloaded);
        this.emit();

        // Save progress for resume + actually save the bytes!
        await syncDb.saveChunkProgress({
          filePath,
          chunkIndex: chunk.index,
          status: 'done',
          data: chunkData,
          sha256: chunk.sha256,
          timestamp: Date.now(),
        });

        await syncDb.saveFileProgress({
          filePath,
          totalChunks: this.progress.totalChunks,
          completedChunks: this.progress.completedChunks,
          totalBytes: 0,
          downloadedBytes: this.progress.bytesDownloaded,
          status: 'downloading',
          startedAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    };

    // Launch concurrent workers
    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(CONCURRENT_CHUNKS, chunks.length); i++) {
      workers.push(downloadNext());
    }
    await Promise.all(workers);
  }

  private async downloadSingleChunk(
    filePath: string,
    chunk: ChunkEntry,
  ): Promise<ArrayBuffer> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const url = `${API_BASE}/sync/chunk/${encodeURIComponent(filePath)}?offset=${chunk.offset}&size=${chunk.size}`;
        const res = await fetch(url, {
          signal: this.abortController?.signal,
        });

        if (!res.ok) {
          throw new Error(`Chunk download failed: ${res.status}`);
        }

        const data = await res.arrayBuffer();

        // Verify SHA-256
        const serverHash = res.headers.get('X-Chunk-SHA256');
        const localHash = await sha256(data);

        if (serverHash && localHash !== serverHash) {
          throw new Error(
            `SHA-256 mismatch for ${filePath}[${chunk.index}]: ` +
            `expected ${serverHash}, got ${localHash}`,
          );
        }

        // Also verify against manifest hash
        if (localHash !== chunk.sha256) {
          throw new Error(
            `SHA-256 mismatch against manifest for ${filePath}[${chunk.index}]: ` +
            `expected ${chunk.sha256}, got ${localHash}`,
          );
        }

        return data;

      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (err instanceof Error && err.name === 'AbortError') {
          throw err; // Don't retry on cancel
        }

        if (attempt < MAX_RETRIES - 1) {
          await sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
        }
      }
    }

    throw lastError || new Error(`Failed to download chunk after ${MAX_RETRIES} retries`);
  }
}

// Singleton export
export const syncEngine = new SyncEngine();
export default syncEngine;

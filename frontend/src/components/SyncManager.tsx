/**
 * ORBIS Sync Manager UI Component
 * ================================
 * Beautiful clay-morphism UI for content sync management with
 * real-time progress tracking, resume support, and status badges.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Download,
  CheckCircle2,
  AlertTriangle,
  Pause,
  Play,
  Wifi,
  WifiOff,
  HardDrive,
  Zap,
  Clock,
  FileDown,
  XCircle,
} from 'lucide-react';
import { syncEngine, type SyncProgress } from '../lib/syncEngine';
import { syncDb } from '../lib/syncDb';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '--';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '--';
  return `${formatBytes(bytesPerSec)}/s`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SyncManagerProps {
  compact?: boolean;   // Show minimal badge in sidebar / navbar
}

const SyncManager = ({ compact = false }: SyncManagerProps) => {
  const [progress, setProgress] = useState<SyncProgress>({
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
  });
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Monitor online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load last sync time from IndexedDB and do a quick background check
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await syncDb.open();
        const localManifest = await syncDb.getManifest();
        
        if (localManifest?.generated_at) {
          if (mounted) {
            setLastSyncTime(new Date(localManifest.generated_at * 1000).toLocaleString());
          }
          
          // If online, do a quick silent check to see if we are already fully updated
          if (navigator.onLine) {
            const API_BASE = `http://${window.location.hostname || 'localhost'}:8000/api`;
            const res = await fetch(`${API_BASE}/sync/manifest/`);
            if (res.ok && mounted) {
              const serverManifest = await res.json();
              if (serverManifest.generated_at === localManifest.generated_at) {
                // We are perfectly up to date! Update UI to reflect this.
                setProgress(prev => ({
                  ...prev,
                  phase: 'complete',
                  totalFiles: serverManifest.files?.length || 0,
                  completedFiles: serverManifest.files?.length || 0,
                }));
              }
            }
          } else if (mounted) {
             // If offline and we have a manifest, assume we are complete for now
             setProgress(prev => ({
                ...prev,
                phase: 'complete',
                totalFiles: localManifest.files?.length || 0,
                completedFiles: localManifest.files?.length || 0,
             }));
          }
        }
      } catch (err) {
        console.error('Silent sync check failed:', err);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleSync = useCallback(async () => {
    if (progress.phase === 'downloading' || progress.phase === 'checking') {
      syncEngine.cancel();
      return;
    }

    await syncEngine.syncAll((p) => {
      setProgress(p);
      if (p.phase === 'complete') {
        setLastSyncTime(new Date().toLocaleString());
      }
    });
  }, [progress.phase]);

  const handleReset = useCallback(async () => {
    await syncDb.open();
    await syncDb.clearAll();
    setProgress({
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
    });
    setLastSyncTime(null);
  }, []);

  // Progress percentage
  const filePercent = progress.totalFiles > 0
    ? Math.round((progress.completedFiles / progress.totalFiles) * 100)
    : 0;
  const bytePercent = progress.bytesTotal > 0
    ? Math.round((progress.bytesDownloaded / progress.bytesTotal) * 100)
    : 0;

  const isActive = progress.phase === 'downloading' || progress.phase === 'checking' || progress.phase === 'verifying';

  // -----------------------------------------------------------------------
  // Compact badge (for navbar / sidebar)
  // -----------------------------------------------------------------------

  if (compact) {
    return (
      <button
        onClick={handleSync}
        disabled={!isOnline && progress.phase === 'idle'}
        className={`clay-btn px-3 py-1.5 flex items-center gap-2 text-xs font-grotesk font-bold transition-all ${
          progress.phase === 'complete'
            ? 'bg-mint text-[#121316]'
            : progress.phase === 'error'
              ? 'bg-coral text-white'
              : isActive
                ? 'bg-cobalt text-white'
                : 'bg-canvas text-[#121316] hover:bg-white'
        }`}
      >
        {isActive ? (
          <>
            <RefreshCw size={14} className="animate-spin" />
            <span>{bytePercent}%</span>
          </>
        ) : progress.phase === 'complete' ? (
          <>
            <CheckCircle2 size={14} />
            <span>Synced</span>
          </>
        ) : progress.phase === 'error' ? (
          <>
            <AlertTriangle size={14} />
            <span>Error</span>
          </>
        ) : (
          <>
            <Download size={14} />
            <span>Sync</span>
          </>
        )}
      </button>
    );
  }

  // -----------------------------------------------------------------------
  // Full panel
  // -----------------------------------------------------------------------

  return (
    <div className="clay-card bg-white p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`clay-circle p-2.5 ${
            isActive ? 'bg-cobalt text-white' : 'bg-canvas text-[#121316]'
          }`}>
            <HardDrive size={20} />
          </div>
          <div>
            <h3 className="font-syne font-extrabold text-lg text-[#121316]">Content Sync</h3>
            <div className="flex items-center gap-2 mt-0.5">
              {isOnline ? (
                <span className="flex items-center gap-1 text-xs font-grotesk text-green-600 font-semibold">
                  <Wifi size={12} /> Online
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs font-grotesk text-stone-400 font-semibold">
                  <WifiOff size={12} /> Offline
                </span>
              )}
              {lastSyncTime && (
                <span className="text-xs font-grotesk text-stone-400">
                  · Last sync: {lastSyncTime}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {progress.phase !== 'idle' && progress.phase !== 'complete' && (
            <button
              onClick={handleReset}
              className="clay-btn bg-canvas text-stone-500 hover:text-coral px-2 py-1.5 text-xs"
              title="Reset sync state"
            >
              <XCircle size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Status & Phase Indicator */}
      {progress.phase !== 'idle' && (
        <div className="space-y-3">
          {/* Phase badge */}
          <div className="flex items-center gap-2">
            <span className={`clay-chip px-2.5 py-0.5 text-[10px] uppercase font-bold tracking-wider ${
              progress.phase === 'checking' ? 'bg-gold text-[#121316]' :
              progress.phase === 'downloading' ? 'bg-cobalt text-white' :
              progress.phase === 'verifying' ? 'bg-lilac text-[#121316]' :
              progress.phase === 'complete' ? 'bg-mint text-[#121316]' :
              progress.phase === 'error' ? 'bg-coral text-white' :
              'bg-canvas text-[#121316]'
            }`}>
              {progress.phase === 'checking' && '🔍 Checking for updates'}
              {progress.phase === 'downloading' && '⬇️ Downloading'}
              {progress.phase === 'verifying' && '✅ Verifying integrity'}
              {progress.phase === 'complete' && '✨ All synced!'}
              {progress.phase === 'error' && '❌ Error'}
            </span>
          </div>

          {/* Progress bar */}
          {(progress.phase === 'downloading' || progress.phase === 'verifying') && (
            <div className="space-y-2">
              {/* Byte-level progress bar */}
              <div className="relative h-3 bg-stone-100 rounded-full overflow-hidden border-2 border-[#121316]">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-cobalt to-mint transition-all duration-300 ease-out"
                  style={{ width: `${bytePercent}%` }}
                />
                {/* Animated pulse on the leading edge */}
                {isActive && (
                  <div
                    className="absolute inset-y-0 w-8 bg-white/30 animate-pulse"
                    style={{ left: `calc(${bytePercent}% - 16px)` }}
                  />
                )}
              </div>

              {/* Stats row */}
              <div className="flex items-center justify-between text-xs font-grotesk text-stone-500">
                <span className="flex items-center gap-1">
                  <FileDown size={12} />
                  {formatBytes(progress.bytesDownloaded)} / {formatBytes(progress.bytesTotal)}
                </span>
                <span className="font-bold text-[#121316]">{bytePercent}%</span>
              </div>

              {/* Speed & ETA */}
              <div className="flex items-center gap-4 text-xs font-grotesk text-stone-500">
                <span className="flex items-center gap-1">
                  <Zap size={12} className="text-gold" />
                  {formatSpeed(progress.speed)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  ETA: {formatDuration(progress.eta)}
                </span>
                <span>
                  Files: {progress.completedFiles}/{progress.totalFiles}
                </span>
              </div>

              {/* Current file */}
              {progress.currentFile && (
                <div className="clay-card-sm bg-canvas p-2 text-xs font-grotesk text-stone-600 truncate">
                  <span className="font-bold text-cobalt mr-1">Syncing:</span>
                  {progress.currentFile.split('/').pop()}
                  <span className="text-stone-400 ml-2">
                    (chunk {progress.completedChunks}/{progress.totalChunks})
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Error message */}
          {progress.phase === 'error' && progress.error && (
            <div className="clay-card-sm bg-coral/10 border-l-4 border-coral p-3 text-sm text-coral font-jakarta">
              {progress.error}
            </div>
          )}

          {/* Complete message */}
          {progress.phase === 'complete' && (
            <div className="clay-card-sm bg-mint/20 border-l-4 border-mint p-3 flex items-center gap-2">
              <CheckCircle2 size={18} className="text-green-600" />
              <span className="text-sm font-jakarta font-medium text-[#121316]">
                All content is up to date! ({progress.totalFiles} files verified)
              </span>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSync}
          disabled={!isOnline && progress.phase === 'idle'}
          className={`clay-btn flex-1 py-3 flex items-center justify-center gap-2 text-sm font-grotesk font-bold transition-all ${
            isActive
              ? 'bg-coral text-white hover:bg-red-600'
              : progress.phase === 'complete'
                ? 'bg-mint text-[#121316] hover:bg-green-300'
                : 'bg-cobalt text-white hover:bg-blue-700'
          } ${!isOnline && progress.phase === 'idle' ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isActive ? (
            <>
              <Pause size={18} />
              <span>Cancel Sync</span>
            </>
          ) : progress.phase === 'complete' ? (
            <>
              <RefreshCw size={18} />
              <span>Re-check for Updates</span>
            </>
          ) : progress.phase === 'error' ? (
            <>
              <Play size={18} />
              <span>Retry Sync</span>
            </>
          ) : (
            <>
              <Download size={18} />
              <span>Sync Content Now</span>
            </>
          )}
        </button>
      </div>

      {/* Idle state hint */}
      {progress.phase === 'idle' && (
        <p className="text-xs font-jakarta text-stone-400 text-center">
          {isOnline
            ? 'Tap "Sync Content Now" to download the latest lessons, videos, and notes.'
            : 'Connect to the internet to sync new content. Your existing content is available offline.'}
        </p>
      )}
    </div>
  );
};

export default SyncManager;

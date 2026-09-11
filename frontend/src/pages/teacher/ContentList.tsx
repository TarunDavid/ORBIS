import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import TeacherHeader from '../../components/TeacherHeader';
import ConfirmModal from '../../components/ConfirmModal';
import {
  FileText, Film, Presentation, BookOpen, Search,
  Trash2, RotateCcw, AlertCircle, CheckCircle, Clock,
} from 'lucide-react';

interface ContentAssetItem {
  id: number;
  subject_name: string;
  chapter_title: string;
  grade_name: string;
  content_type: string;
  filename: string;
  size_bytes: number;
  sha256: string;
  version: number;
  uploaded_by_name: string;
  uploaded_at: string;
  status: string;
  deleted_at: string | null;
  deletion_reason: string;
  days_until_purge: number | null;
}

const CONTENT_TYPE_ICONS: Record<string, React.ComponentType<any>> = {
  video: Film,
  notes: FileText,
  ppt: Presentation,
  textbook: BookOpen,
};

const STATUS_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  active: { label: 'ACTIVE', bg: 'bg-mint', text: 'text-structural' },
  soft_deleted: { label: 'SOFT DELETED', bg: 'bg-gold', text: 'text-structural' },
  purged: { label: 'PURGED', bg: 'bg-coral', text: 'text-white' },
};

const ContentList = () => {
  const navigate = useNavigate();
  const [assets, setAssets] = useState<ContentAssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Confirmation modal state
  const [deleteModal, setDeleteModal] = useState<{
    asset: ContentAssetItem;
    mode: 'soft' | 'hard';
  } | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  useEffect(() => {
    fetchAssets();
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const fetchAssets = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (typeFilter) params.append('content_type', typeFilter);
      const res = await api.get(`teacher/content/?${params.toString()}`);
      setAssets(res.data);
    } catch (err: any) {
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        navigate('/teacher');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteModal) return;
    const { asset, mode } = deleteModal;

    try {
      await api.delete(`teacher/content/${asset.id}/?mode=${mode}`, {
        data: { reason: deleteReason },
      });
      setToast({ message: `${asset.filename} ${mode === 'hard' ? 'permanently deleted' : 'removed'}`, type: 'success' });
      fetchAssets();
    } catch (err: any) {
      setToast({ message: err?.response?.data?.error || 'Delete failed', type: 'error' });
    } finally {
      setDeleteModal(null);
      setDeleteReason('');
    }
  };

  const handleRestore = async (asset: ContentAssetItem) => {
    try {
      await api.post(`teacher/content/${asset.id}/restore/`);
      setToast({ message: `${asset.filename} restored successfully`, type: 'success' });
      fetchAssets();
    } catch (err: any) {
      setToast({ message: err?.response?.data?.error || 'Restore failed', type: 'error' });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Client-side search filter
  const filtered = assets.filter(a =>
    a.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.subject_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.chapter_title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-canvas">
      <TeacherHeader />

      <div className="max-w-6xl mx-auto p-6 md:p-10">
        {/* Toast */}
        {toast && (
          <div className={`profile-toast ${toast.type === 'success' ? 'profile-toast-success' : 'profile-toast-error'}`}>
            {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            {toast.message}
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div>
            <h1 className="font-syne text-3xl font-[800] text-structural tracking-tight">Content Library</h1>
            <p className="text-on-surface-variant font-jakarta mt-1">
              {filtered.length} content item{filtered.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => navigate('/teacher/content/upload')}
            className="clay-btn bg-cobalt text-white px-5 py-2 text-sm"
          >
            + Upload New
          </button>
        </div>

        {/* Filters */}
        <div className="clay-card bg-white p-4 mb-6">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search files, subjects, chapters..."
                className="clay-input w-full pl-9 pr-4 py-2 text-sm"
                id="content-search"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="clay-select px-3 py-2 text-sm"
              id="content-status-filter"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="soft_deleted">Soft Deleted</option>
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="clay-select px-3 py-2 text-sm"
              id="content-type-filter"
            >
              <option value="">All Types</option>
              <option value="video">Video</option>
              <option value="notes">Notes</option>
              <option value="ppt">Presentation</option>
              <option value="textbook">Textbook</option>
            </select>
          </div>
        </div>

        {/* Content List */}
        {loading ? (
          <div className="flex flex-col items-center py-16 gap-4">
            <div className="clay-spinner"></div>
            <p className="font-grotesk font-bold text-xs uppercase tracking-wider text-on-surface-variant">
              Loading Content...
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="clay-card bg-white p-10 text-center">
            <FileText size={48} className="text-on-surface-variant mx-auto mb-4 opacity-30" />
            <p className="font-syne text-lg font-bold text-structural">No content found</p>
            <p className="text-on-surface-variant text-sm font-jakarta mt-1">
              {searchTerm ? 'Try a different search term' : 'Upload your first content to get started'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((asset) => {
              const Icon = CONTENT_TYPE_ICONS[asset.content_type] || FileText;
              const statusStyle = STATUS_STYLES[asset.status] || STATUS_STYLES.active;

              return (
                <div key={asset.id} className="clay-card bg-white p-4 flex items-center gap-4 group">
                  {/* Type Icon */}
                  <div className="w-10 h-10 clay-circle bg-canvas flex items-center justify-center flex-shrink-0">
                    <Icon size={18} className="text-cobalt" />
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-jakarta font-bold text-sm text-structural truncate">
                        {asset.filename}
                      </span>
                      <span className={`clay-chip ${statusStyle.bg} ${statusStyle.text} px-2 py-0 text-[9px]`}>
                        {statusStyle.label}
                      </span>
                      {asset.version > 1 && (
                        <span className="clay-chip bg-lilac text-white px-2 py-0 text-[9px]">
                          v{asset.version}
                        </span>
                      )}
                    </div>
                    <p className="text-on-surface-variant text-xs font-jakarta mt-0.5">
                      {asset.grade_name} · {asset.subject_name} · {asset.chapter_title}
                    </p>
                    <p className="text-on-surface-variant text-xs font-jakarta mt-0.5">
                      {formatFileSize(asset.size_bytes)} · Uploaded by {asset.uploaded_by_name} · {formatTimestamp(asset.uploaded_at)}
                    </p>
                    {asset.status === 'soft_deleted' && asset.days_until_purge !== null && (
                      <p className="text-gold-dark text-xs font-grotesk font-bold mt-1 flex items-center gap-1">
                        <Clock size={12} />
                        {asset.days_until_purge} day{asset.days_until_purge !== 1 ? 's' : ''} until auto-purge
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {asset.status === 'active' && (
                      <>
                        <button
                          onClick={() => setDeleteModal({ asset, mode: 'soft' })}
                          className="clay-btn bg-gold text-structural px-3 py-1.5 text-xs flex items-center gap-1"
                          title="Soft delete (reversible)"
                        >
                          <Trash2 size={12} />
                          <span className="hidden sm:inline">Remove</span>
                        </button>
                        <button
                          onClick={() => setDeleteModal({ asset, mode: 'hard' })}
                          className="clay-btn bg-coral text-white px-3 py-1.5 text-xs flex items-center gap-1"
                          title="Hard delete (permanent)"
                        >
                          <Trash2 size={12} />
                          <span className="hidden sm:inline">Purge</span>
                        </button>
                      </>
                    )}
                    {asset.status === 'soft_deleted' && (
                      <>
                        <button
                          onClick={() => handleRestore(asset)}
                          className="clay-btn bg-mint text-structural px-3 py-1.5 text-xs flex items-center gap-1"
                          title="Restore content"
                        >
                          <RotateCcw size={12} />
                          <span className="hidden sm:inline">Restore</span>
                        </button>
                        <button
                          onClick={() => setDeleteModal({ asset, mode: 'hard' })}
                          className="clay-btn bg-coral text-white px-3 py-1.5 text-xs flex items-center gap-1"
                          title="Permanently delete"
                        >
                          <Trash2 size={12} />
                          <span className="hidden sm:inline">Purge</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModal && (
        <ConfirmModal
          title={deleteModal.mode === 'hard' ? 'Permanently Delete?' : 'Remove Content?'}
          message={
            deleteModal.mode === 'hard'
              ? `This will permanently delete "${deleteModal.asset.filename}" from disk and remove it from all student devices on next sync. This action CANNOT be undone.`
              : `This will hide "${deleteModal.asset.filename}" from students. You can restore it within 7 days.`
          }
          confirmLabel={deleteModal.mode === 'hard' ? 'Delete Forever' : 'Remove'}
          variant={deleteModal.mode === 'hard' ? 'danger' : 'warning'}
          onConfirm={handleDelete}
          onCancel={() => { setDeleteModal(null); setDeleteReason(''); }}
        >
          <div className="mt-2 mb-4">
            <label className="label-text text-[10px] text-on-surface-variant">Reason (optional)</label>
            <input
              type="text"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="e.g., Replaced with updated version"
              className="clay-input w-full px-3 py-2 text-sm mt-1"
            />
          </div>
        </ConfirmModal>
      )}
    </div>
  );
};

export default ContentList;

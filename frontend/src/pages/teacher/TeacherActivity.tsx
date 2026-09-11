import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import TeacherHeader from '../../components/TeacherHeader';
import { Activity, Upload, Trash2, RotateCcw, AlertTriangle } from 'lucide-react';

interface ActivityItem {
  id: number;
  teacher_name: string;
  action: string;
  asset_filename: string;
  subject_name: string;
  chapter_title: string;
  timestamp: string;
  notes: string;
}

const ACTION_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<any> }> = {
  upload: { label: 'Uploaded', color: 'bg-mint', icon: Upload },
  remove: { label: 'Removed', color: 'bg-gold', icon: Trash2 },
  restore: { label: 'Restored', color: 'bg-cobalt', icon: RotateCcw },
  hard_delete: { label: 'Purged', color: 'bg-coral', icon: AlertTriangle },
};

const TeacherActivity = () => {
  const navigate = useNavigate();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 25;

  useEffect(() => {
    fetchActivity();
  }, [offset]);

  const fetchActivity = async () => {
    setLoading(true);
    try {
      const res = await api.get(`teacher/activity/?limit=${limit}&offset=${offset}`);
      setActivities(res.data.results || []);
      setTotal(res.data.total || 0);
    } catch (err: any) {
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        navigate('/teacher');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    let relative = '';
    if (mins < 1) relative = 'Just now';
    else if (mins < 60) relative = `${mins}m ago`;
    else if (hours < 24) relative = `${hours}h ago`;
    else relative = d.toLocaleDateString();

    return {
      relative,
      full: d.toLocaleString(),
    };
  };

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="min-h-screen bg-canvas">
      <TeacherHeader />

      <div className="max-w-4xl mx-auto p-6 md:p-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 clay-circle bg-lilac flex items-center justify-center">
            <Activity size={18} className="text-white" />
          </div>
          <div>
            <h1 className="font-syne text-3xl font-[800] text-structural tracking-tight">Activity Log</h1>
            <p className="text-on-surface-variant font-jakarta text-sm mt-0.5">
              {total} total action{total !== 1 ? 's' : ''} recorded
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center py-16 gap-4">
            <div className="clay-spinner"></div>
            <p className="font-grotesk font-bold text-xs uppercase tracking-wider text-on-surface-variant">
              Loading Activity...
            </p>
          </div>
        ) : activities.length === 0 ? (
          <div className="clay-card bg-white p-10 text-center">
            <Activity size={48} className="text-on-surface-variant mx-auto mb-4 opacity-30" />
            <p className="font-syne text-lg font-bold text-structural">No activity yet</p>
            <p className="text-on-surface-variant text-sm font-jakarta mt-1">
              Upload content to see activity here
            </p>
          </div>
        ) : (
          <>
            {/* Activity Timeline */}
            <div className="space-y-0">
              {activities.map((item, i) => {
                const config = ACTION_CONFIG[item.action] || ACTION_CONFIG.upload;
                const ActionIcon = config.icon;
                const ts = formatTimestamp(item.timestamp);

                return (
                  <div key={item.id} className="flex gap-4 relative">
                    {/* Timeline line */}
                    {i < activities.length - 1 && (
                      <div className="absolute left-[19px] top-[40px] bottom-0 w-[2px] bg-canvas-dim"></div>
                    )}

                    {/* Icon */}
                    <div className={`w-10 h-10 clay-circle ${config.color} flex items-center justify-center flex-shrink-0 z-10`}>
                      <ActionIcon size={16} className="text-white" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 pb-6">
                      <div className="clay-card-sm bg-white p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-jakarta text-sm text-structural">
                              <span className="font-bold">{item.teacher_name}</span>
                              <span className="text-on-surface-variant"> {config.label.toLowerCase()} </span>
                              <span className="font-bold">{item.asset_filename}</span>
                            </p>
                            {(item.subject_name || item.chapter_title) && (
                              <p className="text-on-surface-variant text-xs mt-1">
                                {[item.subject_name, item.chapter_title].filter(Boolean).join(' · ')}
                              </p>
                            )}
                            {item.notes && (
                              <p className="text-on-surface-variant text-xs mt-1 italic">
                                "{item.notes}"
                              </p>
                            )}
                          </div>
                          <span
                            className="text-on-surface-variant text-[10px] font-grotesk font-bold uppercase tracking-wide flex-shrink-0"
                            title={ts.full}
                          >
                            {ts.relative}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-6">
                <button
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0}
                  className="clay-btn bg-white text-structural px-4 py-2 text-xs"
                >
                  ← Previous
                </button>
                <span className="font-grotesk font-bold text-xs text-on-surface-variant uppercase tracking-wide">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  onClick={() => setOffset(offset + limit)}
                  disabled={currentPage >= totalPages}
                  className="clay-btn bg-white text-structural px-4 py-2 text-xs"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default TeacherActivity;
